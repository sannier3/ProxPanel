/**
 * Construction des entrées vmstats depuis status/current Proxmox.
 */
export function buildVmStatEntry(type, vmData, stats) {
  if (!stats) return null;

  const cpu = parseFloat(stats.cpu ?? 0) * 100;
  const memUsed = parseFloat(stats.mem ?? 0);
  const memMax = parseFloat(stats.maxmem ?? 1);
  const ram = memMax > 0 ? (memUsed / memMax) * 100 : 0;

  if (type === 'vm') {
    let disk = 0;
    if (stats.disk != null && !Number.isNaN(stats.disk)) {
      disk = parseFloat(stats.disk);
    }
    return {
      id: vmData.vmid,
      vmid: vmData.vmid,
      node: vmData.node,
      type: 'vm',
      cpu: Math.round(cpu * 10) / 10,
      ram: Math.round(ram * 10) / 10,
      disk: Math.round(disk * 10) / 10,
      ip: stats.ip ?? '',
      netin: parseFloat(stats.netin ?? 0),
      netout: parseFloat(stats.netout ?? 0),
      diskread: parseFloat(stats.diskread ?? 0),
      diskwrite: parseFloat(stats.diskwrite ?? 0),
    };
  }

  let diskUsed = 0;
  let diskTotal = 0;
  let diskPercent = 0;
  const rootfs = stats.rootfs;
  if (rootfs && typeof rootfs === 'object') {
    if (rootfs.used != null && rootfs.total != null) {
      diskUsed = parseFloat(rootfs.used);
      diskTotal = parseFloat(rootfs.total);
      diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
    }
  }

  return {
    id: vmData.vmid,
    vmid: vmData.vmid,
    node: vmData.node,
    type: 'lxc',
    cpu: Math.round(cpu * 10) / 10,
    ram: Math.round(ram * 10) / 10,
    disk: Math.round(diskPercent * 10) / 10,
    diskUsed,
    diskTotal,
    ip: stats.ip ?? '',
    netin: parseFloat(stats.netin ?? 0),
    netout: parseFloat(stats.netout ?? 0),
  };
}

/**
 * Limite et déduplique la liste running pour vmstats.
 */
export function normalizeRunningList(runningList, maxCount) {
  const seen = new Set();
  const out = [];
  for (const item of runningList || []) {
    const type = item.type === 'lxc' ? 'lxc' : 'vm';
    const node = item.node ?? '';
    const vmid = parseInt(item.vmid ?? 0, 10);
    if (!node || vmid <= 0) continue;
    const key = `${node}:${type}:${vmid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, node, vmid });
    if (out.length >= maxCount) break;
  }
  return out;
}
