/**
 * Énumérations config QEMU - alignées sur proxmox/qemu-server (QemuServer.pm, Network.pm).
 * Mettre à jour lors des montées de version PVE majeures.
 */
export const QEMU_CONFIG_SCHEMA = {
  source: 'proxmox/qemu-server master - QemuServer.pm, Network.pm',
  vga: {
    types: [
      'std', 'virtio', 'virtio-gl', 'vmware', 'qxl', 'qxl2', 'qxl3', 'qxl4',
      'cirrus', 'none', 'serial0', 'serial1', 'serial2', 'serial3',
    ],
    typeLabels: {
      std: 'Standard VGA (std)',
      virtio: 'VirtIO GPU (virtio)',
      'virtio-gl': 'VirtIO GPU GL (virtio-gl)',
      vmware: 'VMware compatible',
      qxl: 'QXL - SPICE (qxl)',
      qxl2: 'QXL 2 écrans',
      qxl3: 'QXL 3 écrans',
      qxl4: 'QXL 4 écrans',
      cirrus: 'Cirrus (legacy, déconseillé)',
      none: 'Aucun',
      serial0: 'Console série 0',
      serial1: 'Console série 1',
      serial2: 'Console série 2',
      serial3: 'Console série 3',
    },
    memory: { min: 4, max: 512, unit: 'MiB' },
    clipboard: ['vnc'],
  },
  bios: {
    values: ['seabios', 'ovmf'],
    labels: { seabios: 'SeaBIOS (legacy)', ovmf: 'UEFI (OVMF)' },
  },
  scsihw: {
    values: ['lsi', 'lsi53c810', 'virtio-scsi-pci', 'virtio-scsi-single', 'megasas', 'pvscsi'],
    labels: {
      lsi: 'LSI 53C895A',
      lsi53c810: 'LSI 53C810',
      'virtio-scsi-pci': 'VirtIO SCSI (recommandé)',
      'virtio-scsi-single': 'VirtIO SCSI single',
      megasas: 'MegaRAID SAS',
      pvscsi: 'VMware PVSCSI',
    },
  },
  ostype: {
    values: ['other', 'wxp', 'w2k', 'w2k3', 'w2k8', 'wvista', 'win7', 'win8', 'win10', 'win11', 'l24', 'l26', 'solaris'],
    labels: {
      other: 'Autre / non spécifié',
      wxp: 'Windows XP',
      w2k: 'Windows 2000',
      w2k3: 'Windows Server 2003',
      w2k8: 'Windows Server 2008',
      win7: 'Windows 7',
      win8: 'Windows 8 / Server 2012',
      win10: 'Windows 10 / Server 2016-2019',
      win11: 'Windows 11 / Server 2022+',
      wvista: 'Windows Vista',
      l24: 'Linux 2.4 (l24)',
      l26: 'Linux 2.6 – 6.x (l26)',
      solaris: 'Solaris / OpenSolaris',
    },
  },
  netModels: {
    values: [
      'virtio', 'e1000', 'e1000-82540em', 'e1000-82544gc', 'e1000-82545em', 'e1000e',
      'i82551', 'i82557b', 'i82559er', 'ne2k_isa', 'ne2k_pci', 'pcnet', 'rtl8139', 'vmxnet3',
    ],
    labels: {
      virtio: 'VirtIO (recommandé)',
      e1000: 'Intel E1000',
      e1000e: 'Intel E1000e',
      rtl8139: 'Realtek 8139',
      vmxnet3: 'VMware vmxnet3',
      pcnet: 'AMD PCNet',
    },
  },
  diskFormat: {
    values: ['raw', 'qcow2', 'vmdk'],
    labels: { raw: 'RAW', qcow2: 'QCOW2', vmdk: 'VMDK' },
  },
  diskBus: {
    values: ['scsi', 'virtio', 'sata', 'ide'],
    labels: { scsi: 'SCSI', virtio: 'VirtIO Block', sata: 'SATA', ide: 'IDE' },
  },
  diskCache: {
    values: ['', 'none', 'writethrough', 'writeback', 'directsync', 'unsafe'],
    labels: {
      '': 'Défaut hyperviseur',
      none: 'none - pas de cache hôte (recommandé NVMe)',
      writethrough: 'writethrough',
      writeback: 'writeback (rapide, risque coupure)',
      directsync: 'directsync - le plus sûr',
      unsafe: 'unsafe - non recommandé',
    },
  },
  diskAio: {
    values: ['', 'native', 'threads', 'io_uring'],
    labels: {
      '': 'Défaut',
      native: 'native',
      threads: 'threads',
      io_uring: 'io_uring (Linux récent)',
    },
  },
};

export function schemaSelectOptions(section, emptyOption) {
  const block = QEMU_CONFIG_SCHEMA[section];
  if (!block) return emptyOption ? [{ v: '', l: emptyOption }] : [];
  const values = block.values || block.types || [];
  const labels = block.labels || block.typeLabels || {};
  const opts = values.map((v) => ({ v, l: labels[v] || v }));
  if (emptyOption !== undefined) opts.unshift({ v: '', l: emptyOption });
  return opts;
}
