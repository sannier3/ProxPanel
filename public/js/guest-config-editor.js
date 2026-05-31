/**
 * Éditeur de configuration invité Proxmox - UI orientée selects & builders.
 */
(function (global) {
  const PC = global.ProxPanelConfig || {};
  const Pr = PC.Parsers || {};
  const Reg = PC.Registry || {};

  const VM_DISK_RE = Reg.VM_DISK_RE || /^(scsi|ide|sata|virtio|efidisk|unused)\d+$/i;
  const NET_RE = Reg.NET_RE || /^net\d+$/i;
  const MP_RE = Reg.MP_RE || /^mp\d+$/i;
  const READONLY = Reg.READONLY || new Set(['digest', 'vmgenid', 'meta', 'lock', 'template']);
  const NON_PERSIST = Reg.NON_PERSIST || new Set(['unprivileged']);
  const CUSTOM = '__custom__';

  const parseNet = Pr.parseNet || (() => ({}));
  const buildNet = Pr.buildNet || (() => '');
  const parseLxcNet = Pr.parseLxcNet || (() => ({}));
  const buildLxcNet = Pr.buildLxcNet || (() => '');
  const parseFeatures = Pr.parseFeatures || (() => ({}));
  const buildFeatures = Pr.buildFeatures || (() => '');
  const parseDisk = Pr.parseDisk || (() => ({}));
  const buildDisk = Pr.buildDisk || (() => '');
  const parseIsoValue = Pr.parseIsoValue || (() => ({}));
  const buildIsoValue = Pr.buildIsoValue || (() => '');
  const parseStartup = Pr.parseStartup || (() => ({ order: '', up: '' }));
  const buildStartup = Pr.buildStartup || (() => '');
  const parseBootOrder = Pr.parseBootOrder || (() => []);
  const buildBootValue = Pr.buildBootValue || (() => '');
  const parseVga = Pr.parseVga || (() => ({}));
  const buildVga = Pr.buildVga || (() => '');
  const parseAgent = Pr.parseAgent || (() => ({ enabled: false }));
  const buildAgent = Pr.buildAgent || (() => '0');
  const parseMount = Pr.parseMount || (() => ({}));
  const buildMount = Pr.buildMount || (() => '');
  const parseIpconfig = Pr.parseIpconfig || (() => ({}));
  const buildIpconfig = Pr.buildIpconfig || (() => '');
  const isoSlotOptions = Pr.isoSlotOptions || (() => []);
  const diskIsCdrom = Pr.diskIsCdrom || ((s) => String(s).includes('iso/'));
  const isUnusedDiskKey = Pr.isUnusedDiskKey || ((k) => /^unused\d+$/i.test(String(k || '')));

  const OPTIONS = {
    ostype: [
      { v: '', l: '(auto / défaut)' },
      { v: 'l26', l: 'Linux 6.x (l26)' },
      { v: 'l24', l: 'Linux 4.x (l24)' },
      { v: 'win11', l: 'Windows 11' },
      { v: 'win10', l: 'Windows 10' },
      { v: 'w2k22', l: 'Windows Server 2022' },
      { v: 'w2k19', l: 'Windows Server 2019' },
      { v: 'w2k16', l: 'Windows Server 2016' },
      { v: 'w2k12', l: 'Windows Server 2012' },
      { v: 'other', l: 'Autre' },
    ],
    arch: [
      { v: 'amd64', l: 'amd64 (x86_64)' },
      { v: 'arm64', l: 'arm64' },
      { v: 'armhf', l: 'armhf' },
    ],
    cpu: [
      { v: 'host', l: 'host - passthrough CPU hôte' },
      { v: 'kvm64', l: 'kvm64 - compatible (défaut)' },
      { v: 'qemu64', l: 'qemu64' },
      { v: 'Broadwell', l: 'Intel Broadwell' },
      { v: 'Skylake-Client', l: 'Intel Skylake' },
      { v: 'EPYC', l: 'AMD EPYC' },
      { v: 'max', l: 'max - maximum fonctionnalités' },
    ],
    bios: [
      { v: '', l: 'SeaBIOS (legacy)' },
      { v: 'ovmf', l: 'UEFI (OVMF)' },
    ],
    machine: [
      { v: '', l: '(défaut q35)' },
      { v: 'pc-q35-9.0', l: 'pc-q35-9.0' },
      { v: 'pc-q35-8.1', l: 'pc-q35-8.1' },
      { v: 'pc-q35-7.2', l: 'pc-q35-7.2' },
      { v: 'pc-i440fx-7.2', l: 'pc-i440fx-7.2 (legacy)' },
    ],
    scsihw: [
      { v: 'virtio-scsi-pci', l: 'VirtIO SCSI (recommandé)' },
      { v: 'virtio-scsi-single', l: 'VirtIO SCSI single' },
      { v: 'lsi', l: 'LSI 53C895A' },
      { v: 'lsi53c810', l: 'LSI 53C810' },
      { v: 'megasas', l: 'MegaRAID SAS' },
      { v: 'pvscsi', l: 'VMware PVSCSI' },
    ],
    vga: [
      { v: 'std', l: 'Standard (std)' },
      { v: 'virtio', l: 'VirtIO GPU' },
      { v: 'qxl', l: 'QXL (SPICE)' },
      { v: 'vmware', l: 'VMware compatible' },
      { v: 'serial0', l: 'Série (sans écran)' },
      { v: 'none', l: 'Aucun' },
    ],
    agent: [
      { v: '', l: 'Désactivé' },
      { v: '1', l: 'Activé' },
      { v: 'enabled=1', l: 'Activé (enabled=1)' },
    ],
    boot: [
      { v: 'order=scsi0', l: 'Disque (scsi0) uniquement' },
      { v: 'order=ide2;scsi0', l: 'CD-ROM → Disque' },
      { v: 'order=scsi0;ide2', l: 'Disque → CD-ROM' },
      { v: 'order=net0', l: 'Réseau (PXE)' },
      { v: 'order=net0;scsi0', l: 'Réseau → Disque' },
      { v: 'order=scsi0;net0', l: 'Disque → Réseau' },
    ],
    startup: [
      { v: '', l: 'Défaut cluster' },
      { v: 'order=1', l: 'Priorité 1 (immédiat)' },
      { v: 'order=2', l: 'Priorité 2' },
      { v: 'order=3', l: 'Priorité 3' },
      { v: 'order=1,up=30', l: 'Priorité 1, délai 30 s' },
      { v: 'order=1,up=60', l: 'Priorité 1, délai 60 s' },
      { v: 'order=2,up=120', l: 'Priorité 2, délai 120 s' },
    ],
    isoSlot: [
      { v: 'ide2', l: 'IDE2 (CD-ROM classique)' },
      { v: 'ide0', l: 'IDE0' },
      { v: 'ide1', l: 'IDE1' },
      { v: 'ide3', l: 'IDE3' },
      { v: 'sata0', l: 'SATA0' },
      { v: 'sata1', l: 'SATA1' },
      { v: 'sata2', l: 'SATA2' },
      { v: 'scsi1', l: 'SCSI1' },
    ],
    netModel: [
      { v: 'virtio', l: 'VirtIO (recommandé)' },
      { v: 'e1000', l: 'Intel E1000' },
      { v: 'e1000e', l: 'Intel E1000e' },
      { v: 'rtl8139', l: 'Realtek 8139' },
      { v: 'vmxnet3', l: 'VMware vmxnet3' },
    ],
    diskBus: [
      { v: 'scsi', l: 'SCSI' },
      { v: 'virtio', l: 'VirtIO Block' },
      { v: 'sata', l: 'SATA' },
      { v: 'ide', l: 'IDE' },
    ],
    diskFormat: [
      { v: 'raw', l: 'RAW' },
      { v: 'qcow2', l: 'QCOW2' },
      { v: 'vmdk', l: 'VMDK' },
    ],
    bool: [
      { v: '0', l: 'Non' },
      { v: '1', l: 'Oui' },
    ],
    commonKeys: [
      'hookscript', 'cpuunits', 'cpulimit', 'affinity', 'protection',
      'template', 'pool', 'ciuser', 'cipassword', 'searchdomain', 'nameserver',
      'sshkeys', 'ipconfig0', 'ipconfig1', 'serial0', 'usb0', 'hostpci0',
    ],
  };

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function nextIndex(prefix, entries) {
    let i = 0;
    const re = new RegExp(`^${prefix}(\\d+)$`, 'i');
    for (const k of entries.keys()) {
      const m = k.match(re);
      if (m) i = Math.max(i, parseInt(m[1], 10) + 1);
    }
    return i;
  }

  class GuestConfigEditor {
    constructor(rootEl) {
      this.root = rootEl;
      this.entries = new Map();
      this.deleted = new Set();
      this.type = 'vm';
      this.vm = null;
      this.storageList = [];
      this.systemOptions = {};
      this.bootOrder = [];
      this.isoLists = new Map();
      this.isoMounts = [];
      this.activeTab = 'general';
      this.originalRaw = {};
    }

    async load(rawConfig, type, vm, storageList = [], systemOptions = {}) {
      this.type = type === 'lxc' ? 'lxc' : 'vm';
      this.vm = vm;
      this.storageList = storageList;
      this.systemOptions = systemOptions || {};
      this.entries = new Map();
      this.deleted = new Set();
      this.activeTab = 'general';
      this.isoLists = new Map();
      this.isoMounts = [];

      this.originalRaw = {};
      for (const [k, v] of Object.entries(rawConfig || {})) {
        if (v !== null && v !== undefined) this.originalRaw[k] = String(v);
      }

      for (const [k, v] of Object.entries(rawConfig || {})) {
        if (READONLY.has(k)) continue;
        if (v === null || v === undefined) continue;
        this.entries.set(k, String(v));
      }

      if (this.type === 'vm') {
        this.isoMounts = this.collectIsoMountsFromEntries();
        const storagesToLoad = [...new Set(this.isoMounts.map((m) => m.storage).filter(Boolean))];
        await Promise.all(storagesToLoad.map((s) => this.fetchIsoList(s)));
        this.bootOrder = this.mergeBootOrder(parseBootOrder(this.get('boot')), this.bootableDevices());
      }
      this.render();
    }

    collectIsoMountsFromEntries() {
      const mounts = [];
      for (const [k, v] of this.entries) {
        const sv = String(v);
        if (!VM_DISK_RE.test(k)) continue;
        if (!sv.includes('iso/')) continue;
        const parsed = parseIsoValue(sv);
        mounts.push({ key: k, storage: parsed.storage, file: parsed.file, extras: parsed.extras });
      }
      return mounts.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    }

    getIsoList(storage) {
      return this.isoLists.get(storage) || [];
    }

    nextIsoSlot() {
      const used = new Set(this.isoMounts.map((m) => m.key));
      for (const slot of isoSlotOptions()) {
        if (!used.has(slot.v) && !this.entries.has(slot.v)) return slot.v;
      }
      return `scsi${nextIndex('scsi', this.entries)}`;
    }

    normalizeStorages() {
      const fromOpts = this.systemOptions?.storages;
      if (Array.isArray(fromOpts) && fromOpts.length) return fromOpts;
      return (this.storageList || []).map((s) =>
        typeof s === 'string' ? { name: s, content: [], enabled: true } : s
      );
    }

    storageNames(contentTypes = []) {
      const types = Array.isArray(contentTypes)
        ? contentTypes
        : contentTypes
          ? [contentTypes]
          : [];
      const storages = this.normalizeStorages();
      let filtered = storages.filter((s) => {
        const name = s.name || s;
        if (!name) return false;
        if (s.enabled === false) return false;
        if (!types.length) return true;
        const content = Array.isArray(s.content) ? s.content : [];
        return types.some((ct) => content.includes(ct));
      });
      if (types.length && !filtered.length) filtered = storages;
      const names = filtered.map((s) => s.name || s).filter(Boolean);
      return names.length ? names : ['local', 'local-lvm'];
    }

    cpuOptionItems() {
      const models = (this.systemOptions?.cpuModels || [])
        .map((m) => (typeof m === 'string' ? m : m?.name ?? m?.id ?? ''))
        .filter((m) => m && m !== '[object Object]');
      if (models.length) {
        return models.map((v) => ({
          v,
          l: v === 'host' ? 'host - passthrough CPU hôte' : v === 'kvm64' ? 'kvm64 - compatible' : v,
        }));
      }
      return OPTIONS.cpu;
    }

    machineOptionItems() {
      const machines = (this.systemOptions?.machines || [])
        .map((m) => (typeof m === 'string' ? m : m?.name ?? m?.id ?? ''))
        .filter((m) => m && m !== '[object Object]');
      if (machines.length) {
        return [{ v: '', l: '(défaut)' }, ...machines.map((v) => ({ v, l: v }))];
      }
      return OPTIONS.machine;
    }

    bridgeList() {
      const bridges = this.systemOptions?.bridges || [];
      return bridges.length ? bridges : ['vmbr0', 'vmbr1', 'vmbr2', 'vmbr3'];
    }

    schemaBlock(name) {
      const schema = this.systemOptions?.schema;
      if (!schema) return null;
      const guest = this.type === 'lxc' ? schema.lxc : schema.vm;
      return guest?.[name] ?? schema?.[name] ?? null;
    }

    ostypeOptionItems() {
      const block = this.schemaBlock('ostype');
      if (block?.values) {
        return [{ v: '', l: '(auto / défaut)' }, ...block.values.map((v) => ({
          v, l: block.labels?.[v] || v,
        }))];
      }
      return OPTIONS.ostype;
    }

    biosOptionItems() {
      const block = this.schemaBlock('bios');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return [{ v: 'seabios', l: 'SeaBIOS (legacy)' }, { v: 'ovmf', l: 'UEFI (OVMF)' }];
    }

    scsihwOptionItems() {
      const block = this.schemaBlock('scsihw');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return OPTIONS.scsihw;
    }

    netModelOptionItems() {
      const block = this.schemaBlock('netModels');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return OPTIONS.netModel;
    }

    diskFormatOptionItems() {
      const block = this.schemaBlock('diskFormat');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return OPTIONS.diskFormat;
    }

    diskBusOptionItems() {
      const block = this.schemaBlock('diskBus');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return OPTIONS.diskBus;
    }

    vgaTypeOptionItems() {
      const block = this.schemaBlock('vga');
      if (block?.types) {
        return block.types.map((v) => ({ v, l: block.typeLabels?.[v] || v }));
      }
      return OPTIONS.vga;
    }

    archOptionItems() {
      const block = this.schemaBlock('arch');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return OPTIONS.arch;
    }

    lxcOstypeOptionItems() {
      const block = this.schemaBlock('ostype');
      if (block?.values) {
        return [{ v: '', l: '(défaut)' }, ...block.values.map((v) => ({
          v, l: block.labels?.[v] || v,
        }))];
      }
      return [{ v: '', l: '(défaut)' }, { v: 'ubuntu', l: 'Ubuntu' }, { v: 'debian', l: 'Debian' }];
    }

    cmodeOptionItems() {
      const block = this.schemaBlock('cmode');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return [
        { v: 'tty', l: '/dev/tty[X]' },
        { v: 'console', l: '/dev/console' },
        { v: 'shell', l: 'shell' },
      ];
    }

    diskCacheOptionItems() {
      const block = this.schemaBlock('diskCache');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return [
        { v: '', l: 'Défaut' },
        { v: 'none', l: 'none' },
        { v: 'writethrough', l: 'writethrough' },
        { v: 'writeback', l: 'writeback' },
        { v: 'directsync', l: 'directsync' },
      ];
    }

    diskAioOptionItems() {
      const block = this.schemaBlock('diskAio');
      if (block?.values) {
        return block.values.map((v) => ({ v, l: block.labels?.[v] || v }));
      }
      return [
        { v: '', l: 'Défaut' },
        { v: 'native', l: 'native' },
        { v: 'threads', l: 'threads' },
        { v: 'io_uring', l: 'io_uring' },
      ];
    }

    lxcIpModeFromValue(v) {
      const s = String(v || '').trim();
      if (!s) return '';
      if (s === 'dhcp' || s === 'manual') return s;
      return 'static';
    }

    lxcIp6ModeFromValue(v) {
      const s = String(v || '').trim();
      if (!s) return '';
      if (s === 'auto' || s === 'dhcp' || s === 'manual') return s;
      return 'static';
    }

    bootableDevices() {
      const devs = [];
      for (const [k, v] of this.entries) {
        if (!v) continue;
        const sv = String(v);
        const diskM = k.match(/^(scsi|ide|sata|virtio)(\d+)$/i);
        if (diskM) {
          const isCd = diskIsCdrom(sv);
          devs.push({
            id: k,
            label: isCd ? `CD-ROM ${k}` : `Disque ${k}`,
            type: isCd ? 'cdrom' : 'disk',
          });
        }
        if (/^net\d+$/i.test(k)) {
          devs.push({ id: k, label: `${k} (PXE)`, type: 'net' });
        }
      }
      return devs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }

    mergeBootOrder(order, devices) {
      const ids = new Set(devices.map((d) => d.id));
      const result = order.filter((id) => ids.has(id));
      for (const d of devices) {
        if (!result.includes(d.id)) result.push(d.id);
      }
      return result;
    }

    bootDeviceLabel(id) {
      const dev = this.bootableDevices().find((d) => d.id === id);
      return dev?.label || id;
    }

    get(key, fb = '') {
      return this.entries.get(key) ?? fb;
    }

    set(key, value) {
      if (!key || NON_PERSIST.has(key)) return;
      this.deleted.delete(key);
      if (value === '' || value == null) {
        this.entries.delete(key);
        this.deleted.add(key);
      } else {
        this.entries.set(key, String(value));
      }
    }

    removeKey(key) {
      this.entries.delete(key);
      this.deleted.add(key);
      if (this.type === 'vm') {
        this.bootOrder = this.bootOrder.filter((id) => id !== key);
        this.set('boot', buildBootValue(this.bootOrder));
      }
      this.render();
    }

    addKey(key, value = '') {
      this.deleted.delete(key);
      this.entries.set(key, value);
      this.render();
    }

    unusedDiskKeys() {
      return [...this.entries.keys()].filter((k) => isUnusedDiskKey(k)).sort();
    }

    freeDiskSlot(bus) {
      const idx = nextIndex(bus, this.entries);
      const candidate = `${bus}${idx}`;
      return this.entries.has(candidate) ? `${bus}${idx + 1}` : candidate;
    }

    detachDisk(key) {
      const val = this.get(key);
      if (!val || diskIsCdrom(val) || key === 'rootfs') return;
      this.syncFromDom();
      const idx = nextIndex('unused', this.entries);
      this.entries.delete(key);
      this.deleted.add(key);
      this.entries.set(`unused${idx}`, val);
      this.deleted.delete(`unused${idx}`);
      if (this.type === 'vm') {
        this.bootOrder = this.bootOrder.filter((id) => id !== key);
        this.set('boot', buildBootValue(this.bootOrder));
      }
      this.render();
    }

    reattachUnused(unusedKey, bus) {
      const val = this.get(unusedKey);
      if (!val || !bus) return;
      this.syncFromDom();
      const slot = this.freeDiskSlot(bus);
      this.entries.delete(unusedKey);
      this.deleted.add(unusedKey);
      this.entries.set(slot, val);
      this.deleted.delete(slot);
      if (this.type === 'vm') {
        this.bootOrder = this.mergeBootOrder(this.bootOrder, this.bootableDevices());
      }
      this.render();
    }

    diskKeys() {
      if (Reg.diskKeysFromEntries) return Reg.diskKeysFromEntries(this.entries, this.type);
      return [...this.entries.keys()]
        .filter((k) => !isUnusedDiskKey(k) && ((VM_DISK_RE.test(k) && !diskIsCdrom(this.get(k))) || k === 'rootfs'))
        .sort();
    }

    advancedKeys() {
      const classify = Reg.classifyKey || (() => ({ tab: 'advanced' }));
      return [...this.entries.keys()]
        .filter((k) => {
          if (READONLY.has(k)) return false;
          const c = classify(k, this.type);
          return c.tab === 'advanced' || c.kind === 'passthrough';
        })
        .sort();
    }

    ipconfigKeys() {
      return [...this.entries.keys()].filter((k) => /^ipconfig\d+$/i.test(k)).sort();
    }

    netKeys() {
      return [...this.entries.keys()].filter((k) => NET_RE.test(k)).sort();
    }

    mountKeys() {
      return [...this.entries.keys()].filter((k) => MP_RE.test(k)).sort();
    }

    fullConfigEntries() {
      const map = new Map();
      for (const [k, v] of Object.entries(this.originalRaw || {})) {
        if (READONLY.has(k) && v !== '' && v != null) map.set(k, String(v));
      }
      for (const [k, v] of this.entries) {
        if (v !== '' && v != null) map.set(k, String(v));
      }
      for (const k of this.deleted) map.delete(k);
      return map;
    }

    buildFullConfigText() {
      const map = this.fullConfigEntries();
      const lines = [];
      const desc = map.get('description');
      if (desc) {
        for (const line of String(desc).split(/\r?\n/)) {
          lines.push(`# ${line}`);
        }
        lines.push('');
        map.delete('description');
      }
      const keys = [...map.keys()].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
      for (const k of keys) lines.push(`${k}: ${map.get(k)}`);
      return lines.join('\n') || '(aucun paramètre)';
    }

    collect() {
      this.syncFromDom();
      const set = {};
      for (const [k, v] of this.entries) {
        if (!READONLY.has(k) && !NON_PERSIST.has(k)) set[k] = v;
      }

      if (this.type === 'vm' && this.root) {
        this.syncIsoMounts();
      }

      return { set, delete: [...this.deleted] };
    }

    syncIsoMounts() {
      const seenKeys = new Set();
      this.root.querySelectorAll('[data-iso-mount]').forEach((card) => {
        const oldKey = card.dataset.isoMountKey || '';
        const key = card.querySelector('[data-iso-field="key"]')?.value?.trim() || oldKey;
        const storage = card.querySelector('[data-iso-field="storage"]')?.value?.trim() || '';
        const file = card.querySelector('[data-iso-field="file"]')?.value?.trim() || '';
        const extras = card.dataset.isoExtras || ',media=cdrom';

        if (oldKey && oldKey !== key) {
          this.entries.delete(oldKey);
          this.deleted.add(oldKey);
        }

        if (file && storage && key) {
          this.set(key, buildIsoValue(storage, file, extras));
          seenKeys.add(key);
        } else if (key) {
          this.entries.delete(key);
          this.deleted.add(key);
        }
      });

      for (const mount of this.isoMounts) {
        if (mount.key && !seenKeys.has(mount.key) && !this.root.querySelector(`[data-iso-mount-key="${mount.key}"]`)) {
          this.entries.delete(mount.key);
          this.deleted.add(mount.key);
        }
      }
    }

    rebuildIsoMountsFromDom() {
      if (!this.root || this.type !== 'vm') return;
      const mounts = [];
      this.root.querySelectorAll('[data-iso-mount]').forEach((card) => {
        mounts.push({
          key: card.querySelector('[data-iso-field="key"]')?.value?.trim() || card.dataset.isoMountKey || '',
          storage: card.querySelector('[data-iso-field="storage"]')?.value?.trim() || '',
          file: card.querySelector('[data-iso-field="file"]')?.value?.trim() || '',
          extras: card.dataset.isoExtras || ',media=cdrom',
        });
      });
      if (mounts.length) {
        this.isoMounts = mounts;
      } else {
        this.isoMounts = this.collectIsoMountsFromEntries();
      }
    }

    /** Select avec libellés + option personnalisée */
    selectField(key, label, items, opts = {}) {
      const cur = this.get(key, opts.defaultValue ?? '');
      const inList = items.some((i) => i.v === cur);
      const hint = opts.hint ? `<small class="cfg-hint">${esc(opts.hint)}</small>` : '';
      const optsHtml = items
        .map((i) => `<option value="${esc(i.v)}" ${cur === i.v ? 'selected' : ''}>${esc(i.l)}</option>`)
        .join('');
      const customBlock = opts.allowCustom !== false
        ? `<input type="text" class="form-control cfg-custom-input ${inList || !cur ? 'cfg-hidden' : ''}" data-cfg-custom="${esc(key)}" value="${esc(cur)}" placeholder="Valeur personnalisée">`
        : '';

      return `
        <div class="cfg-field">
          <label>${esc(label)}</label>
          <select class="form-control cfg-select" data-cfg-select="${esc(key)}" data-cfg-key="${esc(key)}">
            ${optsHtml}
            <option value="${CUSTOM}" ${!inList && cur ? 'selected' : ''}>- Personnalisé —</option>
          </select>
          ${customBlock}
          ${hint}
        </div>`;
    }

    numberField(key, label, opts = {}) {
      const cur = this.get(key, opts.defaultValue ?? '');
      const hint = opts.hint ? `<small class="cfg-hint">${esc(opts.hint)}</small>` : '';
      const min = opts.min !== undefined ? ` min="${opts.min}"` : '';
      const max = opts.max !== undefined ? ` max="${opts.max}"` : '';
      const step = opts.step !== undefined ? ` step="${opts.step}"` : ' step="1"';
      const placeholder = opts.optional && !cur ? ' placeholder="—"' : '';
      const unit = opts.unit
        ? `<span class="cfg-input-unit">${esc(opts.unit)}</span>`
        : '';
      return `
        <div class="cfg-field">
          <label for="cfg-num-${esc(key)}">${esc(label)}</label>
          <div class="cfg-number-wrap">
            <input type="number" id="cfg-num-${esc(key)}" class="form-control cfg-number-input"
              data-cfg-key="${esc(key)}" value="${esc(cur)}"${min}${max}${step}${placeholder}>
            ${unit}
          </div>
          ${hint}
        </div>`;
    }

    boolToggle(key, label, hint) {
      const raw = this.get(key);
      const on = raw === '1' || raw === 'true';
      return `
        <div class="cfg-field cfg-field-toggle">
          <div class="cfg-toggle-row">
            <span class="cfg-toggle-text">${esc(label)}</span>
            <label class="cfg-toggle">
              <input type="checkbox" data-cfg-bool="${esc(key)}" data-cfg-key="${esc(key)}" ${on ? 'checked' : ''}>
              <span class="cfg-toggle-slider" aria-hidden="true"></span>
            </label>
          </div>
          ${hint ? `<small class="cfg-hint">${esc(hint)}</small>` : ''}
        </div>`;
    }

    boolSelect(key, label, hint) {
      return this.boolToggle(key, label, hint);
    }

    section(title, icon) {
      return `<h4 class="cfg-section-title"><i class="fa-solid ${icon || 'fa-circle'}"></i> ${esc(title)}</h4>`;
    }

    renderStartupFields() {
      const { order, up } = parseStartup(this.get('startup'));
      return `
        <div class="cfg-field">
          <label for="cfg-startup-order">Priorité au démarrage du nœud</label>
          <div class="cfg-number-wrap">
            <input type="number" id="cfg-startup-order" class="form-control cfg-number-input"
              data-cfg-startup-order value="${esc(order)}" min="1" max="9999" step="1" placeholder="—">
            <span class="cfg-input-unit">order</span>
          </div>
          <small class="cfg-hint">Proxmox : startup=order=N - l'arrêt du nœud suit l'ordre inverse (pas de paramètre shutdown séparé)</small>
        </div>
        <div class="cfg-field">
          <label for="cfg-startup-up">Délai avant démarrage (optionnel)</label>
          <div class="cfg-number-wrap">
            <input type="number" id="cfg-startup-up" class="form-control cfg-number-input"
              data-cfg-startup-up value="${esc(up)}" min="0" step="1" placeholder="—">
            <span class="cfg-input-unit">s (up=)</span>
          </div>
        </div>`;
    }

    renderUnprivilegedBadge() {
      const val = this.get('unprivileged');
      const on = val === '1' || val === 'true';
      return `
        <div class="cfg-field cfg-field-full">
          <label>Mode privilégié</label>
          <div class="cfg-readonly-badge ${on ? 'cfg-badge-info' : 'cfg-badge-warn'}">
            <i class="fa-solid ${on ? 'fa-shield-halved' : 'fa-unlock'}"></i>
            ${on ? 'Conteneur non privilégié (unprivileged=1)' : 'Conteneur privilégié (unprivileged=0)'}
          </div>
          <small class="cfg-hint">Ce paramètre est fixé à la création du CT - il ne peut pas être modifié ici (recréer le conteneur pour changer).</small>
        </div>`;
    }

    renderFeaturesBuilder() {
      const f = parseFeatures(this.get('features'));
      const mountPresets = this.schemaBlock('features')?.mountPresets || [
        { v: '', l: 'Aucun' },
        { v: 'nfs', l: 'NFS' },
        { v: 'cifs', l: 'CIFS' },
        { v: 'nfs;cifs', l: 'NFS + CIFS' },
      ];
      const mountVal = f.mount || '';
      const toggle = (key, label, hint) => `
        <div class="cfg-field cfg-field-toggle">
          <div class="cfg-toggle-row">
            <span class="cfg-toggle-text">${esc(label)}</span>
            <label class="cfg-toggle">
              <input type="checkbox" data-features-field="${esc(key)}" ${f[key] ? 'checked' : ''}>
              <span class="cfg-toggle-slider" aria-hidden="true"></span>
            </label>
          </div>
          ${hint ? `<small class="cfg-hint">${esc(hint)}</small>` : ''}
        </div>`;
      return `
        <div class="cfg-field cfg-field-full" data-features-builder>
          <label>Fonctionnalités LXC</label>
          <div class="cfg-features-grid">
            ${toggle('nesting', 'Nesting', 'Requis pour Docker/LXD - expose partiellement le sysfs hôte')}
            ${toggle('keyctl', 'keyctl', 'Requis pour systemd-networkd ou Docker (unprivileged)')}
            ${toggle('fuse', 'FUSE', 'Montages FUSE (SSHFS…)')}
            ${toggle('mknod', 'mknod', 'Création de device nodes')}
            ${toggle('force_rw_sys', 'force_rw_sys', 'Forcer /sys en lecture-écriture')}
          </div>
          <div class="cfg-field">
            <label>Types de montage autorisés (mount=)</label>
            <select class="form-control" data-features-field="mount">
              ${mountPresets.map((o) =>
                `<option value="${esc(o.v)}" ${mountVal === o.v ? 'selected' : ''}>${esc(o.l)}</option>`
              ).join('')}
              ${mountVal && !mountPresets.some((o) => o.v === mountVal)
                ? `<option value="${esc(mountVal)}" selected>${esc(mountVal)} (actuel)</option>` : ''}
            </select>
          </div>
          <small class="cfg-hint">Proxmox : features=nesting=1,keyctl=1,…</small>
        </div>`;
    }

    renderGeneral() {
      const lxc = this.type === 'lxc';
      return `
        <div class="cfg-grid">
          ${this.section('Identité & cycle de vie', 'fa-circle-info')}
          ${this.fieldTextarea('description', 'Notes / Description', 'Description affichée dans Proxmox')}
          ${this.boolSelect('onboot', 'Démarrage automatique au boot du nœud')}
          ${this.renderStartupFields()}
          ${this.fieldText('tags', 'Tags', 'Séparés par ; (ex: prod;web)')}
          ${lxc ? this.fieldText('hostname', 'Nom d\'hôte (hostname)') : ''}
          ${lxc ? this.selectField('arch', 'Architecture', this.archOptionItems(), { allowCustom: true }) : ''}
          ${lxc ? this.selectField('ostype', 'Type OS (ostype)', this.lxcOstypeOptionItems(), { allowCustom: true }) : ''}
          ${lxc ? this.selectField('cmode', 'Console (cmode)', this.cmodeOptionItems(), { allowCustom: false }) : ''}
          ${lxc ? this.renderUnprivilegedBadge() : ''}
          ${lxc ? this.renderFeaturesBuilder() : ''}
          ${lxc ? this.fieldText('nameserver', 'Serveurs DNS', 'Séparés par des espaces (nameserver)') : ''}
          ${lxc ? this.fieldText('searchdomain', 'Domaine de recherche', 'searchdomain') : ''}
          ${!lxc ? this.selectField('ostype', 'Type de système (ostype)', this.ostypeOptionItems(), { allowCustom: true }) : ''}
        </div>`;
    }

    renderCpuRam() {
      const maxCpu = this.systemOptions?.maxcpu || undefined;
      const maxMem = this.systemOptions?.maxmemMb || undefined;
      return `
        <div class="cfg-grid cfg-grid-2">
          ${this.section('Processeur', 'fa-microchip')}
          ${this.numberField('cores', 'Cœurs par socket', { defaultValue: '1', min: 1, max: maxCpu, unit: 'cœurs' })}
          ${this.numberField('sockets', 'Sockets', { defaultValue: '1', min: 1, max: 8, unit: 'socket(s)' })}
          ${this.numberField('vcpus', 'vCPU maximum', { min: 1, max: maxCpu, unit: 'vCPU', optional: true, hint: 'Optionnel - limite haute' })}
          ${this.selectField('cpu', 'Modèle CPU', this.cpuOptionItems(), { allowCustom: true, hint: maxCpu ? `Nœud : ${maxCpu} cœurs max` : '' })}
          ${this.type === 'vm' ? this.boolSelect('numa', 'Activer NUMA') : ''}
          ${this.section('Mémoire', 'fa-memory')}
          ${this.numberField('memory', 'RAM', { defaultValue: '512', min: 16, max: maxMem, step: 1, unit: 'MB', hint: maxMem ? `Nœud : ~${maxMem} MB disponibles` : '' })}
          ${this.type === 'vm' ? this.numberField('balloon', 'Balloon device', { defaultValue: '0', min: 0, step: 1, unit: 'MB', hint: '0 = désactivé' }) : ''}
          ${this.type === 'lxc' ? this.numberField('swap', 'Swap', { defaultValue: '0', min: 0, step: 1, unit: 'MB' }) : ''}
          ${this.numberField('shares', 'Priorité CPU (shares)', { min: 0, step: 1, unit: 'shares', optional: true })}
        </div>`;
    }

    renderVgaBuilder() {
      const v = parseVga(this.get('vga'));
      const types = this.vgaTypeOptionItems();
      const mem = this.schemaBlock('vga')?.memory || { min: 4, max: 512 };
      const curType = v.type || 'std';
      return `
        <div class="cfg-field cfg-field-full" data-vga-builder>
          <label>Affichage (VGA)</label>
          <div class="cfg-builder-grid">
            <div class="cfg-field">
              <label>Type</label>
              <select class="form-control" data-vga-field="type">
                ${types.map((o) =>
                  `<option value="${esc(o.v)}" ${curType === o.v ? 'selected' : ''}>${esc(o.l)}</option>`
                ).join('')}
                ${curType && !types.some((o) => o.v === curType)
                  ? `<option value="${esc(curType)}" selected>${esc(curType)} (actuel)</option>`
                  : ''}
              </select>
            </div>
            <div class="cfg-field">
              <label>Mémoire vidéo</label>
              <input type="number" class="form-control" data-vga-field="memory"
                value="${esc(v.memory)}" min="${mem.min}" max="${mem.max}" step="1" placeholder="—">
              <small class="cfg-hint">${mem.min}–${mem.max} MiB (sans effet en mode série)</small>
            </div>
            <div class="cfg-field">
              <label>Presse-papiers</label>
              <select class="form-control" data-vga-field="clipboard">
                <option value="">- SPICE / défaut —</option>
                <option value="vnc" ${v.clipboard === 'vnc' ? 'selected' : ''}>VNC (clipboard=vnc)</option>
              </select>
            </div>
          </div>
          <small class="cfg-hint">Valeur actuelle : ${esc(this.get('vga') || '(défaut)')}</small>
        </div>`;
    }

    renderAgentBuilder() {
      const a = parseAgent(this.get('agent'));
      return `
        <div class="cfg-field cfg-field-full" data-agent-builder>
          <label>Guest Agent (QEMU)</label>
          <div class="cfg-toggle-row">
            <label class="cfg-toggle">
              <input type="checkbox" data-agent-field="enabled" ${a.enabled ? 'checked' : ''}>
              <span class="cfg-toggle-slider" aria-hidden="true"></span>
            </label>
            <span class="cfg-toggle-text">Agent activé</span>
          </div>
          <div class="cfg-toggle-row">
            <label class="cfg-toggle">
              <input type="checkbox" data-agent-field="freeze" ${a.freeze ? 'checked' : ''} ${!a.enabled ? 'disabled' : ''}>
              <span class="cfg-toggle-slider" aria-hidden="true"></span>
            </label>
            <span class="cfg-toggle-text">Geler FS à l'arrêt (freeze)</span>
          </div>
          <div class="cfg-toggle-row">
            <label class="cfg-toggle">
              <input type="checkbox" data-agent-field="fstrim" ${a.fstrim ? 'checked' : ''} ${!a.enabled ? 'disabled' : ''}>
              <span class="cfg-toggle-slider" aria-hidden="true"></span>
            </label>
            <span class="cfg-toggle-text">fstrim sur disques clonés</span>
          </div>
          <small class="cfg-hint">Valeur actuelle : ${esc(this.get('agent') || '0')}</small>
        </div>`;
    }

    renderHardware() {
      return `
        <div class="cfg-grid cfg-grid-2">
          ${this.section('Firmware & plateforme', 'fa-server')}
          ${this.selectField('bios', 'Firmware BIOS/UEFI', this.biosOptionItems(), { allowCustom: false, defaultValue: 'seabios' })}
          ${this.selectField('machine', 'Type de machine', this.machineOptionItems(), { allowCustom: true })}
          ${this.section('Périphériques', 'fa-plug')}
          ${this.renderAgentBuilder()}
          ${this.boolSelect('tablet', 'Tablette USB (éviter souris bloquée)')}
          ${this.boolSelect('kvm', 'Accélération KVM')}
          ${this.boolSelect('acpi', 'ACPI')}
          ${this.renderVgaBuilder()}
          ${this.selectField('scsihw', 'Contrôleur SCSI', this.scsihwOptionItems(), { allowCustom: true })}
          ${this.fieldText('hotplug', 'Hotplug', 'disk,network,usb - séparés par virgule')}
        </div>`;
    }

    renderBootOrderBuilder() {
      const order = this.bootOrder.length
        ? this.bootOrder
        : this.mergeBootOrder(parseBootOrder(this.get('boot')), this.bootableDevices());
      if (!order.length) {
        return `
          <div class="cfg-field cfg-field-full">
            <label>Ordre de boot</label>
            <p class="cfg-empty">Aucun périphérique bootable (disque, CD-ROM ou réseau). Ajoutez-en dans les onglets Disques / Réseau.</p>
          </div>`;
      }
      const rows = order.map((id, idx) => `
        <li class="cfg-boot-item" data-boot-id="${esc(id)}">
          <span class="cfg-boot-rank">${idx + 1}</span>
          <span class="cfg-boot-label">${esc(this.bootDeviceLabel(id))}</span>
          <span class="cfg-boot-actions">
            <button type="button" class="cfg-boot-btn" data-boot-up="${esc(id)}" title="Monter" ${idx === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" class="cfg-boot-btn" data-boot-down="${esc(id)}" title="Descendre" ${idx === order.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          </span>
        </li>`).join('');
      return `
        <div class="cfg-field cfg-field-full" data-boot-order-wrap>
          <label>Ordre de boot</label>
          <ul class="cfg-boot-list">${rows}</ul>
          <small class="cfg-hint">Proxmox : order=dev1;dev2;… - réordonnez avec les flèches</small>
        </div>`;
    }

    renderIsoBuilder(mount) {
      const storages = this.storageNames('iso');
      const storage = mount.storage || storages[0] || '';
      const isoList = this.getIsoList(storage);
      const slots = isoSlotOptions();
      if (mount.key && !slots.some((s) => s.v === mount.key)) {
        slots.unshift({ v: mount.key, l: `${mount.key} (actuel)` });
      }

      return `
        <div class="cfg-builder-card" data-iso-mount data-iso-mount-key="${esc(mount.key)}" data-iso-extras="${esc(mount.extras || ',media=cdrom')}">
          <div class="cfg-builder-head">
            <strong>Lecteur ${esc(mount.key || 'ISO')}</strong>
            <button type="button" class="cfg-row-del" data-iso-del="${esc(mount.key)}" title="Retirer le lecteur"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div class="cfg-builder-grid">
            <div class="cfg-field">
              <label>Emplacement (bus)</label>
              <select class="form-control" data-iso-field="key">
                ${slots.map((o) =>
                  `<option value="${esc(o.v)}" ${mount.key === o.v ? 'selected' : ''}>${esc(o.l)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="cfg-field">
              <label>Stockage ISO</label>
              <select class="form-control" data-iso-field="storage">
                ${storages.map((s) =>
                  `<option value="${esc(s)}" ${storage === s ? 'selected' : ''}>${esc(s)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="cfg-field cfg-field-full">
              <label>Image ISO</label>
              <select class="form-control" data-iso-field="file">
                <option value="">- Aucune ISO —</option>
                ${isoList.map((n) =>
                  `<option value="${esc(n)}" ${mount.file === n ? 'selected' : ''}>${esc(n)}</option>`
                ).join('')}
                ${mount.file && !isoList.includes(mount.file)
                  ? `<option value="${esc(mount.file)}" selected>${esc(mount.file)} (actuel)</option>`
                  : ''}
              </select>
            </div>
          </div>
        </div>`;
    }

    renderBoot() {
      const isoCards = this.isoMounts.map((m) => this.renderIsoBuilder(m)).join('');

      return `
        <div class="cfg-grid">
          ${this.section('Démarrage', 'fa-power-off')}
          ${this.renderBootOrderBuilder()}
          ${this.fieldText('efidisk0', 'Disque EFI (efidisk0)', 'Ex: local-lvm:1,format=raw,efitype=4m,pre-enrolled-keys=1')}
          ${this.section('CD-ROM / ISO', 'fa-compact-disc')}
          ${isoCards || '<p class="cfg-empty">Aucun lecteur ISO/CD-ROM configuré.</p>'}
          <div class="cfg-add-row">
            <button type="button" class="cfg-add-btn" id="cfg-add-iso"><i class="fa-solid fa-plus"></i> Ajouter un lecteur ISO</button>
          </div>
        </div>`;
    }

    renderNetBuilder(key) {
      return this.type === 'lxc' ? this.renderLxcNetBuilder(key) : this.renderQemuNetBuilder(key);
    }

    renderQemuNetBuilder(key) {
      const n = parseNet(this.get(key));
      const bridges = [...this.bridgeList()];
      if (n.bridge && !bridges.includes(n.bridge)) bridges.unshift(n.bridge);

      return `
        <div class="cfg-builder-card" data-net-key="${esc(key)}" data-net-kind="qemu">
          <div class="cfg-builder-head">
            <strong>${esc(key)}</strong>
            <button type="button" class="cfg-row-del" data-del-key="${esc(key)}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div class="cfg-builder-grid">
            <div class="cfg-field">
              <label>Modèle</label>
              <select class="form-control" data-net-field="model">
                ${this.netModelOptionItems().map((o) => `<option value="${esc(o.v)}" ${n.model === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
              </select>
            </div>
            <div class="cfg-field">
              <label>MAC</label>
              <input type="text" class="form-control" data-net-field="mac" value="${esc(n.mac)}" placeholder="auto">
            </div>
            <div class="cfg-field">
              <label>Pont (bridge)</label>
              <select class="form-control" data-net-field="bridge">
                ${bridges.map((b) => `<option value="${esc(b)}" ${n.bridge === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
                <option value="${CUSTOM}">- Autre —</option>
              </select>
              <input type="text" class="form-control cfg-custom-input ${bridges.includes(n.bridge) ? 'cfg-hidden' : ''}" data-net-bridge-custom value="${esc(n.bridge)}">
            </div>
            <div class="cfg-field">
              <label>VLAN (tag)</label>
              <input type="number" class="form-control" data-net-field="tag" value="${esc(n.tag)}" placeholder="aucun" min="1" max="4094">
            </div>
            <div class="cfg-field">
              <label>Pare-feu</label>
              <select class="form-control" data-net-field="firewall">
                <option value="1" ${n.firewall === '1' ? 'selected' : ''}>Activé</option>
                <option value="0" ${n.firewall === '0' ? 'selected' : ''}>Désactivé</option>
              </select>
            </div>
            <div class="cfg-field">
              <label>Limite débit (rate)</label>
              <input type="text" class="form-control" data-net-field="rate" value="${esc(n.rate)}" placeholder="Mb/s (ex: 100)">
            </div>
            <div class="cfg-field">
              <label>MTU</label>
              <input type="number" class="form-control" data-net-field="mtu" value="${esc(n.mtu)}" placeholder="1500" min="576" max="65520">
            </div>
            <div class="cfg-field">
              <label>Queues (multiqueue)</label>
              <input type="number" class="form-control" data-net-field="queues" value="${esc(n.queues)}" min="1" placeholder="auto">
            </div>
            <div class="cfg-field">
              <label>Trunks VLAN</label>
              <input type="text" class="form-control" data-net-field="trunks" value="${esc(n.trunks)}" placeholder="10;20;30">
            </div>
            <div class="cfg-field cfg-field-toggle">
              <div class="cfg-toggle-row">
                <span class="cfg-toggle-text">Interface down (link_down)</span>
                <label class="cfg-toggle">
                  <input type="checkbox" data-net-field="link_down" ${n.link_down === '1' ? 'checked' : ''}>
                  <span class="cfg-toggle-slider" aria-hidden="true"></span>
                </label>
              </div>
            </div>
          </div>
          <input type="hidden" data-dk-key value="${esc(key)}">
          <input type="hidden" data-dk-val value="${esc(this.get(key))}">
        </div>`;
    }

    renderLxcNetBuilder(key) {
      const n = parseLxcNet(this.get(key));
      const bridges = [...this.bridgeList()];
      if (n.bridge && !bridges.includes(n.bridge)) bridges.unshift(n.bridge);
      const ipMode = this.lxcIpModeFromValue(n.ip);
      const ip6Mode = this.lxcIp6ModeFromValue(n.ip6);
      const ipStatic = ipMode === 'static' ? n.ip : '';
      const ip6Static = ip6Mode === 'static' ? n.ip6 : '';

      return `
        <div class="cfg-builder-card" data-net-key="${esc(key)}" data-net-kind="lxc">
          <div class="cfg-builder-head">
            <strong>${esc(key)} - ${esc(n.name || 'eth0')}</strong>
            <button type="button" class="cfg-row-del" data-del-key="${esc(key)}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div class="cfg-builder-grid">
            <div class="cfg-field">
              <label>Nom interface (name=)</label>
              <input type="text" class="form-control" data-net-field="name" value="${esc(n.name || 'eth0')}" placeholder="eth0">
            </div>
            <div class="cfg-field">
              <label>MAC (hwaddr=)</label>
              <input type="text" class="form-control" data-net-field="hwaddr" value="${esc(n.hwaddr)}" placeholder="auto">
            </div>
            <div class="cfg-field">
              <label>Pont (bridge)</label>
              <select class="form-control" data-net-field="bridge">
                ${bridges.map((b) => `<option value="${esc(b)}" ${n.bridge === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
              </select>
            </div>
            <div class="cfg-field">
              <label>VLAN (tag)</label>
              <input type="number" class="form-control" data-net-field="tag" value="${esc(n.tag)}" placeholder="aucun" min="1" max="4094">
            </div>
            <div class="cfg-field">
              <label>Pare-feu</label>
              <select class="form-control" data-net-field="firewall">
                <option value="1" ${n.firewall === '1' ? 'selected' : ''}>Activé</option>
                <option value="0" ${n.firewall === '0' ? 'selected' : ''}>Désactivé</option>
              </select>
            </div>
            <div class="cfg-field">
              <label>Limite débit (rate)</label>
              <input type="text" class="form-control" data-net-field="rate" value="${esc(n.rate)}" placeholder="Mb/s">
            </div>
            <div class="cfg-field">
              <label>MTU</label>
              <input type="number" class="form-control" data-net-field="mtu" value="${esc(n.mtu)}" placeholder="1500">
            </div>
          </div>
          ${this.section('Adressage IPv4', 'fa-network-wired')}
          <div class="cfg-builder-grid">
            <div class="cfg-field">
              <label>Mode IPv4</label>
              <select class="form-control" data-net-field="ip_mode">
                <option value="" ${!ipMode ? 'selected' : ''}>- Non défini —</option>
                <option value="dhcp" ${ipMode === 'dhcp' ? 'selected' : ''}>DHCP</option>
                <option value="manual" ${ipMode === 'manual' ? 'selected' : ''}>Manuel (dans le CT)</option>
                <option value="static" ${ipMode === 'static' ? 'selected' : ''}>Statique (ip=CIDR)</option>
              </select>
            </div>
            <div class="cfg-field">
              <label>Adresse IPv4 (ip=)</label>
              <input type="text" class="form-control" data-net-field="ip_static" value="${esc(ipStatic)}"
                placeholder="192.168.1.10/24" ${ipMode !== 'static' ? 'disabled' : ''}>
            </div>
            <div class="cfg-field">
              <label>Passerelle (gw=)</label>
              <input type="text" class="form-control" data-net-field="gw" value="${esc(n.gw)}" placeholder="192.168.1.1">
            </div>
          </div>
          ${this.section('Adressage IPv6', 'fa-globe')}
          <div class="cfg-builder-grid">
            <div class="cfg-field">
              <label>Mode IPv6</label>
              <select class="form-control" data-net-field="ip6_mode">
                <option value="" ${!ip6Mode ? 'selected' : ''}>- Non défini —</option>
                <option value="auto" ${ip6Mode === 'auto' ? 'selected' : ''}>auto (SLAAC)</option>
                <option value="dhcp" ${ip6Mode === 'dhcp' ? 'selected' : ''}>DHCPv6</option>
                <option value="manual" ${ip6Mode === 'manual' ? 'selected' : ''}>Manuel</option>
                <option value="static" ${ip6Mode === 'static' ? 'selected' : ''}>Statique (ip6=CIDR)</option>
              </select>
            </div>
            <div class="cfg-field">
              <label>Adresse IPv6 (ip6=)</label>
              <input type="text" class="form-control" data-net-field="ip6_static" value="${esc(ip6Static)}"
                placeholder="2001:db8::10/64" ${ip6Mode !== 'static' ? 'disabled' : ''}>
            </div>
            <div class="cfg-field">
              <label>Passerelle IPv6 (gw6=)</label>
              <input type="text" class="form-control" data-net-field="gw6" value="${esc(n.gw6)}" placeholder="2001:db8::1">
            </div>
          </div>
          <input type="hidden" data-dk-key value="${esc(key)}">
          <input type="hidden" data-dk-val value="${esc(this.get(key))}">
        </div>`;
    }

    renderDiskOptions(d, key, isRoot) {
      const isVm = this.type === 'vm';
      const isExisting = !d.isNew && d.volid;
      const canDetach = isVm && isExisting && !isRoot && !isUnusedDiskKey(key);
      const chk = (field) => d[field] === '1' || d[field] === 'on' || d[field] === true;
      return `
        <details class="cfg-disk-advanced" open>
          <summary>Performance & options</summary>
          <div class="cfg-builder-grid">
            ${isVm ? `
            <div class="cfg-field">
              <label>Cache disque</label>
              <select class="form-control" data-disk-opt="cache">
                ${this.diskCacheOptionItems().map((o) =>
                  `<option value="${esc(o.v)}" ${String(d.cache || '') === o.v ? 'selected' : ''}>${esc(o.l)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="cfg-field">
              <label>AIO</label>
              <select class="form-control" data-disk-opt="aio">
                ${this.diskAioOptionItems().map((o) =>
                  `<option value="${esc(o.v)}" ${String(d.aio || '') === o.v ? 'selected' : ''}>${esc(o.l)}</option>`
                ).join('')}
              </select>
            </div>` : ''}
            <div class="cfg-field">
              <label>Serial / ID disque</label>
              <input type="text" class="form-control" data-disk-opt="serial" value="${esc(d.serial || '')}" placeholder="optionnel">
            </div>
            <div class="cfg-field">
              <label>Limite lecture (mbps_rd)</label>
              <input type="number" class="form-control" data-disk-opt="mbps_rd" value="${esc(d.mbps_rd || '')}" min="0" placeholder="—">
            </div>
            <div class="cfg-field">
              <label>Limite écriture (mbps_wr)</label>
              <input type="number" class="form-control" data-disk-opt="mbps_wr" value="${esc(d.mbps_wr || '')}" min="0" placeholder="—">
            </div>
            ${isVm ? `
            <div class="cfg-field cfg-field-toggle">
              <div class="cfg-toggle-row">
                <span class="cfg-toggle-text">IO Thread (iothread)</span>
                <label class="cfg-toggle">
                  <input type="checkbox" data-disk-opt="iothread" ${chk('iothread') ? 'checked' : ''}>
                  <span class="cfg-toggle-slider" aria-hidden="true"></span>
                </label>
              </div>
            </div>
            <div class="cfg-field cfg-field-toggle">
              <div class="cfg-toggle-row">
                <span class="cfg-toggle-text">Discard / TRIM</span>
                <label class="cfg-toggle">
                  <input type="checkbox" data-disk-opt="discard" ${chk('discard') ? 'checked' : ''}>
                  <span class="cfg-toggle-slider" aria-hidden="true"></span>
                </label>
              </div>
            </div>
            <div class="cfg-field cfg-field-toggle">
              <div class="cfg-toggle-row">
                <span class="cfg-toggle-text">Émulation SSD</span>
                <label class="cfg-toggle">
                  <input type="checkbox" data-disk-opt="ssd" ${chk('ssd') ? 'checked' : ''}>
                  <span class="cfg-toggle-slider" aria-hidden="true"></span>
                </label>
              </div>
            </div>` : ''}
            <div class="cfg-field cfg-field-toggle">
              <div class="cfg-toggle-row">
                <span class="cfg-toggle-text">Lecture seule</span>
                <label class="cfg-toggle">
                  <input type="checkbox" data-disk-opt="readonly" ${chk('readonly') ? 'checked' : ''}>
                  <span class="cfg-toggle-slider" aria-hidden="true"></span>
                </label>
              </div>
            </div>
            <div class="cfg-field cfg-field-toggle">
              <div class="cfg-toggle-row">
                <span class="cfg-toggle-text">Exclure des sauvegardes (backup=0)</span>
                <label class="cfg-toggle">
                  <input type="checkbox" data-disk-opt="backup" ${d.backup === '0' ? 'checked' : ''}>
                  <span class="cfg-toggle-slider" aria-hidden="true"></span>
                </label>
              </div>
            </div>
            <div class="cfg-field cfg-field-toggle">
              <div class="cfg-toggle-row">
                <span class="cfg-toggle-text">Exclure réplication (replicate=0)</span>
                <label class="cfg-toggle">
                  <input type="checkbox" data-disk-opt="replicate" ${d.replicate === '0' ? 'checked' : ''}>
                  <span class="cfg-toggle-slider" aria-hidden="true"></span>
                </label>
              </div>
            </div>
          </div>
          ${isExisting ? `
            <p class="cfg-info-banner">
              <i class="fa-solid fa-circle-info"></i>
              Le stockage d'un volume existant ne se change pas ici - utilisez la migration Proxmox
              (Datacenter → déplacer le disque / <code>qm move_disk</code>) pour changer de datastore.
            </p>` : ''}
          ${canDetach ? `
            <div class="cfg-disk-actions">
              <button type="button" class="cfg-btn-secondary" data-disk-detach="${esc(key)}">
                <i class="fa-solid fa-link-slash"></i> Détacher (→ unused)
              </button>
              <small class="cfg-hint">Comme dans Proxmox : le volume reste sur le stockage, clé déplacée vers unusedN.</small>
            </div>` : ''}
        </details>`;
    }

    renderUnusedDiskCard(key) {
      const d = parseDisk(this.get(key));
      return `
        <div class="cfg-builder-card cfg-unused-disk" data-unused-key="${esc(key)}">
          <div class="cfg-builder-head">
            <strong>${esc(key)} - détaché</strong>
            <button type="button" class="cfg-row-del" data-del-key="${esc(key)}" title="Retirer de la config"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div class="cfg-field cfg-field-full">
            <label>Volume</label>
            <input type="text" class="form-control" value="${esc(d.storage)}:${esc(d.volid || this.get(key))}" readonly>
          </div>
          <div class="cfg-add-inline">
            <select class="form-control" data-reattach-bus="${esc(key)}">
              ${this.diskBusOptionItems().map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('')}
            </select>
            <button type="button" class="cfg-add-btn" data-reattach="${esc(key)}">
              <i class="fa-solid fa-link"></i> Réattacher
            </button>
          </div>
        </div>`;
    }

    renderDiskBuilder(key) {
      const isRoot = key === 'rootfs';
      const d = parseDisk(this.get(key));
      const contentFilter = isRoot ? ['rootdir'] : ['images'];
      const storages = this.storageNames(contentFilter);
      const isExisting = !d.isNew && d.volid;
      const existingBlock = isExisting
        ? `
          <div class="cfg-field cfg-field-full">
            <label>Volume existant (${esc(d.storage)})</label>
            <input type="text" class="form-control" value="${esc(d.volid)}" readonly>
          </div>`
        : '';

      return `
        <div class="cfg-builder-card" data-disk-key="${esc(key)}"
          data-disk-volid="${esc(d.volid || '')}"
          data-disk-is-new="${d.isNew !== false ? '1' : '0'}"
          data-disk-storage="${esc(d.storage || '')}"
          data-disk-extras="${esc(JSON.stringify(d.extras || []))}">
          <div class="cfg-builder-head">
            <strong>${esc(key)}</strong>
            ${!isRoot && !isUnusedDiskKey(key) ? `<button type="button" class="cfg-row-del" data-del-key="${esc(key)}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
          <div class="cfg-builder-grid">
            ${!isExisting ? `
            <div class="cfg-field">
              <label>Stockage (nouveau volume)</label>
              <select class="form-control" data-disk-field="storage">
                ${storages.map((s) => `<option value="${esc(s)}" ${d.storage === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
              </select>
            </div>
            <div class="cfg-field">
              <label>Taille (Go)</label>
              <input type="number" class="form-control" data-disk-field="size" value="${esc(d.size)}" min="1" step="1">
            </div>
            <div class="cfg-field">
              <label>Format</label>
              <select class="form-control" data-disk-field="format">
                ${this.diskFormatOptionItems().map((o) => `<option value="${esc(o.v)}" ${d.format === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
              </select>
            </div>` : `
            <div class="cfg-field">
              <label>Stockage</label>
              <input type="text" class="form-control" value="${esc(d.storage)}" readonly>
            </div>
            <div class="cfg-field">
              <label>Taille affichée (Go) - redimensionnement</label>
              <input type="number" class="form-control" data-disk-field="size" value="${esc(d.size)}" min="1" step="1">
              <small class="cfg-hint">Augmenter la taille ici ; réduction ou migration via Proxmox natif.</small>
            </div>`}
          </div>
          ${existingBlock}
          ${this.renderDiskOptions(d, key, isRoot)}
          <div class="cfg-field cfg-field-full">
            <label>Valeur brute Proxmox (aperçu)</label>
            <input type="text" class="form-control cfg-raw-preview" data-dk-val value="${esc(this.get(key))}" readonly>
          </div>
          <input type="hidden" data-dk-key value="${esc(key)}">
        </div>`;
    }

    renderDisks() {
      if (this.type === 'lxc') {
        return `${this.section('Volume racine (rootfs)', 'fa-hdd')}${this.renderDiskBuilder('rootfs')}`;
      }
      const keys = this.diskKeys().filter((k) => !isUnusedDiskKey(k));
      const attachedSection = keys.length
        ? `${this.section('Disques attachés', 'fa-hard-drive')}${keys.map((k) => this.renderDiskBuilder(k)).join('')}`
        : '<p class="cfg-empty">Aucun disque attaché.</p>';
      const unused = this.unusedDiskKeys();
      const unusedSection = unused.length
        ? `${this.section('Disques détachés (unused)', 'fa-box-open')}${unused.map((k) => this.renderUnusedDiskCard(k)).join('')}`
        : '';
      const addBus = `<div class="cfg-add-row">
          <label>Ajouter un disque (nouveau volume)</label>
          <div class="cfg-add-inline">
            <select class="form-control" id="cfg-new-disk-bus">
              ${this.diskBusOptionItems().map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('')}
            </select>
            <button type="button" class="cfg-add-btn" id="cfg-add-disk"><i class="fa-solid fa-plus"></i> Ajouter</button>
          </div>
          <small class="cfg-hint">Nouveau volume sur le stockage choisi - migration d'un volume existant via Proxmox natif.</small>
        </div>`;
      return `${attachedSection}${unusedSection}${addBus}`;
    }

    renderNetwork() {
      const keys = this.netKeys();
      const cards = keys.map((k) => this.renderNetBuilder(k)).join('');
      return `
        ${cards || '<p class="cfg-empty">Aucune interface réseau.</p>'}
        <div class="cfg-add-row">
          <button type="button" class="cfg-add-btn" id="cfg-add-net"><i class="fa-solid fa-plus"></i> Ajouter une interface</button>
        </div>`;
    }

    renderIpconfigBuilder(key) {
      const p = parseIpconfig(this.get(key));
      return `
        <div class="cfg-builder-card" data-ipconfig-key="${esc(key)}">
          <div class="cfg-builder-head">
            <strong>${esc(key)}</strong>
            <button type="button" class="cfg-row-del" data-del-key="${esc(key)}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div class="cfg-builder-grid">
            <div class="cfg-field cfg-field-full">
              <label>Adresse IP (ip=)</label>
              <input type="text" class="form-control" data-ipconfig-field="ip" value="${esc(p.ip || '')}" placeholder="192.168.1.10/24">
            </div>
            <div class="cfg-field">
              <label>Passerelle (gw=)</label>
              <input type="text" class="form-control" data-ipconfig-field="gw" value="${esc(p.gw || '')}" placeholder="192.168.1.1">
            </div>
            <div class="cfg-field">
              <label>IPv6 (ip6=)</label>
              <input type="text" class="form-control" data-ipconfig-field="ip6" value="${esc(p.ip6 || '')}" placeholder="auto ou adresse/64">
            </div>
            <div class="cfg-field">
              <label>Passerelle IPv6 (gw6=)</label>
              <input type="text" class="form-control" data-ipconfig-field="gw6" value="${esc(p.gw6 || '')}">
            </div>
          </div>
        </div>`;
    }

    renderCloudInit() {
      const ipKeys = this.ipconfigKeys();
      const ipCards = ipKeys.map((k) => this.renderIpconfigBuilder(k)).join('');
      return `
        <div class="cfg-grid">
          ${this.section('Utilisateur', 'fa-user')}
          ${this.fieldText('ciuser', 'Utilisateur Cloud-Init', 'Ex: root, ubuntu')}
          ${this.fieldText('cipassword', 'Mot de passe', 'Stocké dans la config VM (Cloud-Init)')}
          ${this.section('Réseau & DNS', 'fa-globe')}
          ${this.fieldText('searchdomain', 'Domaine de recherche')}
          ${this.fieldText('nameserver', 'Serveurs DNS', 'Séparés par des espaces')}
          ${ipCards || '<p class="cfg-empty">Aucune interface ipconfig (ipconfig0, ipconfig1…).</p>'}
          <div class="cfg-add-row">
            <button type="button" class="cfg-add-btn" id="cfg-add-ipconfig"><i class="fa-solid fa-plus"></i> Ajouter ipconfig</button>
          </div>
          ${this.section('SSH', 'fa-key')}
          ${this.fieldTextarea('sshkeys', 'Clés SSH publiques', 'Format Proxmox (URL-encodé ou PEM)')}
        </div>`;
    }

    renderMountBuilder(key) {
      const m = parseMount(this.get(key));
      const storages = this.storageNames(['rootdir', 'images']);
      const volumeParts = String(m.volume || '').split(':');
      const storage = volumeParts[0] || storages[0] || '';
      const volRest = volumeParts.slice(1).join(':');

      return `
        <div class="cfg-builder-card" data-mount-key="${esc(key)}">
          <div class="cfg-builder-head">
            <strong>${esc(key)}</strong>
            <button type="button" class="cfg-row-del" data-del-key="${esc(key)}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div class="cfg-builder-grid">
            <div class="cfg-field">
              <label>Stockage</label>
              <select class="form-control" data-mount-field="storage">
                ${storages.map((s) => `<option value="${esc(s)}" ${storage === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
              </select>
            </div>
            <div class="cfg-field">
              <label>Volume (suffixe)</label>
              <input type="text" class="form-control" data-mount-field="volsuffix" value="${esc(volRest)}" placeholder="100/subvol-100-disk-1">
            </div>
            <div class="cfg-field">
              <label>Point de montage (mp=)</label>
              <input type="text" class="form-control" data-mount-field="mp" value="${esc(m.mp || '')}" placeholder="/mnt/data">
            </div>
            <div class="cfg-field">
              <label>ACL</label>
              <select class="form-control" data-mount-field="acl">
                <option value="" ${!m.acl ? 'selected' : ''}>Défaut</option>
                <option value="1" ${m.acl === '1' ? 'selected' : ''}>Activé (acl=1)</option>
                <option value="0" ${m.acl === '0' ? 'selected' : ''}>Désactivé (acl=0)</option>
              </select>
            </div>
            <div class="cfg-field">
              <label>Sauvegarde</label>
              <select class="form-control" data-mount-field="backup">
                <option value="" ${!m.backup ? 'selected' : ''}>Défaut</option>
                <option value="0" ${m.backup === '0' ? 'selected' : ''}>Exclure (backup=0)</option>
              </select>
            </div>
            <div class="cfg-field">
              <label>Réplication</label>
              <select class="form-control" data-mount-field="replicate">
                <option value="" ${!m.replicate ? 'selected' : ''}>Défaut</option>
                <option value="0" ${m.replicate === '0' ? 'selected' : ''}>Exclure (replicate=0)</option>
              </select>
            </div>
          </div>
          ${!volRest ? `<p class="cfg-info-banner"><i class="fa-solid fa-circle-info"></i> Changer le stockage d'un montage existant nécessite une migration du volume sous-jacent.</p>` : ''}
          <input type="hidden" data-dk-key value="${esc(key)}">
          <input type="hidden" data-dk-val value="${esc(this.get(key))}">
        </div>`;
    }

    renderMounts() {
      const keys = this.mountKeys();
      const cards = keys.map((k) => this.renderMountBuilder(k)).join('');
      return `
        ${cards || '<p class="cfg-empty">Aucun montage mp*.</p>'}
        <div class="cfg-add-row">
          <button type="button" class="cfg-add-btn" id="cfg-add-mount"><i class="fa-solid fa-plus"></i> Ajouter un montage</button>
        </div>`;
    }

    renderDynamicSimple(keys, prefix, def) {
      const rows = keys.map((k) => `
        <div class="cfg-dynamic-row" data-dynamic-key>
          <span class="cfg-row-label">${esc(k)}</span>
          <input type="hidden" data-dk-key value="${esc(k)}">
          <input type="text" class="form-control cfg-val-input" data-dk-val value="${esc(this.get(k))}">
          <button type="button" class="cfg-row-del" data-del-key="${esc(k)}"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('');
      return `
        ${rows || '<p class="cfg-empty">Aucun montage.</p>'}
        <button type="button" class="cfg-add-btn" data-add="${esc(prefix)}" data-default="${esc(def)}"><i class="fa-solid fa-plus"></i> Ajouter</button>`;
    }

    renderAdvanced() {
      const configText = this.buildFullConfigText();
      const hintKeys = Reg.ADVANCED_HINT_KEYS || OPTIONS.commonKeys;
      const extraKeys = this.advancedKeys();
      const keyOpts = hintKeys.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
      const rows = extraKeys.map((k) => `
        <div class="cfg-dynamic-row cfg-advanced-row" data-dynamic-key>
          <input type="text" class="form-control cfg-key-input" data-dk-key value="${esc(k)}" list="cfg-known-keys">
          <input type="text" class="form-control cfg-val-input" data-dk-val value="${esc(this.get(k))}">
          <button type="button" class="cfg-row-del" data-del-key="${esc(k)}"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('');
      const vmid = this.vm?.id ?? '';
      const confHint = this.type === 'lxc'
        ? `/etc/pve/lxc/${vmid}.conf`
        : `/etc/pve/qemu-server/${vmid}.conf`;

      return `
        <p class="cfg-advanced-intro">
          Configuration complète au format fichier Proxmox (<code>${esc(confHint)}</code>).
          Les notes/description sont affichées en commentaires (<code>#</code>), comme dans le fichier sur le nœud.
          Les commentaires <code>#</code> ajoutés manuellement dans le fichier ne sont pas renvoyés par l'API Proxmox.
        </p>
        <div class="cfg-raw-config-wrap">
          <div class="cfg-raw-config-head">
            <h4 class="cfg-section-title cfg-section-title-inline"><i class="fa-solid fa-file-code"></i> Configuration complète</h4>
            <button type="button" class="cfg-btn-secondary cfg-copy-raw" title="Copier dans le presse-papiers">
              <i class="fa-solid fa-copy"></i> Copier
            </button>
          </div>
          <textarea class="form-control cfg-config-raw" id="cfg-config-raw" readonly rows="22" spellcheck="false">${esc(configText)}</textarea>
        </div>
        <h4 class="cfg-section-title"><i class="fa-solid fa-wrench"></i> Paramètres hors onglets</h4>
        <p class="cfg-hint cfg-hint-block">Clés non gérées par les autres onglets (USB, PCI, série, watchdog…).</p>
        <datalist id="cfg-known-keys">${hintKeys.map((k) => `<option value="${esc(k)}">`).join('')}</datalist>
        <div class="cfg-dynamic-list cfg-advanced-list">${rows || '<p class="cfg-empty">Aucun paramètre supplémentaire.</p>'}</div>
        <div class="cfg-add-row cfg-add-advanced">
          <select class="form-control" id="cfg-new-key-select">
            <option value="">- Choisir une clé —</option>
            ${keyOpts}
            <option value="${CUSTOM}">Autre (saisie libre)</option>
          </select>
          <input type="text" class="form-control cfg-hidden" id="cfg-new-key" placeholder="Clé personnalisée">
          <input type="text" class="form-control" id="cfg-new-val" placeholder="Valeur">
          <button type="button" class="cfg-add-btn" id="cfg-add-custom"><i class="fa-solid fa-plus"></i> Ajouter</button>
        </div>`;
    }

    fieldText(key, label, hint) {
      return `
        <div class="cfg-field">
          <label>${esc(label)}</label>
          <input type="text" class="form-control" data-cfg-key="${esc(key)}" value="${esc(this.get(key))}">
          ${hint ? `<small class="cfg-hint">${esc(hint)}</small>` : ''}
        </div>`;
    }

    fieldTextarea(key, label, hint) {
      return `
        <div class="cfg-field cfg-field-full">
          <label>${esc(label)}</label>
          <textarea class="form-control cfg-textarea" data-cfg-key="${esc(key)}" rows="3">${esc(this.get(key))}</textarea>
          ${hint ? `<small class="cfg-hint">${esc(hint)}</small>` : ''}
        </div>`;
    }

    render() {
      if (!this.root) return;
      const lxc = this.type === 'lxc';
      const tabs = Reg.tabsForType ? Reg.tabsForType(this.type) : [
        { id: 'general', label: 'Général', icon: 'fa-sliders' },
        { id: 'cpu', label: 'CPU & RAM', icon: 'fa-microchip' },
        { id: 'advanced', label: 'Avancé', icon: 'fa-code' },
      ];

      this.root.innerHTML = `
        <div class="cfg-editor">
          <nav class="cfg-tabs">${tabs.map((t) =>
            `<button type="button" class="cfg-tab ${this.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
              <i class="fa-solid ${t.icon}"></i> ${t.label}
            </button>`).join('')}
          </nav>
          <div class="cfg-panels">
            <div class="cfg-panel ${this.activeTab === 'general' ? 'active' : ''}">${this.renderGeneral()}</div>
            <div class="cfg-panel ${this.activeTab === 'cpu' ? 'active' : ''}">${this.renderCpuRam()}</div>
            ${!lxc ? `<div class="cfg-panel ${this.activeTab === 'hardware' ? 'active' : ''}">${this.renderHardware()}</div>` : ''}
            ${!lxc ? `<div class="cfg-panel ${this.activeTab === 'boot' ? 'active' : ''}">${this.renderBoot()}</div>` : ''}
            <div class="cfg-panel ${this.activeTab === 'disks' ? 'active' : ''}">${this.renderDisks()}</div>
            <div class="cfg-panel ${this.activeTab === 'network' ? 'active' : ''}">${this.renderNetwork()}</div>
            ${lxc ? `<div class="cfg-panel ${this.activeTab === 'mounts' ? 'active' : ''}">${this.renderMounts()}</div>` : ''}
            ${!lxc ? `<div class="cfg-panel ${this.activeTab === 'cloudinit' ? 'active' : ''}">${this.renderCloudInit()}</div>` : ''}
            <div class="cfg-panel ${this.activeTab === 'advanced' ? 'active' : ''}">${this.renderAdvanced()}</div>
          </div>
        </div>`;

      this.bindEvents();
      this.syncBuildersToHidden();
    }

    syncBuildersToHidden() {
      this.root.querySelectorAll('[data-net-key]').forEach((card) => this.syncNetCard(card));
      this.root.querySelectorAll('[data-disk-key]').forEach((card) => this.syncDiskCard(card));
      this.root.querySelectorAll('[data-mount-key]').forEach((card) => this.syncMountCard(card));
      this.root.querySelectorAll('[data-ipconfig-key]').forEach((card) => this.syncIpconfigCard(card));
      this.syncVgaBuilder();
      this.syncAgentBuilder();
      this.syncFeaturesBuilder();
    }

    syncFeaturesBuilder() {
      const wrap = this.root?.querySelector('[data-features-builder]');
      if (!wrap) return;
      const o = {
        nesting: wrap.querySelector('[data-features-field="nesting"]')?.checked ?? false,
        keyctl: wrap.querySelector('[data-features-field="keyctl"]')?.checked ?? false,
        fuse: wrap.querySelector('[data-features-field="fuse"]')?.checked ?? false,
        mknod: wrap.querySelector('[data-features-field="mknod"]')?.checked ?? false,
        force_rw_sys: wrap.querySelector('[data-features-field="force_rw_sys"]')?.checked ?? false,
        mount: wrap.querySelector('[data-features-field="mount"]')?.value ?? '',
      };
      this.set('features', buildFeatures(o));
    }

    syncNetCard(card) {
      const key = card.dataset.netKey;
      if (this.type === 'lxc' || card.dataset.netKind === 'lxc') {
        const g = (f) => card.querySelector(`[data-net-field="${f}"]`)?.value ?? '';
        const ipMode = g('ip_mode');
        const ip6Mode = g('ip6_mode');
        let ip = '';
        if (ipMode === 'dhcp' || ipMode === 'manual') ip = ipMode;
        else if (ipMode === 'static') ip = g('ip_static').trim();
        let ip6 = '';
        if (ip6Mode === 'auto' || ip6Mode === 'dhcp' || ip6Mode === 'manual') ip6 = ip6Mode;
        else if (ip6Mode === 'static') ip6 = g('ip6_static').trim();
        const val = buildLxcNet({
          name: g('name') || 'eth0',
          type: 'veth',
          bridge: g('bridge') || 'vmbr0',
          hwaddr: g('hwaddr'),
          ip, gw: g('gw'), ip6, gw6: g('gw6'),
          tag: g('tag'), firewall: g('firewall'), rate: g('rate'), mtu: g('mtu'),
        });
        const hidden = card.querySelector('[data-dk-val]');
        if (hidden) hidden.value = val;
        this.set(key, val);
        return;
      }
      const g = (f) => card.querySelector(`[data-net-field="${f}"]`)?.value ?? '';
      let bridge = g('bridge');
      if (bridge === CUSTOM) bridge = card.querySelector('[data-net-bridge-custom]')?.value ?? 'vmbr0';
      const linkDown = card.querySelector('[data-net-field="link_down"]')?.checked ? '1' : '0';
      const val = buildNet({
        model: g('model') || 'virtio',
        mac: g('mac'),
        bridge,
        tag: g('tag'),
        firewall: g('firewall'),
        rate: g('rate'),
        queues: g('queues'),
        mtu: g('mtu'),
        trunks: g('trunks'),
        link_down: linkDown,
      });
      const hidden = card.querySelector('[data-dk-val]');
      if (hidden) hidden.value = val;
      this.set(key, val);
    }

    syncVgaBuilder() {
      const wrap = this.root?.querySelector('[data-vga-builder]');
      if (!wrap) return;
      const type = wrap.querySelector('[data-vga-field="type"]')?.value?.trim() || '';
      const memory = wrap.querySelector('[data-vga-field="memory"]')?.value?.trim() || '';
      const clipboard = wrap.querySelector('[data-vga-field="clipboard"]')?.value?.trim() || '';
      this.set('vga', buildVga({ type, memory, clipboard }));
    }

    syncAgentBuilder() {
      const wrap = this.root?.querySelector('[data-agent-builder]');
      if (!wrap) return;
      const enabled = wrap.querySelector('[data-agent-field="enabled"]')?.checked ?? false;
      const freeze = wrap.querySelector('[data-agent-field="freeze"]')?.checked ?? false;
      const fstrim = wrap.querySelector('[data-agent-field="fstrim"]')?.checked ?? false;
      this.set('agent', buildAgent({ enabled, freeze, fstrim }));
    }

    syncIpconfigCard(card) {
      const key = card.dataset.ipconfigKey;
      const g = (f) => card.querySelector(`[data-ipconfig-field="${f}"]`)?.value?.trim() ?? '';
      const val = buildIpconfig({ ip: g('ip'), gw: g('gw'), ip6: g('ip6'), gw6: g('gw6') });
      this.set(key, val);
    }

    syncMountCard(card) {
      const key = card.dataset.mountKey;
      const storage = card.querySelector('[data-mount-field="storage"]')?.value ?? '';
      const volsuffix = card.querySelector('[data-mount-field="volsuffix"]')?.value?.trim() ?? '';
      const mp = card.querySelector('[data-mount-field="mp"]')?.value?.trim() ?? '';
      const backup = card.querySelector('[data-mount-field="backup"]')?.value ?? '';
      const acl = card.querySelector('[data-mount-field="acl"]')?.value ?? '';
      const replicate = card.querySelector('[data-mount-field="replicate"]')?.value ?? '';
      const volume = volsuffix ? `${storage}:${volsuffix}` : storage;
      const val = buildMount({
        volume, mp,
        acl: acl || undefined,
        backup: backup || undefined,
        replicate: replicate || undefined,
      });
      const hidden = card.querySelector('[data-dk-val]');
      if (hidden) hidden.value = val;
      this.set(key, val);
    }

    syncDiskCard(card) {
      const key = card.dataset.diskKey;
      const isNew = card.dataset.diskIsNew !== '0';
      const storage = isNew
        ? (card.querySelector('[data-disk-field="storage"]')?.value ?? 'local-lvm')
        : (card.dataset.diskStorage || 'local-lvm');
      const size = card.querySelector('[data-disk-field="size"]')?.value ?? '32';
      const format = card.querySelector('[data-disk-field="format"]')?.value ?? 'raw';
      const volid = card.dataset.diskVolid || '';
      let extras = [];
      try {
        extras = JSON.parse(card.dataset.diskExtras || '[]');
      } catch (_) {
        extras = [];
      }
      const optEl = (f) => card.querySelector(`[data-disk-opt="${f}"]`);
      const optVal = (f) => {
        const el = optEl(f);
        if (!el) return '';
        if (el.type === 'checkbox') {
          if (f === 'backup' || f === 'replicate') return el.checked ? '0' : '';
          return el.checked ? '1' : '0';
        }
        return el.value ?? '';
      };
      const val = buildDisk({
        storage,
        size,
        format: isNew ? format : (format || 'raw'),
        volid,
        isNew,
        extras,
        cache: optVal('cache'),
        aio: optVal('aio'),
        iothread: optVal('iothread'),
        discard: optVal('discard'),
        ssd: optVal('ssd'),
        readonly: optVal('readonly'),
        serial: optVal('serial'),
        backup: optVal('backup'),
        replicate: optVal('replicate'),
        mbps_rd: optVal('mbps_rd'),
        mbps_wr: optVal('mbps_wr'),
      });
      const hidden = card.querySelector('[data-dk-val]');
      const preview = card.querySelector('.cfg-raw-preview');
      if (hidden) hidden.value = val;
      if (preview) preview.value = val;
      this.set(key, val);
    }

    bindEvents() {
      this.root.querySelectorAll('.cfg-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.syncFromDom();
          this.activeTab = btn.dataset.tab;
          this.render();
        });
      });

      this.root.querySelectorAll('[data-del-key]').forEach((btn) => {
        btn.addEventListener('click', () => this.removeKey(btn.dataset.delKey));
      });

      this.root.querySelectorAll('[data-add]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.syncFromDom();
          const prefix = btn.dataset.add;
          const idx = nextIndex(prefix, this.entries);
          this.addKey(`${prefix}${idx}`, btn.dataset.default || '');
        });
      });

      this.root.querySelectorAll('[data-cfg-select]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const key = sel.dataset.cfgSelect || sel.dataset.cfgKey;
          const custom = this.root.querySelector(`[data-cfg-custom="${key}"]`);
          if (key === CUSTOM) {
            if (custom) custom.classList.remove('cfg-hidden');
          } else {
            if (custom) custom.classList.add('cfg-hidden');
            if (key && !key.startsWith('__')) this.set(key, sel.value);
          }
        });
      });

      this.root.querySelectorAll('[data-cfg-custom]').forEach((inp) => {
        inp.addEventListener('input', () => {
          const key = inp.dataset.cfgCustom;
          if (key) this.set(key, inp.value);
        });
      });

      this.root.querySelectorAll('[data-net-key]').forEach((card) => {
        card.querySelectorAll('select, input').forEach((el) => {
          el.addEventListener('change', () => {
            if (el.dataset.netField === 'bridge' && el.value === CUSTOM) {
              card.querySelector('[data-net-bridge-custom]')?.classList.remove('cfg-hidden');
            }
            if (el.dataset.netField === 'ip_mode') {
              const staticInp = card.querySelector('[data-net-field="ip_static"]');
              if (staticInp) staticInp.disabled = el.value !== 'static';
            }
            if (el.dataset.netField === 'ip6_mode') {
              const staticInp = card.querySelector('[data-net-field="ip6_static"]');
              if (staticInp) staticInp.disabled = el.value !== 'static';
            }
            this.syncNetCard(card);
          });
          el.addEventListener('input', () => this.syncNetCard(card));
        });
      });

      const featuresBuilder = this.root.querySelector('[data-features-builder]');
      if (featuresBuilder) {
        featuresBuilder.querySelectorAll('input, select').forEach((el) => {
          el.addEventListener('change', () => this.syncFeaturesBuilder());
          el.addEventListener('input', () => this.syncFeaturesBuilder());
        });
      }

      this.root.querySelectorAll('[data-disk-detach]').forEach((btn) => {
        btn.addEventListener('click', () => this.detachDisk(btn.dataset.diskDetach));
      });

      this.root.querySelectorAll('[data-reattach]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.reattach;
          const bus = this.root.querySelector(`[data-reattach-bus="${key}"]`)?.value || 'scsi';
          this.reattachUnused(key, bus);
        });
      });

      this.root.querySelectorAll('[data-disk-key]').forEach((card) => {
        card.querySelectorAll('select, input').forEach((el) => {
          el.addEventListener('change', () => this.syncDiskCard(card));
          el.addEventListener('input', () => this.syncDiskCard(card));
        });
      });

      const vgaBuilder = this.root.querySelector('[data-vga-builder]');
      if (vgaBuilder) {
        vgaBuilder.querySelectorAll('select, input').forEach((el) => {
          el.addEventListener('change', () => this.syncVgaBuilder());
          el.addEventListener('input', () => this.syncVgaBuilder());
        });
      }

      const agentBuilder = this.root.querySelector('[data-agent-builder]');
      if (agentBuilder) {
        agentBuilder.querySelectorAll('input').forEach((el) => {
          el.addEventListener('change', () => {
            const enabled = agentBuilder.querySelector('[data-agent-field="enabled"]')?.checked;
            agentBuilder.querySelectorAll('[data-agent-field="freeze"], [data-agent-field="fstrim"]').forEach((cb) => {
              cb.disabled = !enabled;
            });
            this.syncAgentBuilder();
          });
        });
      }

      this.root.querySelectorAll('[data-mount-key]').forEach((card) => {
        card.querySelectorAll('select, input').forEach((el) => {
          el.addEventListener('change', () => this.syncMountCard(card));
          el.addEventListener('input', () => this.syncMountCard(card));
        });
      });

      this.root.querySelectorAll('[data-ipconfig-key]').forEach((card) => {
        card.querySelectorAll('input').forEach((el) => {
          el.addEventListener('change', () => this.syncIpconfigCard(card));
          el.addEventListener('input', () => this.syncIpconfigCard(card));
        });
      });

      document.getElementById('cfg-add-mount')?.addEventListener('click', () => {
        this.syncFromDom();
        const idx = nextIndex('mp', this.entries);
        const storage = this.storageNames(['rootdir', 'images'])[0] || 'local';
        this.addKey(`mp${idx}`, buildMount({ volume: `${storage}:`, mp: '/mnt/data' }));
      });

      document.getElementById('cfg-add-ipconfig')?.addEventListener('click', () => {
        this.syncFromDom();
        const idx = nextIndex('ipconfig', this.entries);
        this.addKey(`ipconfig${idx}`, buildIpconfig({ ip: 'dhcp' }));
      });

      this.root.querySelectorAll('[data-iso-mount]').forEach((card) => {
        card.querySelectorAll('select').forEach((sel) => {
          sel.addEventListener('change', async () => {
            if (sel.dataset.isoField === 'storage') {
              const storage = sel.value;
              await this.fetchIsoList(storage);
              const fileSel = card.querySelector('[data-iso-field="file"]');
              const cur = fileSel?.value || '';
              const list = this.getIsoList(storage);
              if (fileSel) {
                fileSel.innerHTML = `<option value="">- Aucune ISO —</option>` +
                  list.map((n) => `<option value="${esc(n)}" ${cur === n ? 'selected' : ''}>${esc(n)}</option>`).join('');
              }
            }
            this.syncIsoMounts();
            if (this.type === 'vm') {
              this.bootOrder = this.mergeBootOrder(this.bootOrder, this.bootableDevices());
            }
          });
        });
      });

      this.root.querySelectorAll('[data-iso-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.syncFromDom();
          const key = btn.dataset.isoDel;
          this.isoMounts = this.isoMounts.filter((m) => m.key !== key);
          this.entries.delete(key);
          this.deleted.add(key);
          if (this.type === 'vm') {
            this.bootOrder = this.bootOrder.filter((id) => id !== key);
            this.set('boot', buildBootValue(this.bootOrder));
          }
          this.render();
        });
      });

      document.getElementById('cfg-add-iso')?.addEventListener('click', async () => {
        this.syncFromDom();
        const key = this.nextIsoSlot();
        const storage = this.storageNames('iso')[0] || 'local';
        await this.fetchIsoList(storage);
        this.isoMounts.push({ key, storage, file: '', extras: ',media=cdrom' });
        this.render();
      });

      document.getElementById('cfg-add-net')?.addEventListener('click', () => {
        this.syncFromDom();
        const idx = nextIndex('net', this.entries);
        const defaultBridge = this.bridgeList()[0] || 'vmbr0';
        if (this.type === 'lxc') {
          this.addKey(`net${idx}`, buildLxcNet({
            name: 'eth0', bridge: defaultBridge, firewall: '1', ip: 'dhcp', type: 'veth',
          }));
        } else {
          this.addKey(`net${idx}`, buildNet({ model: 'virtio', mac: '', bridge: defaultBridge, firewall: '1' }));
        }
      });

      document.getElementById('cfg-add-disk')?.addEventListener('click', () => {
        this.syncFromDom();
        const bus = document.getElementById('cfg-new-disk-bus')?.value || 'scsi';
        const idx = nextIndex(bus, this.entries);
        this.addKey(`${bus}${idx}`, buildDisk({ storage: this.storageNames('images')[0], size: '32', format: 'raw' }));
        if (this.type === 'vm') {
          this.bootOrder = this.mergeBootOrder(this.bootOrder, this.bootableDevices());
        }
      });

      this.root.querySelectorAll('[data-boot-up]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.bootUp;
          const i = this.bootOrder.indexOf(id);
          if (i > 0) {
            [this.bootOrder[i - 1], this.bootOrder[i]] = [this.bootOrder[i], this.bootOrder[i - 1]];
            this.set('boot', buildBootValue(this.bootOrder));
            this.render();
          }
        });
      });

      this.root.querySelectorAll('[data-boot-down]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.bootDown;
          const i = this.bootOrder.indexOf(id);
          if (i >= 0 && i < this.bootOrder.length - 1) {
            [this.bootOrder[i], this.bootOrder[i + 1]] = [this.bootOrder[i + 1], this.bootOrder[i]];
            this.set('boot', buildBootValue(this.bootOrder));
            this.render();
          }
        });
      });

      this.root.querySelector('.cfg-copy-raw')?.addEventListener('click', async () => {
        const ta = this.root.querySelector('#cfg-config-raw');
        const text = ta?.value || this.buildFullConfigText();
        try {
          await navigator.clipboard.writeText(text);
          const btn = this.root.querySelector('.cfg-copy-raw');
          if (btn) {
            const prev = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Copié';
            setTimeout(() => { btn.innerHTML = prev; }, 1500);
          }
        } catch (_) {
          ta?.select();
          document.execCommand('copy');
        }
      });

      const keySel = document.getElementById('cfg-new-key-select');
      const keyInput = document.getElementById('cfg-new-key');
      keySel?.addEventListener('change', () => {
        if (keySel.value === CUSTOM) {
          keyInput?.classList.remove('cfg-hidden');
          keyInput?.focus();
        } else {
          keyInput?.classList.add('cfg-hidden');
          if (keyInput) keyInput.value = keySel.value;
        }
      });

      document.getElementById('cfg-add-custom')?.addEventListener('click', () => {
        const k = (keySel?.value === CUSTOM ? keyInput?.value : keySel?.value)?.trim();
        const v = document.getElementById('cfg-new-val')?.value ?? '';
        if (k) {
          this.syncFromDom();
          this.addKey(k, v);
        }
      });
    }

    syncFromDom() {
      this.root.querySelectorAll('[data-cfg-key]').forEach((el) => {
        const key = el.dataset.cfgKey;
        if (!key || key.startsWith('__')) return;
        if (el.tagName === 'SELECT' && el.value === CUSTOM) return;
        if (el.type === 'checkbox') {
          this.set(key, el.checked ? '1' : '0');
          return;
        }
        if (el.type === 'number' && el.value === '' && el.hasAttribute('placeholder')) {
          this.set(key, '');
          return;
        }
        this.set(key, el.value);
      });

      this.root.querySelectorAll('[data-cfg-custom]').forEach((el) => {
        const key = el.dataset.cfgCustom;
        if (key && !el.classList.contains('cfg-hidden')) this.set(key, el.value);
      });

      this.root.querySelectorAll('[data-net-key]').forEach((c) => this.syncNetCard(c));
      this.root.querySelectorAll('[data-disk-key]').forEach((c) => this.syncDiskCard(c));
      this.root.querySelectorAll('[data-mount-key]').forEach((c) => this.syncMountCard(c));
      this.root.querySelectorAll('[data-ipconfig-key]').forEach((c) => this.syncIpconfigCard(c));
      this.syncVgaBuilder();
      this.syncAgentBuilder();
      this.syncFeaturesBuilder();

      this.root.querySelectorAll('[data-dynamic-key]').forEach((row) => {
        const key = row.querySelector('[data-dk-key]')?.value?.trim();
        const val = row.querySelector('[data-dk-val]')?.value ?? '';
        if (key) this.set(key, val);
      });

      const startupOrder = this.root.querySelector('[data-cfg-startup-order]')?.value?.trim() ?? '';
      const startupUp = this.root.querySelector('[data-cfg-startup-up]')?.value?.trim() ?? '';
      this.set('startup', buildStartup(startupOrder, startupUp));

      if (this.type === 'vm') {
        this.syncIsoMounts();
        this.rebuildIsoMountsFromDom();
        this.bootOrder = this.mergeBootOrder(
          this.bootOrder.length ? this.bootOrder : parseBootOrder(this.get('boot')),
          this.bootableDevices()
        );
        this.set('boot', buildBootValue(this.bootOrder));
      }
    }

    async fetchIsoList(storage) {
      const node = this.vm?.node;
      if (!node || !storage) return [];
      if (this.isoLists.has(storage)) return this.isoLists.get(storage);
      try {
        const params = new URLSearchParams({ action: 'storage-content', node, storage, content: 'iso' });
        const res = await fetch(`/api/data?${params}`);
        const data = await res.json();
        const list = (data.content || [])
          .map((item) => {
            const volid = item.volid || '';
            return volid.includes('/') ? volid.split('/').pop() : volid;
          })
          .filter(Boolean);
        this.isoLists.set(storage, list);
        return list;
      } catch (_) {
        this.isoLists.set(storage, []);
        return [];
      }
    }
  }

  global.GuestConfigEditor = GuestConfigEditor;
})(typeof window !== 'undefined' ? window : globalThis);
