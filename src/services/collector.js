import { config } from '../config.js';
import { proxmoxApiCall } from './proxmox-client.js';
import { parseClusterResources } from '../lib/parse-resources.js';
import { filterGuestsOnOfflineNodes } from '../lib/online-nodes.js';
import { setSessionResources } from './cache.js';
import { emitCollectorTick, getStatsScope, publishVmStats, getSubscriberCount } from './realtime-hub.js';
import { fetchVmStats } from '../handlers/vmstats-handler.js';

/** @type {Map<string, { url: string, ticket: object }>} */
const activeSessions = new Map();

export function registerCollectorSession(sessionId, url, ticket) {
  activeSessions.set(sessionId, { url, ticket });
}

export function unregisterCollectorSession(sessionId) {
  activeSessions.delete(sessionId);
}

async function collectResourcesForSession(sessionId, { url, ticket }) {
  const allResources = await proxmoxApiCall(url, ticket, '/cluster/resources');
  if (!allResources) return null;

  const parsed = filterGuestsOnOfflineNodes(parseClusterResources(allResources));
  setSessionResources(sessionId, allResources, parsed);

  const summary = {
    at: Date.now(),
    nodes: parsed.nodes?.length ?? 0,
    vms: parsed.vms?.length ?? 0,
    containers: parsed.containers?.length ?? 0,
    running:
      (parsed.vms?.filter((v) => v.status === 'running').length ?? 0) +
      (parsed.containers?.filter((c) => c.status === 'running').length ?? 0),
  };

  emitCollectorTick(sessionId, summary);
  return parsed;
}

async function pushScopedStats(sessionId, { url, ticket }) {
  if (getSubscriberCount(sessionId) === 0) return;
  const scope = getStatsScope(sessionId);
  if (!scope?.length) return;

  const { vmstats } = await fetchVmStats(url, ticket, sessionId, scope);
  if (vmstats?.length) publishVmStats(sessionId, vmstats);
}

export function startCollector() {
  if (!config.collector.enabled || !config.prod) return { resources: null, stats: null };

  const resourcesInterval = setInterval(async () => {
    for (const [sessionId, ctx] of activeSessions) {
      try {
        await collectResourcesForSession(sessionId, ctx);
      } catch (err) {
        console.error(`Collector resources ${sessionId}:`, err.message);
      }
    }
  }, config.collector.resourcesIntervalMs);

  let statsInterval = null;
  if (config.realtime.enabled) {
    statsInterval = setInterval(async () => {
      for (const [sessionId, ctx] of activeSessions) {
        try {
          await pushScopedStats(sessionId, ctx);
        } catch (err) {
          console.error(`Collector stats ${sessionId}:`, err.message);
        }
      }
    }, config.realtime.statsPushIntervalMs);
  }

  console.log(
    `Collector: inventaire ${config.collector.resourcesIntervalMs}ms` +
      (statsInterval ? `, stats SSE ${config.realtime.statsPushIntervalMs}ms` : '')
  );

  return { resources: resourcesInterval, stats: statsInterval };
}

export function stopCollector(timers) {
  if (timers?.resources) clearInterval(timers.resources);
  if (timers?.stats) clearInterval(timers.stats);
}
