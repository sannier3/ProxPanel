import { EventEmitter } from 'events';

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const subscribers = new Map();
const bus = new EventEmitter();
bus.setMaxListeners(100);

export function subscribeSession(sessionId, res) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId).add(res);
  res.on('close', () => {
    subscribers.get(sessionId)?.delete(res);
    if (subscribers.get(sessionId)?.size === 0) subscribers.delete(sessionId);
  });
}

export function publishToSession(sessionId, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const set = subscribers.get(sessionId);
  if (!set?.size) return;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
}

export function onCollectorTick(handler) {
  bus.on('collector:tick', handler);
}

export function emitCollectorTick(sessionId, payload) {
  bus.emit('collector:tick', sessionId, payload);
  publishToSession(sessionId, 'resources', payload);
}

export function publishVmStats(sessionId, vmstats) {
  publishToSession(sessionId, 'vmstats', { vmstats, at: Date.now() });
}

export function getSubscriberCount(sessionId) {
  return subscribers.get(sessionId)?.size ?? 0;
}

/** @type {Map<string, Array<{type:string,node:string,vmid:number}>>} */
const statsScopes = new Map();

export function setStatsScope(sessionId, running) {
  if (!running?.length) {
    statsScopes.delete(sessionId);
    return;
  }
  statsScopes.set(sessionId, running);
}

export function getStatsScope(sessionId) {
  return statsScopes.get(sessionId) ?? null;
}

export function clearStatsScope(sessionId) {
  statsScopes.delete(sessionId);
}
