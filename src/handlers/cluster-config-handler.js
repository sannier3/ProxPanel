import { proxmoxApiCall } from '../services/proxmox-client.js';

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

async function safeCall(url, ticket, path) {
  try {
    const data = await proxmoxApiCall(url, ticket, path);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message || 'Erreur API' };
  }
}

async function fetchAllUserTokens(url, ticket) {
  const usersRes = await safeCall(url, ticket, '/access/users');
  if (!usersRes.ok) return usersRes;
  const users = asArray(usersRes.data);
  const tokens = [];
  await Promise.all(
    users.map(async (u) => {
      const userid = u.userid || u;
      if (!userid) return;
      const tr = await safeCall(url, ticket, `/access/users/${encodeURIComponent(userid)}/token`);
      if (tr.ok) {
        asArray(tr.data).forEach((t) => tokens.push({ ...t, userid }));
      }
    })
  );
  return { ok: true, data: tokens };
}

export async function fetchClusterConfigSection(ctx, section, query = {}) {
  const { url, ticket } = ctx;
  const node = query.node || '';

  switch (section) {
    case 'summary': {
      const [status, resources, version] = await Promise.all([
        safeCall(url, ticket, '/cluster/status'),
        safeCall(url, ticket, '/cluster/resources'),
        safeCall(url, ticket, '/version'),
      ]);
      return { status, resources, version };
    }

    case 'cluster-options':
      return { ...(await safeCall(url, ticket, '/cluster/options')) };

    case 'storage':
      return { ...(await safeCall(url, ticket, '/storage')) };

    case 'backup':
      return { ...(await safeCall(url, ticket, '/cluster/backup')) };

    case 'replication':
      return { ...(await safeCall(url, ticket, '/cluster/replication')) };

    case 'ha-resources': {
      const [resources, groups, status] = await Promise.all([
        safeCall(url, ticket, '/cluster/ha/resources'),
        safeCall(url, ticket, '/cluster/ha/groups'),
        safeCall(url, ticket, '/cluster/ha/status'),
      ]);
      return { resources, groups, status };
    }

    case 'firewall-cluster': {
      const [options, rules, groups, aliases] = await Promise.all([
        safeCall(url, ticket, '/cluster/firewall/options'),
        safeCall(url, ticket, '/cluster/firewall/rules'),
        safeCall(url, ticket, '/cluster/firewall/groups'),
        safeCall(url, ticket, '/cluster/firewall/aliases'),
      ]);
      return { options, rules, groups, aliases };
    }

    case 'users':
      return { ...(await safeCall(url, ticket, '/access/users')) };

    case 'groups':
      return { ...(await safeCall(url, ticket, '/access/groups')) };

    case 'roles':
      return { ...(await safeCall(url, ticket, '/access/roles')) };

    case 'acl':
      return { ...(await safeCall(url, ticket, '/access/acl')) };

    case 'pools':
      return { ...(await safeCall(url, ticket, '/pools')) };

    case 'tokens':
      return { ...(await fetchAllUserTokens(url, ticket)) };

    case 'nodes-list':
      return { ...(await safeCall(url, ticket, '/nodes')) };

    case 'ceph': {
      const meta = await safeCall(url, ticket, '/cluster/ceph/metadata');
      let status = { ok: false, error: 'Ceph non configuré' };
      if (node) {
        status = await safeCall(url, ticket, `/nodes/${node}/ceph/status`);
      } else {
        const nodes = await safeCall(url, ticket, '/nodes');
        const first = asArray(nodes.data)[0];
        const n = first?.node || first;
        if (n) status = await safeCall(url, ticket, `/nodes/${n}/ceph/status`);
      }
      return { metadata: meta, status };
    }

    case 'sdn': {
      const [zones, vnets, controllers] = await Promise.all([
        safeCall(url, ticket, '/cluster/sdn/zones'),
        safeCall(url, ticket, '/cluster/sdn/vnets'),
        safeCall(url, ticket, '/cluster/sdn/controllers'),
      ]);
      return { zones, vnets, controllers };
    }

    case 'metrics':
      return { ...(await safeCall(url, ticket, '/cluster/metrics/server')) };

    case 'node-summary': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      const [status, version, subscription] = await Promise.all([
        safeCall(url, ticket, `/nodes/${node}/status`),
        safeCall(url, ticket, `/nodes/${node}/version`),
        safeCall(url, ticket, `/nodes/${node}/subscription`),
      ]);
      return { node, status, version, subscription };
    }

    case 'node-network':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/network`)) };

    case 'node-dns':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/dns`)) };

    case 'node-hosts':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/hosts`)) };

    case 'node-options':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/config`)) };

    case 'node-time':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/time`)) };

    case 'node-certificates':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/certificates/info`)) };

    case 'node-storage':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/storage`)) };

    case 'node-repositories':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/apt/repositories`)) };

    case 'node-updates':
      if (!node) return { ok: false, error: 'Nœud requis' };
      return { ...(await safeCall(url, ticket, `/nodes/${node}/apt/update`)) };

    case 'node-firewall': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      const [options, rules, aliases] = await Promise.all([
        safeCall(url, ticket, `/nodes/${node}/firewall/options`),
        safeCall(url, ticket, `/nodes/${node}/firewall/rules`),
        safeCall(url, ticket, `/nodes/${node}/firewall/aliases`),
      ]);
      return { options, rules, aliases };
    }

    case 'node-disks': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      const [disks, lvm, zfs, directory] = await Promise.all([
        safeCall(url, ticket, `/nodes/${node}/disks/list`),
        safeCall(url, ticket, `/nodes/${node}/disks/lvm`),
        safeCall(url, ticket, `/nodes/${node}/disks/zfs`),
        safeCall(url, ticket, `/nodes/${node}/disks/directory`),
      ]);
      return { disks, lvm, zfs, directory };
    }

    default:
      return { ok: false, error: `Section inconnue: ${section}` };
  }
}

export function normalizeConfigList(payload) {
  if (!payload?.ok) return [];
  const data = payload.data;
  return asArray(data);
}
