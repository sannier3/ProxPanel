import { proxmoxApiCall } from '../services/proxmox-client.js';

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

const FW_MACROS = [
  'SSH', 'HTTPS', 'HTTP', 'SMTP', 'DNS', 'Ping', 'NTP', 'RPC', 'SMB', 'MySQL',
  'PostgreSQL', 'LDAP', 'RDP', 'VNC', 'SPICE', 'Web', 'Mail', 'Time',
];

const CONTENT_TYPES = [
  ['images', 'Images disque VM'],
  ['rootdir', 'Répertoire racine CT'],
  ['vztmpl', 'Templates CT'],
  ['iso', 'ISO'],
  ['backup', 'Sauvegarde'],
  ['snippets', 'Snippets'],
  ['import', 'Import'],
];

const SCHEDULE_PRESETS = [
  ['', '- Personnalisé —'],
  ['daily', 'Quotidien'],
  ['weekly', 'Hebdomadaire'],
  ['*/30', 'Toutes les 30 min'],
  ['*/15', 'Toutes les 15 min'],
  ['*/2:00', 'Toutes les 2 h'],
  ['21:00', 'Chaque jour à 21:00'],
  ['sun 01:00', 'Dimanche 01:00'],
];

const ACL_PATH_PRESETS = [
  ['/', 'Tout le cluster (/)'],
  ['/vms', 'Toutes les VMs'],
  ['/storage', 'Tout le stockage'],
  ['/pool', 'Pools (préciser /pool/ID)'],
  ['/nodes', 'Tous les nœuds'],
];

const COMMON_PRIVILEGES = [
  'Datastore.Allocate', 'Datastore.AllocateSpace', 'Datastore.AllocateTemplate',
  'Datastore.Audit', 'Group.Allocate', 'Mapping.Audit', 'Mapping.Modify',
  'Mapping.Use', 'Permissions.Modify', 'Pool.Allocate', 'Pool.Audit',
  'Realm.Allocate', 'Realm.AllocateUser', 'SDN.Allocate', 'SDN.Audit',
  'SDN.Use', 'Sys.Audit', 'Sys.Console', 'Sys.Incoming', 'Sys.Modify',
  'Sys.PowerMgmt', 'Sys.Syslog', 'User.Modify', 'VM.Allocate', 'VM.Audit',
  'VM.Backup', 'VM.Clone', 'VM.Config.CDROM', 'VM.Config.CPU', 'VM.Config.Cloudinit',
  'VM.Config.Disk', 'VM.Config.HWType', 'VM.Config.Memory', 'VM.Config.Network',
  'VM.Config.Options', 'VM.Console', 'VM.GuestAgent.Audit', 'VM.GuestAgent.FileRead',
  'VM.GuestAgent.FileSystemMgmt', 'VM.GuestAgent.FileWrite', 'VM.GuestAgent.Unrestricted',
  'VM.Migrate', 'VM.Monitor', 'VM.PowerMgmt', 'VM.Replicate', 'VM.Snapshot',
  'VM.Snapshot.Rollback', 'VM.Template',
];

const TIMEZONES = [
  'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Brussels',
  'America/New_York', 'America/Los_Angeles', 'UTC', 'Asia/Tokyo',
];

export async function fetchClusterConfigLookups(ctx, query = {}) {
  const { url, ticket } = ctx;
  const node = query.node || '';

  const fetches = {
    users: proxmoxApiCall(url, ticket, '/access/users'),
    groups: proxmoxApiCall(url, ticket, '/access/groups'),
    roles: proxmoxApiCall(url, ticket, '/access/roles'),
    storage: proxmoxApiCall(url, ticket, '/storage'),
    nodes: proxmoxApiCall(url, ticket, '/nodes'),
    domains: proxmoxApiCall(url, ticket, '/access/domains'),
    pools: proxmoxApiCall(url, ticket, '/pools'),
    resources: proxmoxApiCall(url, ticket, '/cluster/resources'),
    haGroups: proxmoxApiCall(url, ticket, '/cluster/ha/groups'),
    fwAliasesCluster: proxmoxApiCall(url, ticket, '/cluster/firewall/aliases'),
    fwGroupsCluster: proxmoxApiCall(url, ticket, '/cluster/firewall/groups'),
    sdnZones: proxmoxApiCall(url, ticket, '/cluster/sdn/zones'),
    network: node ? proxmoxApiCall(url, ticket, `/nodes/${node}/network`) : Promise.resolve(null),
    fwAliasesNode: node ? proxmoxApiCall(url, ticket, `/nodes/${node}/firewall/aliases`) : Promise.resolve(null),
  };

  const keys = Object.keys(fetches);
  const results = await Promise.all(Object.values(fetches));
  const data = Object.fromEntries(keys.map((k, i) => [k, results[i]]));

  const users = asArray(data.users).map((u) => u.userid || u).filter(Boolean);
  const groups = asArray(data.groups).map((g) => g.groupid || g).filter(Boolean);
  const roles = asArray(data.roles).map((r) => r.roleid || r).filter(Boolean);
  const nodes = asArray(data.nodes).map((n) => n.node || n).filter(Boolean);
  const pools = asArray(data.pools).map((p) => p.poolid || p).filter(Boolean);

  const storagesRaw = asArray(data.storage);
  const storages = storagesRaw.map((s) => s.storage || s).filter(Boolean);
  const storagesBackup = storagesRaw
    .filter((s) => {
      const c = s.content;
      if (Array.isArray(c)) return c.includes('backup');
      return String(c || '').includes('backup');
    })
    .map((s) => s.storage)
    .filter(Boolean);

  const resources = asArray(data.resources);
  const guests = [];
  const guestVmids = [];
  const aclPaths = [...ACL_PATH_PRESETS.map(([v]) => v)];

  resources.forEach((r) => {
    if (r.type === 'qemu') {
      const sid = `vm:${r.vmid}`;
      guests.push({ value: sid, label: `${sid} - ${r.name || ''} (${r.node})` });
      guestVmids.push({ value: String(r.vmid), label: `VM ${r.vmid} - ${r.name || ''}` });
      aclPaths.push(`/vms/${r.vmid}`);
    }
    if (r.type === 'lxc') {
      const sid = `ct:${r.vmid}`;
      guests.push({ value: sid, label: `${sid} - ${r.name || ''} (${r.node})` });
      guestVmids.push({ value: String(r.vmid), label: `CT ${r.vmid} - ${r.name || ''}` });
      aclPaths.push(`/vms/${r.vmid}`);
    }
    if (r.type === 'node' && r.node) aclPaths.push(`/nodes/${r.node}`);
    if (r.type === 'pool' && r.pool) aclPaths.push(`/pool/${r.pool}`);
    if (r.type === 'storage' && r.storage) aclPaths.push(`/storage/${r.storage}`);
  });

  pools.forEach((p) => aclPaths.push(`/pool/${p}`));
  nodes.forEach((n) => aclPaths.push(`/nodes/${n}`));

  const haGroups = asArray(data.haGroups).map((g) => g.group || g).filter(Boolean);

  const fwAliases = [
    ...asArray(data.fwAliasesCluster).map((a) => a.name).filter(Boolean),
    ...asArray(data.fwAliasesNode).map((a) => a.name).filter(Boolean),
  ];
  const uniqueAliases = [...new Set(fwAliases)];

  const fwGroups = asArray(data.fwGroupsCluster).map((g) => g.group || g).filter(Boolean);

  const network = asArray(data.network);
  const ifaces = network.map((n) => n.iface).filter(Boolean);
  const bridges = network.filter((n) => n.type === 'bridge').map((n) => n.iface);
  const physicalIfaces = network
    .filter((n) => ['eth', 'bond', 'bridge'].includes(n.type))
    .map((n) => n.iface);

  const sdnZones = asArray(data.sdnZones).map((z) => z.zone || z).filter(Boolean);

  const privSet = new Set(COMMON_PRIVILEGES);
  asArray(data.roles).forEach((r) => {
    const p = r.privs;
    if (typeof p === 'string') p.split(/[,;\s]+/).forEach((x) => x && privSet.add(x.trim()));
    if (Array.isArray(p)) p.forEach((x) => privSet.add(x));
  });
  const privileges = [...privSet].sort();

  return {
    users,
    groups,
    roles,
    nodes,
    pools,
    storages,
    storagesBackup,
    guests,
    guestVmids,
    haGroups,
    fwMacros: FW_MACROS,
    fwAliases: uniqueAliases,
    fwGroups,
    ifaces,
    bridges,
    physicalIfaces,
    sdnZones,
    privileges,
    timezones: TIMEZONES,
    contentTypes: CONTENT_TYPES,
    schedulePresets: SCHEDULE_PRESETS,
    aclPaths: [...new Set(aclPaths)].sort(),
    realms: asArray(data.domains)
      .filter((d) => d.realm && (d.type ?? '') !== 'tfa')
      .map((d) => d.realm),
    node,
  };
}
