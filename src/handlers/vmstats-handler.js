import { proxmoxApiCallMulti } from '../services/proxmox-client.js';
import { config } from '../config.js';
import { partitionCachedStats, setCachedVmStats } from '../services/stats-cache.js';
import { buildVmStatEntry, normalizeRunningList } from '../lib/vmstats.js';
import { getCachedResources } from '../services/cache.js';
import { filterRunningListByOnlineNodes } from '../lib/online-nodes.js';

export async function fetchVmStats(url, ticket, sessionId, runningList) {
  const cachedResources = getCachedResources(sessionId, config.collector.resourcesIntervalMs);
  const scopedRunning = filterRunningListByOnlineNodes(
    runningList,
    cachedResources?.parsed
  );
  const list = normalizeRunningList(scopedRunning, config.vmstats.maxPerRequest);
  if (list.length === 0) {
    return { vmstats: [], meta: { requested: 0, fromCache: 0, fetched: 0, capped: false } };
  }

  const { cached, missing } = partitionCachedStats(
    sessionId,
    list,
    config.vmstats.cacheTtlMs
  );

  const statsPaths = [];
  const runningVMs = {};
  const runningContainers = {};

  for (const item of missing) {
    const key =
      item.type === 'lxc'
        ? `${item.node}_lxc_${item.vmid}`
        : `${item.node}_qemu_${item.vmid}`;
    if (item.type === 'lxc') {
      runningContainers[key] = { node: item.node, vmid: item.vmid };
      statsPaths.push({
        key,
        path: `/nodes/${item.node}/lxc/${item.vmid}/status/current`,
      });
    } else {
      runningVMs[key] = { node: item.node, vmid: item.vmid };
      statsPaths.push({
        key,
        path: `/nodes/${item.node}/qemu/${item.vmid}/status/current`,
      });
    }
  }

  const statsResults =
    statsPaths.length > 0
      ? await proxmoxApiCallMulti(url, ticket, statsPaths)
      : {};

  const fetched = [];

  for (const [key, vmData] of Object.entries(runningVMs)) {
    const entry = buildVmStatEntry('vm', vmData, statsResults[key]);
    if (entry) {
      setCachedVmStats(sessionId, vmData.node, vmData.vmid, 'vm', entry);
      fetched.push(entry);
    }
  }

  for (const [key, ctData] of Object.entries(runningContainers)) {
    const entry = buildVmStatEntry('lxc', ctData, statsResults[key]);
    if (entry) {
      setCachedVmStats(sessionId, ctData.node, ctData.vmid, 'lxc', entry);
      fetched.push(entry);
    }
  }

  const vmstats = [...cached, ...fetched];
  const originalLen = Array.isArray(runningList) ? runningList.length : 0;

  return {
    vmstats,
    meta: {
      requested: originalLen,
      served: list.length,
      fromCache: cached.length,
      fetched: fetched.length,
      capped: originalLen > config.vmstats.maxPerRequest,
      maxPerRequest: config.vmstats.maxPerRequest,
    },
  };
}
