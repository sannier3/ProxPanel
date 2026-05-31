import { proxmoxApiCall } from '../services/proxmox-client.js';
import { config } from '../config.js';
import { listDirectoryOnNode, IN_DOCKER } from '../lib/node-directory-list.js';

/** Sous-répertoires par défaut d'un datastore type dir (layout Proxmox). */
const CONTENT_SUBDIRS = {
  iso: 'template/iso',
  vztmpl: 'template/cache',
  backup: 'dump',
  rootdir: 'private',
  snippets: 'snippets',
  images: 'images',
};

function normalizePath(p) {
  if (!p || p === '/') return '/';
  let n = String(p).replace(/\\/g, '/').trim();
  if (!n.startsWith('/')) n = `/${n}`;
  n = n.replace(/\/+/g, '/');
  if (n.length > 1 && n.endsWith('/')) n = n.slice(0, -1);
  if (n.includes('..')) return null;
  return n || '/';
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    const ad = a.type === 'dir' ? 0 : 1;
    const bd = b.type === 'dir' ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
  });
}

function formatEntry(name, type, pathValue, extra = {}) {
  return {
    name,
    type,
    path: pathValue,
    size: extra.size ?? null,
    mtime: extra.mtime ?? null,
    volid: extra.volid ?? null,
    storage: extra.storage ?? null,
    contentType: extra.contentType ?? null,
  };
}

async function getClusterMeta(url, ticket) {
  const status = await proxmoxApiCall(url, ticket, '/cluster/status');
  let clusterName = 'Cluster';
  if (Array.isArray(status)) {
    const cluster = status.find((s) => s.type === 'cluster');
    if (cluster?.name) clusterName = cluster.name;
  }

  const nodes = await proxmoxApiCall(url, ticket, '/nodes');
  return {
    clusterName,
    nodes: (nodes || []).map((n) => ({
      name: n.node,
      status: n.status || 'unknown',
    })),
  };
}

async function getStorageMap(url, ticket, node) {
  const globalCfg = await proxmoxApiCall(url, ticket, '/storage');
  const nodeStorages = await proxmoxApiCall(url, ticket, `/nodes/${encodeURIComponent(node)}/storage`);
  const map = new Map();

  for (const ns of nodeStorages || []) {
    const sid = ns.storage;
    if (!sid) continue;
    const cfg = (globalCfg || []).find((s) => s.storage === sid);
    if (!cfg) continue;
    const rootPath = cfg.path ? normalizePath(cfg.path) : null;
    if (!rootPath) continue;
    const content =
      typeof cfg.content === 'string'
        ? cfg.content.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
    map.set(sid, {
      id: sid,
      type: cfg.type || ns.type || 'unknown',
      path: rootPath,
      content,
    });
  }
  return map;
}

function prefixChildren(storageMap, dirPath) {
  const entries = new Map();
  for (const st of storageMap.values()) {
    const root = st.path;
    if (!root) continue;

    if (dirPath === '/') {
      const first = root.split('/').filter(Boolean)[0];
      if (first) {
        entries.set(first, formatEntry(first, 'dir', `/${first}`));
      }
      continue;
    }

    if (root === dirPath || !root.startsWith(`${dirPath}/`)) continue;

    if (root === dirPath) continue;

    const rel = root.slice(dirPath.length + 1);
    const next = rel.split('/')[0];
    if (next) {
      entries.set(next, formatEntry(next, 'dir', `${dirPath}/${next}`));
    }
  }
  return sortEntries([...entries.values()]);
}

function findStorageAtPath(storageMap, dirPath) {
  for (const st of storageMap.values()) {
    if (st.path === dirPath) return st;
  }
  return null;
}

function resolveContentBrowse(storageMap, dirPath) {
  for (const st of storageMap.values()) {
    if (!st.path || !dirPath.startsWith(`${st.path}/`)) continue;
    const rel = dirPath.slice(st.path.length + 1);
    for (const ct of st.content) {
      const sub = CONTENT_SUBDIRS[ct] || ct;
      if (rel === sub || rel.startsWith(`${sub}/`)) {
        return { storage: st, contentType: ct, subdir: sub, relInSub: rel.slice(sub.length).replace(/^\//, '') };
      }
    }
  }
  return null;
}

async function listStorageFiles(url, ticket, node, storageId, contentType = null) {
  let apiPath = `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storageId)}/content`;
  if (contentType) apiPath += `?content=${encodeURIComponent(contentType)}`;
  const items = await proxmoxApiCall(url, ticket, apiPath);
  return (items || []).map((item) => {
    const volid = item.volid || '';
    const slash = volid.lastIndexOf('/');
    const name = slash >= 0 ? volid.slice(slash + 1) : volid.replace(/^[^:]+:/, '');
    return formatEntry(name, 'file', null, {
      volid,
      storage: storageId,
      contentType: contentType || null,
      size: item.size ?? null,
      mtime: item.ctime ?? null,
    });
  });
}

async function listViaProxmoxApi(url, ticket, node, dirPath) {
  const storageMap = await getStorageMap(url, ticket, node);
  const storageAtPath = findStorageAtPath(storageMap, dirPath);

  if (storageAtPath) {
    const entries = [];
    for (const ct of storageAtPath.content) {
      const sub = CONTENT_SUBDIRS[ct] || ct;
      const label = sub.includes('/') ? sub.split('/').pop() : sub;
      entries.push(
        formatEntry(label, 'dir', `${dirPath}/${sub}`, {
          storage: storageAtPath.id,
          contentType: ct,
        })
      );
    }
    return { entries: sortEntries(entries), source: 'proxmox-storage-root', partial: true };
  }

  const contentCtx = resolveContentBrowse(storageMap, dirPath);
  if (contentCtx) {
    const files = await listStorageFiles(
      url,
      ticket,
      node,
      contentCtx.storage.id,
      contentCtx.contentType
    );
    if (!contentCtx.relInSub) {
      return { entries: sortEntries(files), source: 'proxmox-storage-content', partial: false };
    }
    const prefix = contentCtx.relInSub;
    const dirs = new Map();
    const out = [];
    for (const f of files) {
      const volid = f.volid || '';
      const volPath = volid.includes('/') ? volid.split('/').slice(1).join('/') : volid;
      if (!volPath.startsWith(prefix)) continue;
      const rest = volPath.slice(prefix.length).replace(/^\//, '');
      if (!rest) {
        out.push(f);
        continue;
      }
      const seg = rest.split('/')[0];
      if (seg && !dirs.has(seg)) {
        dirs.set(seg, formatEntry(seg, 'dir', `${dirPath}/${seg}`));
      }
    }
    return {
      entries: sortEntries([...dirs.values(), ...out]),
      source: 'proxmox-storage-content',
      partial: false,
    };
  }

  const prefix = prefixChildren(storageMap, dirPath);
  return {
    entries: prefix,
    source: 'proxmox-path',
    partial: true,
    hint:
      prefix.length === 0
        ? shellAccessHint()
        : null,
  };
}

function shellAccessHint() {
  if (IN_DOCKER) {
    return 'Vue datastore uniquement. Pour / complet depuis Docker : FILE_EXPLORER_SSH=true, clé SSH root vers les nœuds.';
  }
  return 'Vue datastore partielle. Pour / complet : LOCAL_EXEC=true sur un nœud PVE, ou FILE_EXPLORER_SSH=true (SSH root inter-nœuds).';
}

export async function fetchFileExplorerTree(ctx) {
  if (!config.prod) {
    return {
      clusterName: 'Cluster (démo)',
      nodes: [
        { name: 'pve-01', status: 'online' },
        { name: 'pve-02', status: 'online' },
        { name: 'pve-03', status: 'offline' },
      ],
    };
  }

  const { url, ticket } = ctx;
  const meta = await getClusterMeta(url, ticket);
  return meta;
}

export async function fetchFileExplorerList(ctx, node, rawPath) {
  const dirPath = normalizePath(rawPath);
  if (!node || !dirPath) {
    return { error: 'Paramètres invalides', node, path: rawPath };
  }

  if (!config.prod) {
    return mockList(node, dirPath);
  }

  const { url, ticket } = ctx;

  const shellResult = await listDirectoryOnNode(ctx, node, dirPath);
  if (shellResult?.entries?.length) {
    return {
      node,
      path: dirPath,
      entries: sortEntries(
        shellResult.entries.map((e) =>
          formatEntry(e.name, e.type || 'file', e.path || dirPath, {
            size: e.size ?? null,
            mtime: e.mtime ?? null,
          })
        )
      ),
      source: shellResult.source || 'shell',
      partial: false,
    };
  }

  const apiResult = await listViaProxmoxApi(url, ticket, node, dirPath);
  return {
    node,
    path: dirPath,
    entries: apiResult.entries,
    source: apiResult.source,
    partial: apiResult.partial,
    hint: apiResult.hint || null,
  };
}

function mockList(node, dirPath) {
  if (dirPath === '/') {
    return {
      node,
      path: '/',
      entries: sortEntries([
        formatEntry('bin', 'dir', '/bin'),
        formatEntry('boot', 'dir', '/boot'),
        formatEntry('dev', 'dir', '/dev'),
        formatEntry('etc', 'dir', '/etc'),
        formatEntry('home', 'dir', '/home'),
        formatEntry('lib', 'dir', '/lib'),
        formatEntry('media', 'dir', '/media'),
        formatEntry('mnt', 'dir', '/mnt'),
        formatEntry('opt', 'dir', '/opt'),
        formatEntry('root', 'dir', '/root'),
        formatEntry('run', 'dir', '/run'),
        formatEntry('sbin', 'dir', '/sbin'),
        formatEntry('srv', 'dir', '/srv'),
        formatEntry('tmp', 'dir', '/tmp'),
        formatEntry('usr', 'dir', '/usr'),
        formatEntry('var', 'dir', '/var'),
      ]),
      source: 'demo',
      partial: false,
    };
  }
  if (dirPath === '/var') {
    return {
      node,
      path: '/var',
      entries: sortEntries([
        formatEntry('lib', 'dir', '/var/lib'),
        formatEntry('log', 'dir', '/var/log'),
      ]),
      source: 'demo',
      partial: false,
    };
  }
  if (dirPath === '/var/lib') {
    return {
      node,
      path: '/var/lib',
      entries: sortEntries([formatEntry('vz', 'dir', '/var/lib/vz')]),
      source: 'demo',
      partial: false,
    };
  }
  if (dirPath === '/var/lib/vz') {
    return {
      node,
      path: '/var/lib/vz',
      entries: sortEntries([
        formatEntry('template', 'dir', '/var/lib/vz/template'),
        formatEntry('images', 'dir', '/var/lib/vz/images'),
        formatEntry('dump', 'dir', '/var/lib/vz/dump'),
      ]),
      source: 'demo',
      partial: false,
    };
  }
  return {
    node,
    path: dirPath,
    entries: [],
    source: 'demo',
    partial: false,
    hint: null,
  };
}
