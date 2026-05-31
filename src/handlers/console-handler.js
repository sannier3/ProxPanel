import { proxmoxApiCall } from '../services/proxmox-client.js';
import { buildPveXtermReferer } from '../lib/pve-xterm-referer.js';

/**
 * Obtient un ticket console Proxmox (vncproxy / termproxy) pour l'utilisateur connecté.
 * L'iframe vers l'UI PVE ne fonctionne pas sans cookie de session sur :8006.
 */
function normalizeConsoleType(type) {
  const t = String(type ?? 'vm').toLowerCase();
  if (t === 'qemu' || t === 'vm') return 'vm';
  if (t === 'lxc' || t === 'ct') return 'lxc';
  return t;
}

export async function fetchConsoleAccess(url, ticket, node, vmid, type, fullUsername = null) {
  const kind = normalizeConsoleType(type);
  const isVm = kind === 'vm';

  if (isVm) {
    const proxy = await proxmoxApiCall(
      url,
      ticket,
      `/nodes/${encodeURIComponent(node)}/qemu/${vmid}/vncproxy`,
      'POST',
      { websocket: 1 }
    );
    if (!proxy?.ticket) {
      return { error: 'Impossible d\'obtenir le proxy VNC (VM arrêtée ou droits insuffisants)' };
    }
    return {
      console: {
        type: 'vm',
        node,
        vmid,
        proxmoxUrl: url,
        port: proxy.port,
        ticket: proxy.ticket,
        cert: proxy.cert ?? null,
        user: fullUsername,
      },
    };
  }

  const referer = buildPveXtermReferer(url, 'lxc', node, vmid);
  const origin = url.replace(/\/$/, '');
  const proxy = await proxmoxApiCall(
    url,
    ticket,
    `/nodes/${encodeURIComponent(node)}/lxc/${vmid}/termproxy`,
    'POST',
    null,
    { Referer: referer, Origin: origin }
  );
  if (!proxy?.ticket) {
    return { error: 'Impossible d\'obtenir le proxy terminal (CT arrêté ou droits insuffisants)' };
  }
  return {
    console: {
      type: 'lxc',
      node,
      vmid,
      proxmoxUrl: url,
      port: proxy.port,
      ticket: proxy.ticket,
      /** Utilisateur renvoyé par termproxy (requis pour l’auth WebSocket). */
      user: proxy.user ?? fullUsername,
    },
  };
}

/**
 * Shell interactif sur l’hyperviseur (nœud PVE) — POST /nodes/{node}/termproxy
 */
export async function fetchNodeShellAccess(url, ticket, node, fullUsername = null) {
  const referer = buildPveXtermReferer(url, 'shell', node, '', '');
  const origin = url.replace(/\/$/, '');
  const proxy = await proxmoxApiCall(
    url,
    ticket,
    `/nodes/${encodeURIComponent(node)}/termproxy`,
    'POST',
    null,
    { Referer: referer, Origin: origin }
  );
  if (!proxy?.ticket) {
    return { error: 'Impossible d\'ouvrir le shell du nœud (hors ligne ou droits insuffisants)' };
  }
  return {
    console: {
      type: 'node',
      node,
      proxmoxUrl: url,
      port: proxy.port,
      ticket: proxy.ticket,
      user: proxy.user ?? fullUsername,
    },
  };
}
