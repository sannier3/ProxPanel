import { proxmoxApiCall } from '../services/proxmox-client.js';
import { QEMU_CONFIG_SCHEMA } from '../lib/qemu-config-schema.js';
import { LXC_CONFIG_SCHEMA } from '../lib/lxc-config-schema.js';

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

/** Extrait un identifiant lisible depuis une entrée API (string ou objet). */
function extractName(item) {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') {
    const name = item.name ?? item.id ?? item.machine ?? item.model ?? '';
    return String(name).trim();
  }
  return '';
}

function uniqueSorted(names) {
  return [...new Set(names.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

function parseCpuModels(cap) {
  if (!cap) return [];
  if (Array.isArray(cap)) return uniqueSorted(cap.map(extractName));
  if (cap.models) {
    if (Array.isArray(cap.models)) return uniqueSorted(cap.models.map(extractName));
    if (typeof cap.models === 'object') return uniqueSorted(Object.keys(cap.models));
  }
  if (typeof cap === 'object') {
    const fromValues = uniqueSorted(Object.values(cap).map(extractName));
    if (fromValues.length) return fromValues;
    return uniqueSorted(Object.keys(cap));
  }
  return [];
}

function parseMachines(cap) {
  if (!cap) return [];
  if (Array.isArray(cap)) return uniqueSorted(cap.map(extractName));
  if (cap.machines && Array.isArray(cap.machines)) {
    return uniqueSorted(cap.machines.map(extractName));
  }
  if (typeof cap === 'object') {
    const fromValues = uniqueSorted(Object.values(cap).map(extractName));
    if (fromValues.length) return fromValues;
    return uniqueSorted(Object.keys(cap));
  }
  return [];
}

/**
 * Options dynamiques Proxmox pour l'éditeur de config (par nœud).
 */
export async function fetchConfigOptions(url, ticket, node) {
  if (!node) return { error: 'Nœud requis' };

  const [network, storage, nodeStatus, cpuCap, machineCap] = await Promise.all([
    proxmoxApiCall(url, ticket, `/nodes/${node}/network`),
    proxmoxApiCall(url, ticket, `/nodes/${node}/storage`),
    proxmoxApiCall(url, ticket, `/nodes/${node}/status`),
    proxmoxApiCall(url, ticket, `/nodes/${node}/capabilities/qemu/cpu`).catch(() => null),
    proxmoxApiCall(url, ticket, `/nodes/${node}/capabilities/qemu/machines`).catch(() => null),
  ]);

  const bridges = new Set();
  for (const iface of asArray(network)) {
    const name = iface.iface ?? iface.name ?? '';
    const type = iface.type ?? '';
    if (name && (type === 'bridge' || name.startsWith('vmbr'))) {
      bridges.add(name);
    }
  }

  const storages = [];
  for (const s of asArray(storage)) {
    const name = s.storage ?? s.id ?? '';
    if (!name) continue;
    const content = s.content ?? '';
    storages.push({
      name,
      type: s.type ?? 'unknown',
      content: typeof content === 'string' ? content.split(',').map((c) => c.trim()) : [],
      enabled: parseInt(s.enabled ?? 1, 10) === 1,
      shared: parseInt(s.shared ?? 0, 10) === 1,
    });
  }

  const cpuModels = parseCpuModels(cpuCap);
  const machines = parseMachines(machineCap);

  const maxcpu = parseInt(nodeStatus?.cpuinfo?.cpus ?? nodeStatus?.maxcpu ?? 0, 10);
  const maxmemBytes = parseInt(nodeStatus?.memory?.total ?? nodeStatus?.maxmem ?? 0, 10);
  const maxmemMb = maxmemBytes > 0 ? Math.floor(maxmemBytes / 1024 / 1024) : 0;

  return {
    node,
    bridges: [...bridges].sort(),
    storages,
    cpuModels: cpuModels.length ? cpuModels : ['host', 'kvm64', 'qemu64'],
    machines,
    maxcpu: maxcpu || null,
    maxmemMb: maxmemMb || null,
    schema: { vm: QEMU_CONFIG_SCHEMA, lxc: LXC_CONFIG_SCHEMA },
  };
}
