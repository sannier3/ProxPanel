/**
 * Énumérations config LXC - alignées sur pve-container (LXC.pm).
 */
export const LXC_CONFIG_SCHEMA = {
  source: 'proxmox/pve-container master - LXC.pm',
  arch: {
    values: ['amd64', 'arm64', 'armhf', 'riscv32', 'riscv64'],
    labels: {
      amd64: 'amd64 (x86_64)',
      arm64: 'arm64',
      armhf: 'armhf',
      riscv32: 'riscv32',
      riscv64: 'riscv64',
    },
  },
  cmode: {
    values: ['tty', 'console', 'shell'],
    labels: { tty: '/dev/tty[X]', console: '/dev/console', shell: 'shell' },
  },
  features: {
    keys: ['nesting', 'keyctl', 'fuse', 'mount', 'mknod', 'force_rw_sys'],
    labels: {
      nesting: 'Nesting (Docker/LXD dans le CT)',
      keyctl: 'keyctl (systemd / Docker)',
      fuse: 'FUSE (SSHFS, etc.)',
      mknod: 'mknod (création de nœuds)',
      force_rw_sys: 'force_rw_sys (sys rw forcé)',
      mount: 'Types de montage autorisés (nfs;cifs…)',
    },
    mountPresets: [
      { v: '', l: 'Aucun type extra' },
      { v: 'nfs', l: 'NFS' },
      { v: 'cifs', l: 'CIFS/SMB' },
      { v: 'nfs;cifs', l: 'NFS + CIFS' },
    ],
  },
  ipMode: {
    values: ['', 'dhcp', 'manual', 'static'],
    labels: { '': 'Non défini', dhcp: 'DHCP', manual: 'Manuel (dans le CT)', static: 'Statique (CIDR)' },
  },
  ip6Mode: {
    values: ['', 'auto', 'dhcp', 'manual', 'static'],
    labels: {
      '': 'Non défini', auto: 'auto (SLAAC)', dhcp: 'DHCPv6', manual: 'Manuel', static: 'Statique (CIDR)',
    },
  },
  ostype: {
    values: [
      'debian', 'ubuntu', 'centos', 'fedora', 'archlinux', 'alpine', 'gentoo',
      'opensuse', 'nixos', 'unmanaged', 'other',
    ],
    labels: {
      debian: 'Debian',
      ubuntu: 'Ubuntu',
      centos: 'CentOS',
      fedora: 'Fedora',
      alpine: 'Alpine',
      unmanaged: 'Non géré',
      other: 'Autre',
    },
  },
};
