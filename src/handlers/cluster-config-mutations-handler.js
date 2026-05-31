import { proxmoxApiCallResult } from '../services/proxmox-client.js';

function cleanBody(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    if (v === '' && k !== 'comment') continue;
    if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else out[k] = v;
  }
  return out;
}

function fwPath(scope, node, sub) {
  const base = scope === 'cluster' ? '/cluster/firewall' : `/nodes/${node}/firewall`;
  if (sub === 'options') return `${base}/options`;
  if (sub === 'rules') return `${base}/rules`;
  if (sub === 'aliases') return `${base}/aliases`;
  if (sub === 'groups') return `${base}/groups`;
  if (sub === 'ipset') return `${base}/ipset`;
  return base;
}

export async function mutateClusterConfig(ctx, params) {
  const { url, ticket } = ctx;
  const section = params.section || '';
  const operation = params.operation || 'update';
  const id = params.id || '';
  const node = params.node || '';
  const sub = params.sub || '';
  const data = params.data || {};
  const scope = params.scope || (node ? 'node' : 'cluster');

  switch (section) {
    case 'cluster-options': {
      let payload;
      if (operation === 'delete-key') {
        payload = { delete: data.key || id };
      } else if (data.key) {
        const val = data.value;
        if (val === '' || val === '__default__' || val === null) {
          payload = { delete: data.key };
        } else {
          payload = { [data.key]: val };
        }
      } else {
        payload = cleanBody(data);
      }
      return proxmoxApiCallResult(url, ticket, '/cluster/options', 'PUT', payload);
    }

    case 'users': {
      const userid = encodeURIComponent(id || data.userid || '');
      if (operation === 'create') {
        const body = cleanBody(data);
        if (body.userid && body.realm && !String(body.userid).includes('@')) {
          body.userid = `${body.userid}@${body.realm}`;
        }
        delete body.realm;
        delete body.verifypassword;
        return proxmoxApiCallResult(url, ticket, '/access/users', 'POST', body);
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/access/users/${userid}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.userid;
      delete body.realm;
      delete body.verifypassword;
      if (!body.password) delete body.password;
      return proxmoxApiCallResult(url, ticket, `/access/users/${userid}`, 'PUT', body);
    }

    case 'groups': {
      const groupid = encodeURIComponent(id || data.groupid || '');
      if (operation === 'create') {
        return proxmoxApiCallResult(url, ticket, '/access/groups', 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/access/groups/${groupid}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.groupid;
      return proxmoxApiCallResult(url, ticket, `/access/groups/${groupid}`, 'PUT', body);
    }

    case 'roles': {
      const roleid = encodeURIComponent(id || data.roleid || '');
      if (operation === 'create') {
        return proxmoxApiCallResult(url, ticket, '/access/roles', 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/access/roles/${roleid}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.roleid;
      return proxmoxApiCallResult(url, ticket, `/access/roles/${roleid}`, 'PUT', body);
    }

    case 'pools': {
      const poolid = encodeURIComponent(id || data.poolid || '');
      if (operation === 'create') {
        return proxmoxApiCallResult(url, ticket, '/pools', 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/pools/${poolid}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.poolid;
      return proxmoxApiCallResult(url, ticket, `/pools/${poolid}`, 'PUT', body);
    }

    case 'acl': {
      const body = cleanBody(data);
      if (operation === 'delete') body.delete = 1;
      return proxmoxApiCallResult(url, ticket, '/access/acl', 'PUT', body);
    }

    case 'tokens': {
      const userid = encodeURIComponent(data.userid || data._userid || '');
      const tokenid = encodeURIComponent(id || data.tokenid || '');
      if (operation === 'create') {
        const body = cleanBody(data);
        delete body.userid;
        return proxmoxApiCallResult(url, ticket, `/access/users/${userid}/token`, 'POST', body);
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(
          url,
          ticket,
          `/access/users/${userid}/token/${tokenid}`,
          'DELETE'
        );
      }
      const body = cleanBody(data);
      delete body.tokenid;
      delete body.userid;
      return proxmoxApiCallResult(
        url,
        ticket,
        `/access/users/${userid}/token/${tokenid}`,
        'PUT',
        body
      );
    }

    case 'storage': {
      const storage = encodeURIComponent(id || data.storage || '');
      if (operation === 'create') {
        return proxmoxApiCallResult(url, ticket, '/storage', 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/storage/${storage}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.storage;
      return proxmoxApiCallResult(url, ticket, `/storage/${storage}`, 'PUT', body);
    }

    case 'backup': {
      const jobId = encodeURIComponent(id || data.id || '');
      if (operation === 'create') {
        return proxmoxApiCallResult(url, ticket, '/cluster/backup', 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/cluster/backup/${jobId}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.id;
      return proxmoxApiCallResult(url, ticket, `/cluster/backup/${jobId}`, 'PUT', body);
    }

    case 'replication': {
      const jobId = encodeURIComponent(id || data.id || '');
      if (operation === 'create') {
        return proxmoxApiCallResult(url, ticket, '/cluster/replication', 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/cluster/replication/${jobId}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.id;
      return proxmoxApiCallResult(url, ticket, `/cluster/replication/${jobId}`, 'PUT', body);
    }

    case 'ha': {
      if (sub === 'groups') {
        const group = encodeURIComponent(id || data.group || '');
        if (operation === 'create') {
          return proxmoxApiCallResult(url, ticket, '/cluster/ha/groups', 'POST', cleanBody(data));
        }
        if (operation === 'delete') {
          return proxmoxApiCallResult(url, ticket, `/cluster/ha/groups/${group}`, 'DELETE');
        }
        const body = cleanBody(data);
        delete body.group;
        return proxmoxApiCallResult(url, ticket, `/cluster/ha/groups/${group}`, 'PUT', body);
      }
      const sid = encodeURIComponent(id || data.sid || '');
      if (operation === 'create') {
        return proxmoxApiCallResult(url, ticket, '/cluster/ha/resources', 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/cluster/ha/resources/${sid}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.sid;
      return proxmoxApiCallResult(url, ticket, `/cluster/ha/resources/${sid}`, 'PUT', body);
    }

    case 'firewall-cluster':
    case 'node-firewall': {
      const nodeName = section === 'node-firewall' ? node : '';
      if (!nodeName && section === 'node-firewall') {
        return { ok: false, error: 'Nœud requis' };
      }
      if (sub === 'options') {
        return proxmoxApiCallResult(
          url,
          ticket,
          fwPath(scope, nodeName, 'options'),
          'PUT',
          cleanBody(data)
        );
      }
      if (sub === 'rules') {
        const pos = encodeURIComponent(id || data.pos || '');
        if (operation === 'create') {
          return proxmoxApiCallResult(url, ticket, fwPath(scope, nodeName, 'rules'), 'POST', cleanBody(data));
        }
        if (operation === 'delete') {
          return proxmoxApiCallResult(url, ticket, `${fwPath(scope, nodeName, 'rules')}/${pos}`, 'DELETE');
        }
        const body = cleanBody(data);
        delete body.pos;
        return proxmoxApiCallResult(url, ticket, `${fwPath(scope, nodeName, 'rules')}/${pos}`, 'PUT', body);
      }
      if (sub === 'aliases') {
        const name = encodeURIComponent(id || data.name || '');
        if (operation === 'create') {
          return proxmoxApiCallResult(url, ticket, fwPath(scope, nodeName, 'aliases'), 'POST', cleanBody(data));
        }
        if (operation === 'delete') {
          return proxmoxApiCallResult(url, ticket, `${fwPath(scope, nodeName, 'aliases')}/${name}`, 'DELETE');
        }
        const body = cleanBody(data);
        delete body.name;
        return proxmoxApiCallResult(url, ticket, `${fwPath(scope, nodeName, 'aliases')}/${name}`, 'PUT', body);
      }
      if (sub === 'groups') {
        const group = encodeURIComponent(id || data.group || '');
        if (operation === 'create') {
          return proxmoxApiCallResult(url, ticket, fwPath(scope, nodeName, 'groups'), 'POST', cleanBody(data));
        }
        if (operation === 'delete') {
          return proxmoxApiCallResult(url, ticket, `${fwPath(scope, nodeName, 'groups')}/${group}`, 'DELETE');
        }
        const body = cleanBody(data);
        delete body.group;
        return proxmoxApiCallResult(url, ticket, `${fwPath(scope, nodeName, 'groups')}/${group}`, 'PUT', body);
      }
      return { ok: false, error: 'Sous-ressource pare-feu inconnue' };
    }

    case 'node-dns': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      return proxmoxApiCallResult(url, ticket, `/nodes/${node}/dns`, 'PUT', cleanBody(data));
    }

    case 'node-hosts': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      return proxmoxApiCallResult(url, ticket, `/nodes/${node}/hosts`, 'PUT', cleanBody(data));
    }

    case 'node-time': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      return proxmoxApiCallResult(url, ticket, `/nodes/${node}/time`, 'PUT', cleanBody(data));
    }

    case 'node-options': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      return proxmoxApiCallResult(url, ticket, `/nodes/${node}/config`, 'PUT', cleanBody(data));
    }

    case 'node-network': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      const iface = encodeURIComponent(id || data.iface || '');
      if (operation === 'create') {
        return proxmoxApiCallResult(url, ticket, `/nodes/${node}/network`, 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, `/nodes/${node}/network/${iface}`, 'DELETE');
      }
      const body = cleanBody(data);
      delete body.iface;
      return proxmoxApiCallResult(url, ticket, `/nodes/${node}/network/${iface}`, 'PUT', body);
    }

    case 'node-updates': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      if (operation === 'upgrade') {
        return proxmoxApiCallResult(url, ticket, `/nodes/${node}/apt/upgrade`, 'POST', {});
      }
      if (operation === 'repositories-refresh') {
        return proxmoxApiCallResult(url, ticket, `/nodes/${node}/apt/repositories`, 'GET');
      }
      return { ok: false, error: 'Action inconnue' };
    }

    case 'node-repositories': {
      if (!node) return { ok: false, error: 'Nœud requis' };
      if (operation === 'add-standard') {
        return proxmoxApiCallResult(url, ticket, `/nodes/${node}/apt/repositories`, 'POST', {
          description: 'Ajout dépôts Proxmox',
        });
      }
      return { ok: false, error: 'Utilisez l\'UI Proxmox pour modifier les dépôts personnalisés' };
    }

    case 'metrics': {
      if (operation === 'create' || operation === 'update') {
        return proxmoxApiCallResult(url, ticket, '/cluster/metrics/server', 'POST', cleanBody(data));
      }
      if (operation === 'delete') {
        return proxmoxApiCallResult(url, ticket, '/cluster/metrics/server', 'DELETE');
      }
      return proxmoxApiCallResult(url, ticket, '/cluster/metrics/server', 'PUT', cleanBody(data));
    }

    case 'sdn': {
      if (sub === 'zones') {
        const zid = encodeURIComponent(id || data.zone || '');
        if (operation === 'create') {
          return proxmoxApiCallResult(url, ticket, '/cluster/sdn/zones', 'POST', cleanBody(data));
        }
        if (operation === 'delete') {
          return proxmoxApiCallResult(url, ticket, `/cluster/sdn/zones/${zid}`, 'DELETE');
        }
        const body = cleanBody(data);
        delete body.zone;
        return proxmoxApiCallResult(url, ticket, `/cluster/sdn/zones/${zid}`, 'PUT', body);
      }
      if (sub === 'vnets') {
        const vnet = encodeURIComponent(id || data.vnet || '');
        if (operation === 'create') {
          return proxmoxApiCallResult(url, ticket, '/cluster/sdn/vnets', 'POST', cleanBody(data));
        }
        if (operation === 'delete') {
          return proxmoxApiCallResult(url, ticket, `/cluster/sdn/vnets/${vnet}`, 'DELETE');
        }
        const body = cleanBody(data);
        delete body.vnet;
        return proxmoxApiCallResult(url, ticket, `/cluster/sdn/vnets/${vnet}`, 'PUT', body);
      }
      return { ok: false, error: 'Sous-ressource SDN inconnue' };
    }

    default:
      return { ok: false, error: `Modification non supportée pour: ${section}` };
  }
}
