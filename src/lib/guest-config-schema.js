import { QEMU_CONFIG_SCHEMA } from './qemu-config-schema.js';
import { LXC_CONFIG_SCHEMA } from './lxc-config-schema.js';

export { QEMU_CONFIG_SCHEMA, LXC_CONFIG_SCHEMA };

export function getGuestConfigSchema(type = 'vm') {
  return type === 'lxc'
    ? { type: 'lxc', ...LXC_CONFIG_SCHEMA, qemu: QEMU_CONFIG_SCHEMA }
    : { type: 'vm', ...QEMU_CONFIG_SCHEMA, lxc: LXC_CONFIG_SCHEMA };
}

export function getCombinedConfigSchema() {
  return {
    source: 'ProxPanel - proxmox/qemu-server + pve-container',
    vm: QEMU_CONFIG_SCHEMA,
    lxc: LXC_CONFIG_SCHEMA,
  };
}
