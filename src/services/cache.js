/**
 * Cache mémoire par session utilisateur (inventaire + résultats agrégés).
 */
const store = new Map();

export function getSessionCache(sessionId) {
  if (!store.has(sessionId)) {
    store.set(sessionId, {
      resources: null,
      resourcesAt: 0,
      parsed: null,
      lastError: null,
    });
  }
  return store.get(sessionId);
}

export function setSessionResources(sessionId, allResources, parsed) {
  const entry = getSessionCache(sessionId);
  entry.resources = allResources;
  entry.parsed = parsed;
  entry.resourcesAt = Date.now();
  entry.lastError = null;
}

export function getCachedResources(sessionId, maxAgeMs) {
  const entry = getSessionCache(sessionId);
  if (!entry.resources || !entry.resourcesAt) return null;
  if (Date.now() - entry.resourcesAt > maxAgeMs) return null;
  return { all: entry.resources, parsed: entry.parsed, fetchedAt: entry.resourcesAt };
}

export function clearSessionCache(sessionId) {
  store.delete(sessionId);
}

export function getActiveSessionIds() {
  return [...store.keys()];
}
