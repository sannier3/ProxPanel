/**
 * Cache court terme des stats VM (status/current) par session + clé VM.
 */
const store = new Map();

function vmKey(node, vmid, type) {
  return `${node}:${type}:${vmid}`;
}

export function getCachedVmStats(sessionId, node, vmid, type, maxAgeMs) {
  const entry = store.get(sessionId)?.get(vmKey(node, vmid, type));
  if (!entry) return null;
  if (Date.now() - entry.at > maxAgeMs) return null;
  return entry.data;
}

export function setCachedVmStats(sessionId, node, vmid, type, data) {
  if (!store.has(sessionId)) store.set(sessionId, new Map());
  store.get(sessionId).set(vmKey(node, vmid, type), { data, at: Date.now() });
}

export function clearSessionStatsCache(sessionId) {
  store.delete(sessionId);
}

/**
 * @param {string} sessionId
 * @param {Array<{node:string,vmid:number,type:string}>} list
 * @param {number} maxAgeMs
 */
export function partitionCachedStats(sessionId, list, maxAgeMs) {
  const cached = [];
  const missing = [];
  for (const item of list) {
    const hit = getCachedVmStats(sessionId, item.node, item.vmid, item.type, maxAgeMs);
    if (hit) cached.push(hit);
    else missing.push(item);
  }
  return { cached, missing };
}
