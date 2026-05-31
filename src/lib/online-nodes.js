/**
 * Filtre les invités (qemu/lxc) dont le nœud Proxmox n'est pas « online ».
 */

export function getOnlineNodeNames(parsed) {
  const names = new Set();
  for (const n of parsed?.nodes ?? []) {
    if (n.status === 'online' && n.node) names.add(n.node);
  }
  return names;
}

export function isNodeOnlineName(parsed, nodeName) {
  if (!nodeName) return false;
  return getOnlineNodeNames(parsed).has(nodeName);
}

/**
 * Retire VM/CT hébergés sur des nœuds offline ou inconnus.
 */
export function filterGuestsOnOfflineNodes(parsed) {
  if (!parsed) return parsed;
  const online = getOnlineNodeNames(parsed);
  return {
    ...parsed,
    nodes: parsed.nodes ?? [],
    vms: (parsed.vms ?? []).filter((v) => v.node && online.has(v.node)),
    containers: (parsed.containers ?? []).filter((c) => c.node && online.has(c.node)),
    storage: parsed.storage,
    nodesMap: parsed.nodesMap,
  };
}

/**
 * Pour vmstats : ne pas interroger status/current sur nœuds offline.
 */
export function filterRunningListByOnlineNodes(runningList, parsed) {
  const online = getOnlineNodeNames(parsed);
  if (!online.size) return runningList ?? [];
  return (runningList ?? []).filter((item) => item?.node && online.has(item.node));
}
