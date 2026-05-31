/**
 * Registre des clés config Proxmox → section UI / type d'éditeur.
 */
(function (global) {
  const READONLY = new Set(['digest', 'vmgenid', 'meta', 'lock', 'template', 'snaptime', 'parent']);
  const NON_PERSIST = new Set(['unprivileged']);

  const VM_DISK_RE = /^(scsi|ide|sata|virtio|efidisk|unused)\d+$/i;
  const ATTACHED_DISK_RE = /^(scsi|ide|sata|virtio|efidisk)\d+$/i;
  const UNUSED_DISK_RE = /^unused\d+$/i;
  const NET_RE = /^net\d+$/i;
  const MP_RE = /^mp\d+$/i;
  const IPCONFIG_RE = /^ipconfig\d+$/i;
  const HOSTPCI_RE = /^hostpci\d+$/i;
  const USB_RE = /^usb\d+$/i;
  const SERIAL_RE = /^serial\d+$/i;

  const QEMU_GENERAL = new Set([
    'description', 'onboot', 'startup', 'tags', 'ostype', 'name', 'protection', 'hookscript',
  ]);
  const QEMU_CPU = new Set([
    'cores', 'sockets', 'vcpus', 'cpu', 'numa', 'memory', 'balloon', 'shares', 'cpulimit', 'cpuunits', 'affinity',
  ]);
  const QEMU_HARDWARE = new Set([
    'bios', 'machine', 'agent', 'tablet', 'kvm', 'acpi', 'vga', 'scsihw', 'hotplug', 'arch',
  ]);
  const QEMU_BOOT = new Set(['boot', 'efidisk0']);
  const QEMU_CLOUDINIT = new Set([
    'ciuser', 'cipassword', 'searchdomain', 'nameserver', 'sshkeys', 'citype', 'cicustom',
  ]);

  const LXC_GENERAL = new Set([
    'description', 'onboot', 'startup', 'tags', 'hostname', 'arch', 'features',
    'console', 'tty', 'cmode', 'protection', 'hookscript', 'entrypoint', 'env',
    'nameserver', 'searchdomain', 'ostype', 'unprivileged',
  ]);
  const LXC_CPU = new Set(['cores', 'memory', 'swap', 'cpulimit', 'cpuunits']);
  const LXC_STORAGE = new Set(['rootfs']);

  function classifyKey(key, type = 'vm') {
    if (!key || READONLY.has(key)) return { kind: 'readonly', tab: 'advanced' };
    if (NET_RE.test(key)) return { kind: 'net', tab: 'network' };
    if (MP_RE.test(key)) return { kind: 'mount', tab: 'mounts' };
    if (IPCONFIG_RE.test(key)) return { kind: 'ipconfig', tab: 'cloudinit' };

    if (type === 'vm') {
      if (UNUSED_DISK_RE.test(key)) return { kind: 'unused', tab: 'disks' };
      if (ATTACHED_DISK_RE.test(key)) return { kind: 'disk', tab: 'disks' };
      if (QEMU_GENERAL.has(key)) return { kind: 'scalar', tab: 'general' };
      if (QEMU_CPU.has(key)) return { kind: 'scalar', tab: 'cpu' };
      if (QEMU_HARDWARE.has(key)) return { kind: 'scalar', tab: 'hardware' };
      if (QEMU_BOOT.has(key)) return { kind: 'scalar', tab: 'boot' };
      if (QEMU_CLOUDINIT.has(key)) return { kind: 'scalar', tab: 'cloudinit' };
      if (HOSTPCI_RE.test(key) || USB_RE.test(key) || SERIAL_RE.test(key)) {
        return { kind: 'passthrough', tab: 'advanced' };
      }
    } else {
      if (key === 'rootfs' || LXC_STORAGE.has(key)) return { kind: 'disk', tab: 'disks' };
      if (LXC_GENERAL.has(key)) return { kind: 'scalar', tab: 'general' };
      if (LXC_CPU.has(key)) return { kind: 'scalar', tab: 'cpu' };
    }
    return { kind: 'advanced', tab: 'advanced' };
  }

  function isEditableKey(key) {
    return key && !READONLY.has(key);
  }

  function diskKeysFromEntries(entries, type) {
    const keys = [];
    for (const k of entries.keys()) {
      if (UNUSED_DISK_RE.test(k)) continue;
      const c = classifyKey(k, type);
      if (c.kind === 'disk' && !String(entries.get(k)).includes('iso/')) keys.push(k);
    }
    return keys.sort();
  }

  function isoKeysFromEntries(entries) {
    const keys = [];
    for (const [k, v] of entries) {
      if (VM_DISK_RE.test(k) && String(v).includes('iso/')) keys.push(k);
    }
    return keys.sort();
  }

  function tabsForType(type) {
    if (type === 'lxc') {
      return [
        { id: 'general', label: 'Général', icon: 'fa-sliders' },
        { id: 'cpu', label: 'CPU & RAM', icon: 'fa-microchip' },
        { id: 'disks', label: 'Stockage', icon: 'fa-hard-drive' },
        { id: 'network', label: 'Réseau', icon: 'fa-network-wired' },
        { id: 'mounts', label: 'Montages', icon: 'fa-folder-open' },
        { id: 'advanced', label: 'Avancé', icon: 'fa-code' },
      ];
    }
    return [
      { id: 'general', label: 'Général', icon: 'fa-sliders' },
      { id: 'cpu', label: 'CPU & RAM', icon: 'fa-microchip' },
      { id: 'hardware', label: 'Matériel', icon: 'fa-server' },
      { id: 'boot', label: 'Boot & ISO', icon: 'fa-compact-disc' },
      { id: 'disks', label: 'Disques', icon: 'fa-hard-drive' },
      { id: 'network', label: 'Réseau', icon: 'fa-network-wired' },
      { id: 'cloudinit', label: 'Cloud-Init', icon: 'fa-cloud' },
      { id: 'advanced', label: 'Avancé', icon: 'fa-code' },
    ];
  }

  const ADVANCED_HINT_KEYS = [
    'hookscript', 'cpuunits', 'cpulimit', 'affinity', 'protection', 'pool',
    'serial0', 'serial1', 'usb0', 'hostpci0', 'hostpci1', 'rng0', 'audio0',
    'watchdog', 'spice_enhancements', 'vmstatestorage', 'localtime', 'startdate', 'smbios1',
  ];

  global.ProxPanelConfig = global.ProxPanelConfig || {};
  global.ProxPanelConfig.Registry = {
    NON_PERSIST: NON_PERSIST,
    READONLY,
    VM_DISK_RE,
    ATTACHED_DISK_RE,
    UNUSED_DISK_RE,
    NET_RE,
    MP_RE,
    classifyKey,
    isEditableKey,
    diskKeysFromEntries,
    isoKeysFromEntries,
    tabsForType,
    ADVANCED_HINT_KEYS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
