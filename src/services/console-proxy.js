import { WebSocketServer, WebSocket } from 'ws';
import https from 'https';
import { URL } from 'url';
import { config } from '../config.js';
import { buildPveXtermReferer } from '../lib/pve-xterm-referer.js';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function apiWsBase(proxmoxUrl) {
  const base = new URL(proxmoxUrl);
  const wsProtocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const port = base.port || (base.protocol === 'https:' ? '443' : '80');
  return `${wsProtocol}//${base.hostname}:${port}/api2/json`;
}

function buildUpstreamPath(type, node, vmid, port, vncticket) {
  const encTicket = encodeURIComponent(vncticket);
  const encNode = encodeURIComponent(node);
  if (type === 'vm' || type === 'qemu') {
    return `/nodes/${encNode}/qemu/${vmid}/vncwebsocket?port=${port}&vncticket=${encTicket}`;
  }
  if (type === 'node' || type === 'shell') {
    return `/nodes/${encNode}/vncwebsocket?port=${port}&vncticket=${encTicket}`;
  }
  return `/nodes/${encNode}/lxc/${vmid}/vncwebsocket?port=${port}&vncticket=${encTicket}`;
}

function pipeWebSockets(clientWs, upstream, { onUpstreamOpen } = {}) {
  const pendingToUpstream = [];

  const flushToUpstream = () => {
    if (upstream.readyState !== WebSocket.OPEN) return;
    while (pendingToUpstream.length > 0) {
      const { data, isBinary } = pendingToUpstream.shift();
      upstream.send(data, { binary: isBinary });
    }
  };

  const sendToUpstream = (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      pendingToUpstream.push({ data, isBinary });
    }
  };

  upstream.on('open', () => {
    if (onUpstreamOpen) onUpstreamOpen(upstream);
    flushToUpstream();
  });

  upstream.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('message', (data, isBinary) => {
    sendToUpstream(data, isBinary);
  });

  const closeBoth = () => {
    try {
      clientWs.close();
    } catch {
      /* ignore */
    }
    try {
      upstream.close();
    } catch {
      /* ignore */
    }
  };

  clientWs.on('close', closeBoth);
  clientWs.on('error', closeBoth);
  upstream.on('close', closeBoth);
  upstream.on('error', closeBoth);
}

/**
 * Relaie la console PVE via ProxPanel (session + certificat côté serveur).
 */
export function attachConsoleWebSocket(httpServer, sessionMiddleware) {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols(protocols) {
      if (protocols.has('binary')) return 'binary';
      return protocols.values().next().value ?? false;
    },
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    if (reqUrl.pathname !== '/api/console/ws') {
      return;
    }

    sessionMiddleware(req, {}, () => {
      if (!config.prod) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      if (!req.session?.proxmoxTicket || !req.session?.proxmoxUrl) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const node = reqUrl.searchParams.get('node') ?? '';
      const vmid = parseInt(reqUrl.searchParams.get('vmid') ?? '0', 10);
      const type = reqUrl.searchParams.get('type') ?? 'vm';
      const port = reqUrl.searchParams.get('port') ?? '';
      const vncticket = reqUrl.searchParams.get('vncticket') ?? '';
      const isNodeShell = type === 'node' || type === 'shell';
      const isVm = type === 'vm' || type === 'qemu';

      if (!node || !port || !vncticket) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      if (isVm && !vmid) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      if (!isVm && !isNodeShell && !vmid) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (clientWs) => {
        const pveUrl = req.session.proxmoxUrl;
        const pveTicket = req.session.proxmoxTicket.ticket;
        const isTermJs = !isVm;
        const sessionUser =
          req.session.proxmoxFullUsername ??
          `${req.session.proxmoxUsername}@${req.session.proxmoxRealm ?? 'pam'}`;
        const pveUser = reqUrl.searchParams.get('user') || sessionUser;
        const upstreamUrl =
          apiWsBase(pveUrl) + buildUpstreamPath(type, node, vmid, port, vncticket);

        const wsProtocols = isTermJs ? ['binary'] : ['pve'];
        const upstreamHeaders = { Cookie: `PVEAuthCookie=${pveTicket}` };
        if (isTermJs) {
          const refererType = isNodeShell ? 'shell' : 'lxc';
          upstreamHeaders.Referer = buildPveXtermReferer(pveUrl, refererType, node, vmid || '');
        }
        const upstream = new WebSocket(upstreamUrl, wsProtocols, {
          agent: httpsAgent,
          headers: upstreamHeaders,
        });

        pipeWebSockets(clientWs, upstream, {
          onUpstreamOpen: isTermJs
            ? (ws) => {
                ws.send(`${pveUser}:${vncticket}\n`);
              }
            : undefined,
        });
      });
    });
  });
}
