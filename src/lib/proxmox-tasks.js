/**
 * Normalisation des tâches Proxmox (UPID, statuts, nœud).
 */

/** @param {string} upid */
export function parseUpid(upid) {
  if (!upid || typeof upid !== 'string' || !upid.startsWith('UPID:')) {
    return { node: '', type: '', user: '' };
  }
  const parts = upid.split(':');
  return {
    node: parts[1] || '',
    type: parts[5] || '',
    user: parts[6] || '',
  };
}

/**
 * @param {object} task
 * @param {string} [nodeHint]
 */
export function normalizeProxmoxTask(task, nodeHint = '') {
  if (!task || typeof task !== 'object') return null;

  const upid = task.upid || '';
  if (!upid) return null;

  const fromUpid = parseUpid(upid);
  const node = task.node || nodeHint || fromUpid.node || '';

  let status = String(task.status || 'unknown').toLowerCase();
  const exitstatus = task.exitstatus ?? task.exitStatus ?? null;

  if (status === 'ok') status = 'stopped';
  if (status === 'running') {
    // keep
  } else if (exitstatus && String(exitstatus).toUpperCase() !== 'OK') {
    status = 'error';
  } else if (status === 'stopped' || exitstatus === 'OK' || task.endtime) {
    status = exitstatus === 'OK' || !exitstatus ? 'stopped' : status;
  }

  return {
    upid,
    node,
    type: task.type || fromUpid.type || '',
    id: task.id ?? '',
    user: task.user || fromUpid.user || '',
    starttime: Number(task.starttime) || 0,
    endtime: task.endtime != null ? Number(task.endtime) : null,
    status,
    exitstatus: exitstatus != null ? String(exitstatus) : null,
  };
}

/** @param {object[]} tasks */
export function mergeTasksByUpid(tasks) {
  const byUpid = new Map();
  for (const raw of tasks) {
    const t = raw?.upid ? raw : null;
    if (!t) continue;
    const existing = byUpid.get(t.upid);
    if (!existing) {
      byUpid.set(t.upid, t);
      continue;
    }
    if (!existing.node && t.node) existing.node = t.node;
    if (!existing.endtime && t.endtime) existing.endtime = t.endtime;
    if (existing.status === 'unknown' && t.status !== 'unknown') existing.status = t.status;
  }
  return [...byUpid.values()].sort((a, b) => (b.starttime ?? 0) - (a.starttime ?? 0));
}
