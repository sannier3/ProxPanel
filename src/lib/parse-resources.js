/**
 * Parse /cluster/resources en structures typées (port PHP).
 */
export function parseClusterResources(allResources) {
  const nodesData = [];
  const vmsData = [];
  const containersData = [];
  const storageData = [];
  const nodesMap = {};

  if (!Array.isArray(allResources)) {
    return { nodes: nodesData, vms: vmsData, containers: containersData, storage: storageData, nodesMap };
  }

  for (const resource of allResources) {
    const type = resource.type ?? '';
    const id = resource.id ?? '';

    if (type === 'node') {
      const nodeName = resource.node ?? id;
      nodesMap[nodeName] = resource;
      nodesData.push({
        node: nodeName,
        status: resource.status ?? 'unknown',
        maxcpu: parseInt(resource.maxcpu ?? 1, 10),
        maxmem: parseFloat(resource.maxmem ?? 0),
        uptime: parseInt(resource.uptime ?? 0, 10),
        cpu: parseFloat(resource.cpu ?? 0) * 100,
        mem: parseFloat(resource.mem ?? 0),
        loadavg: resource.loadavg ?? [0, 0, 0],
        kversion: resource.kversion ?? '',
        netin: parseFloat(resource.netin ?? 0),
        netout: parseFloat(resource.netout ?? 0),
        diskread: parseFloat(resource.diskread ?? 0),
        diskwrite: parseFloat(resource.diskwrite ?? 0),
      });
    } else if (type === 'qemu') {
      const nodeName = resource.node ?? '';
      const vmid = parseInt(resource.vmid ?? 0, 10);
      if (nodeName && vmid > 0) {
        vmsData.push({
          node: nodeName,
          vmid,
          name: resource.name ?? '',
          status: resource.status ?? 'stopped',
          cpu: parseFloat(resource.cpu ?? 0) * 100,
          mem: parseFloat(resource.mem ?? 0),
          maxmem: parseFloat(resource.maxmem ?? 0),
          disk: parseFloat(resource.disk ?? 0),
          uptime: parseInt(resource.uptime ?? 0, 10),
          template: parseInt(resource.template ?? 0, 10) === 1,
        });
      }
    } else if (type === 'lxc') {
      const nodeName = resource.node ?? '';
      const vmid = parseInt(resource.vmid ?? 0, 10);
      if (nodeName && vmid > 0) {
        containersData.push({
          node: nodeName,
          vmid,
          name: resource.name ?? '',
          status: resource.status ?? 'stopped',
          cpu: parseFloat(resource.cpu ?? 0) * 100,
          mem: parseFloat(resource.mem ?? 0),
          maxmem: parseFloat(resource.maxmem ?? 0),
          disk: parseFloat(resource.disk ?? 0),
          diskread: parseFloat(resource.diskread ?? 0),
          diskwrite: parseFloat(resource.diskwrite ?? 0),
          uptime: parseInt(resource.uptime ?? 0, 10),
        });
      }
    } else if (type === 'storage') {
      storageData.push(resource);
    }
  }

  return { nodes: nodesData, vms: vmsData, containers: containersData, storage: storageData, nodesMap };
}
