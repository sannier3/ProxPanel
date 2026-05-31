import { proxmoxApiCall, proxmoxApiCallMulti } from '../services/proxmox-client.js';
import { parseClusterResources } from '../lib/parse-resources.js';
import { filterGuestsOnOfflineNodes } from '../lib/online-nodes.js';
import { getCachedResources } from '../services/cache.js';
import { config } from '../config.js';
import { fetchVmStats } from './vmstats-handler.js';
import { fetchConsoleAccess, fetchNodeShellAccess } from './console-handler.js';
import { parseProxmoxGuestConfig, buildGuestConfigPayload, buildGuestConfigPayloadFromEditor } from '../lib/vm-config.js';
import { fetchConfigOptions } from './config-options-handler.js';
import { fetchProxmoxTasks } from './tasks-handler.js';
import { fetchClusterConfigSection } from './cluster-config-handler.js';
import { mutateClusterConfig } from './cluster-config-mutations-handler.js';
import { fetchClusterConfigLookups } from './cluster-config-lookups.js';
import { QEMU_CONFIG_SCHEMA } from '../lib/qemu-config-schema.js';
import { getCombinedConfigSchema } from '../lib/guest-config-schema.js';

const STORAGE_KEY_SEP = '\x1f';

const VALID_ACTIONS = new Set([
  'all', 'nodes', 'vms', 'resources', 'storage', 'storage-content', 'config-options', 'qemu-schema', 'guest-schema', 'console', 'vmstats',
  'clone', 'tasks', 'task-stop', 'task-details', 'vm-action', 'vm-config', 'vm-config-update', 'vm-notes',
  'cluster-config',
  'cluster-config-mutate',
  'cluster-config-lookups',
]);

async function loadResources(url, ticket, sessionId) {
  const cached = getCachedResources(sessionId, config.collector.resourcesIntervalMs);
  if (cached?.all) {
    const parsed = filterGuestsOnOfflineNodes(
      cached.parsed ?? parseClusterResources(cached.all)
    );
    return { all: cached.all, parsed };
  }
  const all = await proxmoxApiCall(url, ticket, '/cluster/resources');
  if (!all) return null;
  return { all, parsed: filterGuestsOnOfflineNodes(parseClusterResources(all)) };
}

async function buildNodes(url, ticket, resources) {
  const result = { nodes: [] };
  if (!resources?.parsed?.nodes) return result;

  const nodePaths = [];
  resources.parsed.nodes.forEach((node, index) => {
    if (node.status === 'online' && node.node) {
      nodePaths.push({ key: `status_${index}`, path: `/nodes/${node.node}/status/current` });
    }
  });

  const statusResults = nodePaths.length
    ? await proxmoxApiCallMulti(url, ticket, nodePaths)
    : {};

  for (let index = 0; index < resources.parsed.nodes.length; index++) {
    const node = resources.parsed.nodes[index];
    const nodeName = node.node ?? '';
    if (!nodeName) continue;

    const nodeStatus = statusResults[`status_${index}`];
    let nodeStatusValue = 'offline';
    if (nodeStatus && typeof nodeStatus === 'object' && Object.keys(nodeStatus).length) {
      nodeStatusValue = 'online';
    } else if (node.status === 'online') {
      nodeStatusValue = 'online';
    }

    let cpu = node.cpu ?? 0;
    let ramUsed = 0;
    let ramTotal = 0;
    let uptime = node.uptime ?? 0;
    let loadavg = node.loadavg ?? [0, 0, 0];
    let kversion = node.kversion ?? '';
    let maxcpu = node.maxcpu ?? 1;
    let maxmem = (node.maxmem || 0) / 1024 / 1024 / 1024;

    if (nodeStatus && nodeStatusValue === 'online') {
      cpu = parseFloat(nodeStatus.cpu ?? cpu) * 100;
      if (nodeStatus.maxmem > 0) {
        ramTotal = parseFloat(nodeStatus.maxmem) / 1024 / 1024 / 1024;
        if (nodeStatus.mem > 0) ramUsed = parseFloat(nodeStatus.mem) / 1024 / 1024 / 1024;
      }
      uptime = parseInt(nodeStatus.uptime ?? uptime, 10);
      loadavg = nodeStatus.loadavg ?? loadavg;
      kversion = nodeStatus.kversion ?? kversion;
      maxcpu = parseInt(nodeStatus.maxcpu ?? maxcpu, 10);
      maxmem = parseInt(nodeStatus.maxmem ?? node.maxmem ?? 0, 10) / 1024 / 1024 / 1024;
    } else if (node.maxmem > 0) {
      ramTotal = node.maxmem / 1024 / 1024 / 1024;
      maxmem = ramTotal;
    }

    const netin = nodeStatus?.netin != null ? parseFloat(nodeStatus.netin) : parseFloat(node.netin ?? 0);
    const netout = nodeStatus?.netout != null ? parseFloat(nodeStatus.netout) : parseFloat(node.netout ?? 0);
    const diskread = nodeStatus?.diskread != null ? parseFloat(nodeStatus.diskread) : parseFloat(node.diskread ?? 0);
    const diskwrite = nodeStatus?.diskwrite != null ? parseFloat(nodeStatus.diskwrite) : parseFloat(node.diskwrite ?? 0);

    result.nodes.push({
      name: nodeName,
      status: nodeStatusValue,
      cpu: Math.round(cpu * 10) / 10,
      ram: { used: Math.round(ramUsed * 100) / 100, total: Math.round(ramTotal * 100) / 100 },
      uptime,
      loadavg,
      kversion,
      maxcpu,
      maxmem: Math.round(maxmem * 100) / 100,
      netin,
      netout,
      diskread,
      diskwrite,
    });
  }
  return result;
}

async function buildVms(url, ticket, resources) {
  const userVMs = [];
  const userNodes = [];
  if (!resources?.parsed) return { vms: userVMs, nodesWithVms: userNodes };

  const onlineNodes = {};
  for (const n of resources.parsed.nodes) {
    if (n.status === 'online') onlineNodes[n.node] = true;
  }

  const configPaths = [];
  const vmEntries = [];

  for (const vm of resources.parsed.vms) {
    if (!onlineNodes[vm.node] || !vm.vmid) continue;
    const key = `${vm.node}_qemu_${vm.vmid}`;
    vmEntries.push({ key, type: 'vm', node: vm.node, vmid: vm.vmid, raw: vm });
    configPaths.push({ key, path: `/nodes/${vm.node}/qemu/${vm.vmid}/config` });
  }
  for (const ct of resources.parsed.containers) {
    if (!onlineNodes[ct.node] || !ct.vmid) continue;
    const key = `${ct.node}_lxc_${ct.vmid}`;
    vmEntries.push({ key, type: 'lxc', node: ct.node, vmid: ct.vmid, raw: ct });
    configPaths.push({ key, path: `/nodes/${ct.node}/lxc/${ct.vmid}/config` });
  }

  const configResults = configPaths.length
    ? await proxmoxApiCallMulti(url, ticket, configPaths)
    : {};

  const nodesMap = {};
  for (const n of resources.parsed.nodes) {
    if (n.node && onlineNodes[n.node]) {
      nodesMap[n.node] = { vms: [], containers: [] };
    }
  }

  for (const entry of vmEntries) {
    const { key, type, node, vmid, raw } = entry;
    const cfg = configResults[key];
    const isTemplate = cfg && parseInt(cfg.template ?? 0, 10) === 1;
    const item = {
      vmid,
      id: vmid,
      name: raw.name || (type === 'vm' ? `VM-${vmid}` : `CT-${vmid}`),
      type,
      status: raw.status ?? 'stopped',
      cpu: 0,
      ram: 0,
      disk: 0,
      ip: '',
      node,
      template: isTemplate,
      config: cfg
        ? parseProxmoxGuestConfig(cfg, type)
        : {
            vcpu: parseInt(raw.cpus ?? raw.cpu ?? 1, 10),
            memory: raw.maxmem ? Math.round(parseInt(raw.maxmem, 10) / 1024 / 1024) : 512,
            iso: '',
            storage: '',
            bootOrder: type === 'vm' ? 'order=scsi0' : '',
            autostart: parseInt(raw.onboot ?? 0, 10) === 1,
          },
      backups: [],
    };
    userVMs.push(item);
    if (!nodesMap[node]) nodesMap[node] = { vms: [], containers: [] };
    if (type === 'vm') nodesMap[node].vms.push(item);
    else nodesMap[node].containers.push(item);
  }

  for (const [nodeName, data] of Object.entries(nodesMap)) {
    if (!onlineNodes[nodeName]) continue;
    userNodes.push({
      name: nodeName,
      status: 'online',
      vms: [...data.vms, ...data.containers],
    });
  }

  return { vms: userVMs, nodesWithVms: userNodes };
}

async function buildStorage(url, ticket, resources) {
  const storageOut = [];
  let storages = resources?.parsed?.storage;
  let nodes = resources?.parsed?.nodes?.map((n) => ({ node: n.node, status: n.status }));

  if (!storages?.length) {
    storages = await proxmoxApiCall(url, ticket, '/storage');
    const nodesApi = await proxmoxApiCall(url, ticket, '/nodes');
    nodes = nodesApi;
  }

  if (!Array.isArray(storages)) return { storage: storageOut };

  const storageStatusPaths = [];
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      const nodeName = node.node ?? '';
      if (!nodeName || (node.status && node.status !== 'online')) continue;
      for (const storage of storages) {
        const storageName = storage.storage ?? '';
        if (!storageName) continue;
        const shared = parseInt(storage.shared ?? 0, 10);
        const storageNodes = storage.nodes ?? '';
        if (shared === 1 || !storageNodes || storageNodes.includes(nodeName)) {
          const key = `${nodeName}${STORAGE_KEY_SEP}${storageName}`;
          storageStatusPaths.push({
            key,
            path: `/nodes/${nodeName}/storage/${storageName}/status`,
          });
        }
      }
    }
  }

  const statusResults = storageStatusPaths.length
    ? await proxmoxApiCallMulti(url, ticket, storageStatusPaths)
    : {};

  const storageStats = {};
  for (const [key, status] of Object.entries(statusResults)) {
    if (!status || typeof status !== 'object') continue;
    const sep = key.indexOf(STORAGE_KEY_SEP);
    if (sep < 0) continue;
    const storageName = key.slice(sep + STORAGE_KEY_SEP.length);
    if (
      !storageStats[storageName] ||
      (status.total ?? 0) > (storageStats[storageName].total ?? 0)
    ) {
      storageStats[storageName] = status;
    }
  }

  const seenNames = new Set();
  for (const storage of storages) {
    const storageName = storage.storage ?? '';
    if (!storageName || seenNames.has(storageName)) continue;
    const status = storageStats[storageName];
    if (!status) continue;
    seenNames.add(storageName);
    let total = 0;
    let used = 0;
    let available = 0;
    let active = parseInt(storage.active ?? 0, 10);
    let enabled = parseInt(storage.enabled ?? 0, 10);

    if (status) {
      total = parseInt(status.total ?? 0, 10) / 1024 / 1024 / 1024;
      used = parseInt(status.used ?? 0, 10) / 1024 / 1024 / 1024;
      available = parseInt(status.avail ?? 0, 10) / 1024 / 1024 / 1024;
      if (status.active != null) active = parseInt(status.active, 10);
    } else {
      total = parseInt(storage.total ?? 0, 10) / 1024 / 1024 / 1024;
      used = parseInt(storage.used ?? 0, 10) / 1024 / 1024 / 1024;
      available = parseInt(storage.avail ?? 0, 10) / 1024 / 1024 / 1024;
    }

    if (!storage.enabled && !storage.disable) enabled = 1;
    if (parseInt(storage.disable ?? 0, 10) === 1) enabled = 0;
    if (active === 0 && enabled === 1) active = 1;

    storageOut.push({
      name: storageName,
      type: storage.type ?? 'unknown',
      content: [],
      active,
      enabled,
      total: Math.round(total * 100) / 100,
      used: Math.round(used * 100) / 100,
      available: Math.round(available * 100) / 100,
    });
  }

  return { storage: storageOut };
}

/**
 * @param {object} ctx { url, ticket, sessionId, debug }
 * @param {string} action
 * @param {object} req express request
 */
export async function handleDataAction(ctx, action, req) {
  const { url, ticket, sessionId } = ctx;
  action = (action || 'all').toLowerCase().trim();
  if (!VALID_ACTIONS.has(action)) {
    return { error: 'Action invalide', action };
  }

  const result = {};
  const needsResources = ['all', 'nodes', 'vms', 'resources', 'storage', 'tasks'].includes(action);

  let resources = null;
  if (needsResources) {
    resources = await loadResources(url, ticket, sessionId);
    if (!resources) {
      return { error: 'Impossible de récupérer les ressources depuis l\'API Proxmox' };
    }
    if (action === 'resources') {
      const cached = getCachedResources(sessionId, config.collector.resourcesIntervalMs);
      return {
        resourcesRaw: { all: resources.all },
        cachedAt: cached?.fetchedAt ?? Date.now(),
      };
    }
    result.resources = resources.parsed;
    result.resourcesRaw = { all: resources.all, storage: resources.parsed.storage };
  }

  if (action === 'all' || action === 'nodes') {
    Object.assign(result, await buildNodes(url, ticket, resources));
  }

  if (action === 'all' || action === 'vms') {
    Object.assign(result, await buildVms(url, ticket, resources));
  }

  if (action === 'all' || action === 'storage') {
    Object.assign(result, await buildStorage(url, ticket, resources));
  }

  if (action === 'console') {
    const vmid = parseInt(req.query.vmid ?? 0, 10);
    const node = req.query.node ?? '';
    const type = req.query.type ?? 'vm';
    const fullUsername =
      req.session?.proxmoxFullUsername ??
      (req.session?.proxmoxUsername
        ? `${req.session.proxmoxUsername}@${req.session.proxmoxRealm ?? 'pam'}`
        : null);
    if (!node) {
      result.error = 'Paramètre node manquant';
    } else if (type === 'node' || type === 'shell') {
      Object.assign(result, await fetchNodeShellAccess(url, ticket, node, fullUsername));
    } else if (vmid > 0) {
      Object.assign(result, await fetchConsoleAccess(url, ticket, node, vmid, type, fullUsername));
    } else {
      result.error = 'Paramètres manquants (vmid ou node)';
    }
  }

  if (action === 'vmstats') {
    const body = req.body && Object.keys(req.body).length ? req.body : {};
    const runningList = body.running ?? [];
    Object.assign(result, await fetchVmStats(url, ticket, sessionId, runningList));
  }

  if (action === 'tasks') {
    result.tasks = await fetchProxmoxTasks(url, ticket, resources);
  }

  if (action === 'task-stop') {
    const upid = req.query.upid ?? req.body?.upid ?? '';
    const node = req.query.node ?? req.body?.node ?? '';
    if (upid && node) {
      const resp = await proxmoxApiCall(url, ticket, `/nodes/${node}/tasks/${encodeURIComponent(upid)}`, 'DELETE');
      result.success = resp !== null;
      result.message = result.success ? 'Tâche arrêtée avec succès' : 'Erreur lors de l\'arrêt de la tâche';
    } else {
      result.success = false;
      result.message = 'Paramètres manquants';
    }
  }

  if (action === 'task-details') {
    const upid = req.query.upid ?? '';
    const node = req.query.node ?? '';
    if (upid && node) {
      const enc = encodeURIComponent(upid);
      const status = await proxmoxApiCall(url, ticket, `/nodes/${node}/tasks/${enc}/status`);
      const log = await proxmoxApiCall(url, ticket, `/nodes/${node}/tasks/${enc}/log`);
      result.task = { status, log };
    } else {
      result.error = 'Paramètres manquants';
    }
  }

  if (action === 'vm-action') {
    const vmid = parseInt(req.body?.vmid ?? req.query?.vmid ?? 0, 10);
    const node = req.body?.node ?? req.query?.node ?? '';
    const validActions = ['start', 'stop', 'restart', 'shutdown', 'suspend', 'resume'];
    let vmAction = req.body?.vmAction ?? req.query?.action ?? '';
    if (!vmAction && validActions.includes(req.body?.action)) {
      vmAction = req.body.action;
    }
    const type = req.body?.type ?? req.query?.type ?? 'vm';
    if (vmid > 0 && node && validActions.includes(vmAction)) {
      const apiAction = vmAction === 'restart' ? 'reboot' : vmAction;
      const endpoint =
        type === 'vm'
          ? `/nodes/${node}/qemu/${vmid}/status/${apiAction}`
          : `/nodes/${node}/lxc/${vmid}/status/${apiAction}`;
      const response = await proxmoxApiCall(url, ticket, endpoint, 'POST');
      result.success = response !== null;
      result.message = result.success
        ? `Action ${vmAction} exécutée avec succès`
        : 'Erreur lors de l\'exécution de l\'action';
      if (response) result.task = response;
    } else {
      result.success = false;
      result.message = vmid > 0 ? 'Action invalide' : 'Paramètres manquants';
    }
  }

  if (action === 'vm-config') {
    const vmid = parseInt(req.query.vmid ?? 0, 10);
    const node = req.query.node ?? '';
    const type = req.query.type ?? 'vm';
    if (vmid > 0 && node) {
      const endpoint =
        type === 'vm'
          ? `/nodes/${node}/qemu/${vmid}/config`
          : `/nodes/${node}/lxc/${vmid}/config`;
      const cfg = await proxmoxApiCall(url, ticket, endpoint);
      if (cfg) {
        result.config = cfg;
        result.parsed = parseProxmoxGuestConfig(cfg, type);
      } else result.error = 'Impossible de récupérer la configuration';
    } else {
      result.error = 'Paramètres manquants';
    }
  }

  if (action === 'vm-config-update') {
    const vmid = parseInt(req.body?.vmid ?? req.query?.vmid ?? 0, 10);
    const node = req.body?.node ?? req.query?.node ?? '';
    const type = req.body?.type ?? req.query?.type ?? 'vm';
    if (vmid > 0 && node) {
      const endpoint =
        type === 'vm'
          ? `/nodes/${node}/qemu/${vmid}/config`
          : `/nodes/${node}/lxc/${vmid}/config`;
      const existingCfg = await proxmoxApiCall(url, ticket, endpoint);
      if (!existingCfg) {
        result.success = false;
        result.message = 'Impossible de lire la configuration actuelle';
      } else {
        let payload;
        if (req.body?.configJson) {
          try {
            const editorData = JSON.parse(req.body.configJson);
            payload = buildGuestConfigPayloadFromEditor(editorData, type, existingCfg);
          } catch {
            result.success = false;
            result.message = 'JSON de configuration invalide';
            return result;
          }
        } else {
          payload = buildGuestConfigPayload(
            {
              vcpu: req.body?.vcpu ?? req.body?.cores,
              memory: req.body?.memory,
              bootOrder: req.body?.bootOrder ?? req.body?.boot,
              autostart:
                req.body?.autostart === true ||
                req.body?.autostart === 'true' ||
                req.body?.autostart === '1' ||
                req.body?.autostart === 1,
              iso: req.body?.iso ?? '',
              storage: req.body?.storage ?? '',
            },
            type,
            parseProxmoxGuestConfig(existingCfg, type)
          );
        }
        const response = await proxmoxApiCall(url, ticket, endpoint, 'PUT', payload);
        result.success = response !== null;
        result.message = result.success
          ? 'Configuration mise à jour avec succès'
          : 'Erreur lors de la mise à jour de la configuration';
        if (response) result.task = response;
      }
    } else {
      result.success = false;
      result.message = 'Paramètres manquants';
    }
  }

  if (action === 'config-options') {
    const node = req.query.node ?? '';
    if (!node) {
      result.error = 'Paramètres manquants';
    } else {
      Object.assign(result, await fetchConfigOptions(url, ticket, node));
    }
  }

  if (action === 'qemu-schema') {
    result.schema = QEMU_CONFIG_SCHEMA;
  }

  if (action === 'guest-schema') {
    Object.assign(result, getCombinedConfigSchema());
  }

  if (action === 'storage-content') {
    const node = req.query.node ?? '';
    const storage = req.query.storage ?? '';
    const contentType = req.query.content ?? 'iso';
    if (node && storage) {
      const items = await proxmoxApiCall(
        url,
        ticket,
        `/nodes/${node}/storage/${storage}/content?content=${encodeURIComponent(contentType)}`
      );
      result.content = Array.isArray(items)
        ? items.map((item) => ({
            volid: item.volid ?? '',
            format: item.format ?? '',
            size: item.size ?? 0,
          }))
        : [];
    } else {
      result.error = 'Paramètres manquants';
    }
  }

  if (action === 'vm-notes') {
    const vmid = parseInt(req.query.vmid ?? req.body?.vmid ?? 0, 10);
    const node = req.query.node ?? req.body?.node ?? '';
    const type = req.query.type ?? req.body?.type ?? 'vm';
    const notes = req.body?.notes;
    if (vmid > 0 && node) {
      const endpoint =
        type === 'vm'
          ? `/nodes/${node}/qemu/${vmid}/config`
          : `/nodes/${node}/lxc/${vmid}/config`;
      if (notes !== undefined && notes !== null) {
        const response = await proxmoxApiCall(url, ticket, endpoint, 'PUT', { description: notes });
        result.success = response !== null;
        result.message = result.success
          ? 'Notes mises à jour avec succès'
          : 'Erreur lors de la mise à jour des notes';
      } else {
        const cfg = await proxmoxApiCall(url, ticket, endpoint);
        if (cfg) result.notes = cfg.description ?? '';
        else result.error = 'Impossible de récupérer les notes';
      }
    } else {
      result.error = 'Paramètres manquants';
    }
  }

  if (action === 'clone') {
    const vmid = parseInt(req.body?.vmid ?? 0, 10);
    const newid = parseInt(req.body?.newid ?? 0, 10);
    const node = req.body?.node ?? '';
    const target = req.body?.target ?? '';
    const name = req.body?.name ?? '';
    const linked = req.body?.linked === '1' || req.body?.linked === true;
    const type = req.body?.type ?? 'vm';
    if (vmid > 0 && newid > 0 && node) {
      const endpoint =
        type === 'vm'
          ? `/nodes/${node}/qemu/${vmid}/clone`
          : `/nodes/${node}/lxc/${vmid}/clone`;
      const data = { newid, name, full: linked ? 0 : 1 };
      if (target) data.target = target;
      const response = await proxmoxApiCall(url, ticket, endpoint, 'POST', data);
      result.success = response !== null;
      result.message = result.success
        ? `VM clonée avec succès${linked ? ' (linked clone)' : ''}`
        : 'Erreur lors du clonage';
      if (response) result.task = response;
    } else {
      result.success = false;
      result.message = 'Paramètres manquants';
    }
  }

  if (action === 'cluster-config') {
    const section = req.query.section ?? '';
    const node = req.query.node ?? '';
    if (!section) {
      result.error = 'Section requise';
    } else {
      Object.assign(result, await fetchClusterConfigSection(ctx, section, { node }));
    }
  }

  if (action === 'cluster-config-mutate') {
    const body = req.body ?? {};
    const section = body.section ?? '';
    if (!section) {
      result.error = 'Section requise';
    } else {
      const out = await mutateClusterConfig(ctx, {
        section,
        operation: body.operation ?? 'update',
        id: body.id ?? '',
        node: body.node ?? '',
        sub: body.sub ?? '',
        scope: body.scope ?? '',
        data: body.data ?? {},
      });
      Object.assign(result, out);
      result.ok = out.ok === true;
    }
  }

  if (action === 'cluster-config-lookups') {
    Object.assign(result, await fetchClusterConfigLookups(ctx, req.query || {}));
    result.ok = true;
  }

  return result;
}
