/**
 * Referer requis par Proxmox pour termproxy en mode xterm.js (pas VNC binaire).
 * @see https://forum.proxmox.com/threads/how-to-tell-vncwebsocket-to-reply-in-text-mode-suitable-for-xterm-js.160547/
 */
export function buildPveXtermReferer(proxmoxUrl, type, node, vmid, vmname = '') {
  const base = proxmoxUrl.replace(/\/$/, '');
  const t = String(type ?? 'lxc').toLowerCase();
  let consoleType = 'lxc';
  if (t === 'vm' || t === 'qemu') consoleType = 'kvm';
  else if (t === 'shell' || t === 'node') consoleType = 'shell';

  const params = new URLSearchParams({
    console: consoleType,
    xtermjs: '1',
    node,
    cmd: '',
  });
  if (consoleType !== 'shell' && vmid != null && vmid !== '') {
    params.set('vmid', String(vmid));
  }
  if (vmname) params.set('vmname', vmname);
  return `${base}/?${params.toString()}`;
}
