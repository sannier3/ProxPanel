/**
 * Console LXC - protocole pve-xtermjs + barre d’outils (équivalent VM adapté terminal).
 */

const MIN_FONT = 10;
const MAX_FONT = 22;

function pveMsgByteLength(str) {
  return unescape(encodeURIComponent(str)).length;
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text ?? '';
}

async function main() {
  const qs = new URLSearchParams(location.search);
  const consoleType = (qs.get('type') || 'lxc').toLowerCase();
  const isNodeShell = consoleType === 'node' || consoleType === 'shell';
  const vmid = qs.get('vmid');
  const node = qs.get('node');

  if (!node) {
    setStatus('Paramètre node manquant');
    return;
  }
  if (!isNodeShell && !vmid) {
    setStatus('Paramètres vmid ou node manquants');
    return;
  }

  if (isNodeShell) {
    document.title = `Shell — ${node}`;
  }

  setStatus('Obtention du ticket…');

  let data;
  try {
    const apiUrl = isNodeShell
      ? `/api/data?action=console&node=${encodeURIComponent(node)}&type=node`
      : `/api/data?action=console&vmid=${encodeURIComponent(vmid)}&node=${encodeURIComponent(node)}&type=lxc`;
    const res = await fetch(apiUrl, { credentials: 'include' });
    data = await res.json();
  } catch (e) {
    setStatus(`Erreur réseau: ${e.message}`);
    return;
  }

  if (!data?.console?.ticket || data.console.port == null) {
    setStatus(data?.error || 'Impossible d\'ouvrir la console');
    return;
  }

  const { port, ticket, user } = data.console;
  const wsParams = new URLSearchParams({
    node,
    type: isNodeShell ? 'node' : 'lxc',
    port: String(port),
    vncticket: ticket,
  });
  if (!isNodeShell) wsParams.set('vmid', vmid);
  if (user) wsParams.set('user', user);

  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${location.host}/api/console/ws?${wsParams}`;

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'Consolas', 'Courier New', monospace",
    theme: {
      background: '#0c0c0c',
      foreground: '#cccccc',
      cursor: '#ffffff',
    },
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));

  let socket;
  const states = { connecting: 1, connected: 2, disconnected: 3 };
  let state = states.connecting;

  function sendRaw(str) {
    if (state === states.connected && socket?.readyState === WebSocket.OPEN) {
      socket.send(`0:${pveMsgByteLength(str)}:${str}`);
    }
  }

  function sendResize() {
    fitAddon.fit();
    if (state === states.connected && term.cols > 0 && term.rows > 0) {
      socket.send(`1:${term.cols}:${term.rows}:`);
    }
  }

  function runTerminal() {
    socket.onmessage = (event) => {
      const answer =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new Uint8Array(new TextEncoder().encode(String(event.data)));

      if (state === states.connected) {
        term.write(answer);
        return;
      }

      if (state === states.connecting) {
        if (answer.length >= 2 && answer[0] === 79 && answer[1] === 75) {
          state = states.connected;
          setStatus('');
          if (answer.length > 2) {
            term.write(answer.subarray(2));
          }
          setTimeout(() => {
            sendResize();
            term.focus();
          }, 100);
        } else {
          setStatus('Connexion refusée');
          socket.close();
        }
      }
    };

    term.onData((data) => {
      sendRaw(data);
    });

    term.onResize((size) => {
      if (state === states.connected && socket.readyState === WebSocket.OPEN) {
        socket.send(`1:${size.cols}:${size.rows}:`);
      }
    });

    setInterval(() => {
      if (state === states.connected && socket.readyState === WebSocket.OPEN) {
        socket.send('2');
      }
    }, 30000);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sendResize, 250);
    });
  }

  setStatus('Connexion WebSocket…');
  socket = new WebSocket(wsUrl, 'binary');
  socket.binaryType = 'arraybuffer';

  socket.onopen = () => runTerminal();

  socket.onerror = () => {
    setStatus('Erreur WebSocket');
    state = states.disconnected;
  };

  socket.onclose = (ev) => {
    state = states.disconnected;
    if (!ev.wasClean) {
      term.writeln(`\r\n\x1b[31mConnexion fermée (${ev.code})\x1b[0m`);
    }
  };

  document.querySelector('.console-lxc-toolbar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'copy': {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard?.writeText(sel).catch(() => {});
        }
        break;
      }
      case 'paste':
        navigator.clipboard?.readText().then((text) => {
          if (text) sendRaw(text);
        }).catch(() => {});
        break;
      case 'font-dec': {
        const next = Math.max(MIN_FONT, (term.options.fontSize || 14) - 1);
        term.options.fontSize = next;
        sendResize();
        break;
      }
      case 'font-inc': {
        const next = Math.min(MAX_FONT, (term.options.fontSize || 14) + 1);
        term.options.fontSize = next;
        sendResize();
        break;
      }
      case 'fit':
        sendResize();
        term.focus();
        break;
      case 'fullscreen': {
        const layout = document.getElementById('console-layout');
        if (!document.fullscreenElement) {
          layout?.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
        setTimeout(sendResize, 200);
        break;
      }
      case 'reload':
        location.reload();
        break;
      default:
        break;
    }
  });
}

main();
