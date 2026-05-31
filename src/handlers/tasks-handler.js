import { proxmoxApiCall, proxmoxApiCallMulti } from '../services/proxmox-client.js';
import { mergeTasksByUpid, normalizeProxmoxTask } from '../lib/proxmox-tasks.js';

const CLUSTER_TASKS_LIMIT = 2000;
const NODE_TASKS_LIMIT = 500;

/**
 * Récupère les tâches visibles pour l'utilisateur connecté (filtrage ACL côté Proxmox).
 * @param {string} url
 * @param {{ ticket: string }} ticket
 * @param {{ parsed?: { nodes?: Array<{ node?: string, status?: string }> } }} resources
 */
export async function fetchProxmoxTasks(url, ticket, resources) {
  const normalized = [];

  const clusterRaw = await proxmoxApiCall(
    url,
    ticket,
    `/cluster/tasks?limit=${CLUSTER_TASKS_LIMIT}`
  );

  if (Array.isArray(clusterRaw)) {
    for (const row of clusterRaw) {
      const t = normalizeProxmoxTask(row);
      if (t) normalized.push(t);
    }
  }

  const nodeTasks = await fetchNodeTasks(url, ticket, resources);
  normalized.push(...nodeTasks);

  return mergeTasksByUpid(normalized);
}

async function fetchNodeTasks(url, ticket, resources) {
  const nodes = resources?.parsed?.nodes ?? [];
  if (!nodes.length) return [];

  const taskPaths = nodes
    .filter((n) => n.node)
    .map((n, i) => ({
      key: `tasks_${i}`,
      path: `/nodes/${n.node}/tasks?limit=${NODE_TASKS_LIMIT}`,
      nodeName: n.node,
    }));

  if (!taskPaths.length) return [];

  const taskResults = await proxmoxApiCallMulti(
    url,
    ticket,
    taskPaths.map(({ key, path }) => ({ key, path }))
  );

  const out = [];
  taskPaths.forEach(({ key, nodeName }) => {
    const rows = taskResults[key];
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const t = normalizeProxmoxTask(row, nodeName);
      if (t) out.push(t);
    }
  });

  return out;
}
