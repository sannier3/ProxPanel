/**
 * Mapping config invité Proxmox ↔ formulaire / éditeur ProxPanel.
 */

const VM_DISK_KEY = /^(scsi|ide|sata|virtio|efidisk|unused)\d+$/i;
const NET_KEY = /^net\d+$/i;
const LXC_MP_KEY = /^mp\d+$/i;
const READONLY_KEYS = new Set(['digest', 'vmgenid', 'meta', 'lock', 'template']);

export function isDiskKey(key) {
  return VM_DISK_KEY.test(key) || key === 'rootfs';
}

export function isNetKey(key) {
  return NET_KEY.test(key);
}

export function isMountKey(key) {
  return LXC_MP_KEY.test(key) || key === 'rootfs';
}

export function isEditableKey(key) {
  return key && !READONLY_KEYS.has(key);
}

function findIsoFromConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return { iso: '', storage: '', mediaKey: '' };
  for (const [key, val] of Object.entries(cfg)) {
    if (typeof val !== 'string' || !val.includes('iso/')) continue;
    const match = val.match(/^([^:]+):iso\/([^,]+)/);
    if (match) {
      return { storage: match[1], iso: match[2], mediaKey: key };
    }
  }
  return { iso: '', storage: '', mediaKey: '' };
}

export function parseProxmoxGuestConfig(cfg, type = 'vm') {
  const cores = parseInt(cfg?.cores ?? 1, 10);
  const sockets = parseInt(cfg?.sockets ?? 1, 10);
  const memory = parseInt(cfg?.memory ?? 512, 10);
  const onboot = parseInt(cfg?.onboot ?? 0, 10) === 1;
  const isoInfo = type === 'vm' ? findIsoFromConfig(cfg) : { iso: '', storage: '', mediaKey: '' };

  return {
    vcpu: Math.max(1, cores * Math.max(1, sockets)),
    cores: Math.max(1, cores),
    sockets: Math.max(1, sockets),
    memory,
    bootOrder: cfg?.boot ?? (type === 'vm' ? 'order=scsi0' : ''),
    autostart: onboot,
    iso: isoInfo.iso,
    storage: isoInfo.storage,
    mediaKey: isoInfo.mediaKey || 'ide2',
  };
}

export function buildGuestConfigPayload(form, type = 'vm', existingCfg = {}) {
  const payload = {};

  if (type === 'vm') {
    payload.cores = Math.max(1, parseInt(form.vcpu ?? form.cores ?? 1, 10));
    payload.memory = Math.max(16, parseInt(form.memory ?? 512, 10));
    if (form.bootOrder) payload.boot = form.bootOrder;
    payload.onboot = form.autostart ? 1 : 0;

    const mediaKey = existingCfg.mediaKey || findIsoFromConfig(existingCfg).mediaKey || 'ide2';
    if (form.iso && form.storage) {
      payload[mediaKey] = `${form.storage}:iso/${form.iso},media=cdrom`;
    } else if (findIsoFromConfig(existingCfg).iso) {
      payload.delete = mediaKey;
    }
  } else {
    payload.cores = Math.max(1, parseInt(form.vcpu ?? 1, 10));
    payload.memory = Math.max(16, parseInt(form.memory ?? 512, 10));
    payload.onboot = form.autostart ? 1 : 0;
  }

  return payload;
}

/**
 * Construit le payload PUT Proxmox depuis l'éditeur ({ set, delete }).
 */
export function buildGuestConfigPayloadFromEditor(editorData, type = 'vm', existingCfg = {}) {
  const set = editorData?.set && typeof editorData.set === 'object' ? editorData.set : {};
  const deleteKeys = Array.isArray(editorData?.delete) ? editorData.delete : [];
  const payload = {};

  for (const [key, value] of Object.entries(set)) {
    if (!isEditableKey(key)) continue;
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str === '') {
      if (existingCfg[key] !== undefined) deleteKeys.push(key);
      continue;
    }
    payload[key] = str;
  }

  const uniqueDeletes = [...new Set(deleteKeys.filter((k) => isEditableKey(k)))];
  if (uniqueDeletes.length === 1) {
    payload.delete = uniqueDeletes[0];
  } else if (uniqueDeletes.length > 1) {
    payload.delete = uniqueDeletes.join(',');
  }

  return payload;
}

export const CONFIG_HINTS = {
  cores: 'Nombre de cœurs par socket',
  sockets: 'Nombre de sockets CPU',
  vcpus: 'vCPU total (optionnel)',
  cpu: 'Type CPU (ex: host, kvm64)',
  memory: 'RAM en MB',
  balloon: 'Balloon device en MB (0 = désactivé)',
  swap: 'Swap LXC en MB',
  onboot: '1 = démarrage automatique',
  startup: 'Ordre/délai démarrage (ex: order=1,up=30)',
  shutdown: 'Ordre/délai arrêt (ex: order=last,down=60)',
  boot: 'Ordre boot (ex: order=scsi0;ide2)',
  bios: 'SeaBIOS ou OVMF (ovmf)',
  machine: 'Type machine (ex: pc-q35-8.1)',
  agent: 'QEMU guest agent (ex: 1)',
  ostype: 'Type OS (l26, win11, ...) ',
  hostname: 'Nom d\'hôte LXC',
  arch: 'Architecture (amd64, arm64)',
  rootfs: 'Volume root (ex: local-lvm:vm-100-disk-0,size=8G)',
  scsihw: 'Contrôleur SCSI (virtio-scsi-pci, ...)',
  net0: 'virtio=MAC,bridge=vmbr0',
};
