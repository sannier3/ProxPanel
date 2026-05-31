/**
 * Schémas complémentaires (pare-feu, HA, rôles, jetons, SDN, métriques, nœud…)
 */
(function (global) {
  const base = global.ProxPanelControlPanelSchemas;
  if (!base) return;

  const FW_ACTIONS = [
    ['ACCEPT', 'ACCEPT'],
    ['DROP', 'DROP'],
    ['REJECT', 'REJECT'],
  ];
  const FW_DIRECTION = [
    ['in', 'Entrant'],
    ['out', 'Sortant'],
    ['group', 'Groupe'],
  ];

  const FW_RULE_FIELDS = [
    { name: 'enable', label: 'Activée', type: 'checkbox', default: true },
    { name: 'type', label: 'Direction', type: 'select', options: FW_DIRECTION, default: 'in' },
    { name: 'action', label: 'Action', type: 'select', options: FW_ACTIONS, default: 'ACCEPT' },
    { name: 'macro', label: 'Macro', type: 'lookup', lookup: 'fwMacros', allowCustom: true },
    { name: 'iface', label: 'Interface', type: 'lookup', lookup: 'ifaces', allowCustom: true },
    { name: 'source', label: 'Source', type: 'lookup', lookup: 'fwAliases', allowCustom: true, placeholder: 'IP, CIDR ou +dc/alias' },
    { name: 'dest', label: 'Destination', type: 'lookup', lookup: 'fwAliases', allowCustom: true },
    { name: 'group', label: 'Groupe (si direction=groupe)', type: 'lookup', lookup: 'fwGroups', allowCustom: true, showIf: { type: 'group' } },
    { name: 'proto', label: 'Protocole', type: 'select', options: [['', '—'], ['tcp', 'TCP'], ['udp', 'UDP'], ['icmp', 'ICMP']] },
    { name: 'dport', label: 'Port dest.', type: 'text' },
    { name: 'sport', label: 'Port source', type: 'text' },
    { name: 'log', label: 'Journaliser', type: 'select', options: [['', 'Non'], ['info', 'info'], ['nolog', 'nolog']] },
    { name: 'comment', label: 'Commentaire', type: 'text' },
  ];

  const EXTRA = {
    'fw-rule': {
      type: 'entity',
      label: 'Règle pare-feu',
      idField: 'pos',
      listColumns: ['pos', 'type', 'action', 'source', 'dest', 'comment', 'enable'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: FW_RULE_FIELDS,
    },

    'fw-alias': {
      type: 'entity',
      label: 'Alias pare-feu',
      idField: 'name',
      listColumns: ['name', 'cidr', 'comment'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'name', label: 'Nom', type: 'text', required: true, createOnly: true },
        { name: 'cidr', label: 'CIDR / IP', type: 'text', required: true },
        { name: 'comment', label: 'Commentaire', type: 'text' },
      ],
    },

    'fw-group': {
      type: 'entity',
      label: 'Groupe pare-feu',
      idField: 'group',
      listColumns: ['group', 'comment'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'group', label: 'Nom du groupe', type: 'text', required: true, createOnly: true },
        { name: 'comment', label: 'Commentaire', type: 'text' },
      ],
    },

    'ha-resource': {
      type: 'entity',
      label: 'Ressource HA',
      idField: 'sid',
      listColumns: ['sid', 'state', 'group', 'max_restart', 'max_relocate', 'comment'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'sid', label: 'Invité', type: 'lookup', lookup: 'guests', required: true, createOnly: true },
        {
          name: 'state',
          label: 'État',
          type: 'select',
          options: [
            ['started', 'Démarré'],
            ['stopped', 'Arrêté'],
            ['disabled', 'Désactivé'],
            ['ignored', 'Ignoré'],
          ],
          default: 'started',
        },
        { name: 'group', label: 'Groupe HA', type: 'lookup', lookup: 'haGroups', allowCustom: true },
        { name: 'max_restart', label: 'Redémarrages max', type: 'number', default: 1 },
        { name: 'max_relocate', label: 'Relocalisations max', type: 'number', default: 1 },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
    },

    'ha-group': {
      type: 'entity',
      label: 'Groupe HA',
      idField: 'group',
      listColumns: ['group', 'nodes', 'restricted', 'comment'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'group', label: 'Nom', type: 'text', required: true, createOnly: true },
        { name: 'nodes', label: 'Nœuds', type: 'multiLookup', lookup: 'nodes' },
        { name: 'restricted', label: 'Restreint', type: 'checkbox' },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
    },

    roles: {
      type: 'entity',
      label: 'Rôle',
      idField: 'roleid',
      listColumns: ['roleid', 'privs'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      mapRow: (row) => ({
        ...row,
        privs: Array.isArray(row.privs) ? row.privs.join(',') : row.privs,
      }),
      fields: [
        { name: 'roleid', label: 'ID rôle', type: 'text', required: true, createOnly: true },
        { name: 'privs', label: 'Privilèges', type: 'multiLookup', lookup: 'privileges', required: true },
      ],
    },

    tokens: {
      type: 'entity',
      label: 'Jeton API',
      idField: 'tokenid',
      listColumns: ['tokenid', 'userid', 'expire', 'privsep', 'comment'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'userid', label: 'Utilisateur', type: 'lookup', lookup: 'users', required: true, createOnly: true },
        { name: 'tokenid', label: 'ID jeton', type: 'text', required: true, createOnly: true },
        { name: 'expire', label: 'Expiration (epoch, 0=jamais)', type: 'text', default: '0' },
        { name: 'privsep', label: 'Séparation privilèges', type: 'checkbox', default: true },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
      mapRow: (row) => ({
        ...row,
        _rowId: `${row.userid}|${row.tokenid}`,
      }),
    },

    'ha-resources': {
      type: 'multi',
      blocks: [
        {
          sub: 'resources',
          label: 'Ressources HA',
          entitySchemaKey: 'ha-resource',
          mutateSection: 'ha',
          dataKey: 'resources',
        },
        {
          sub: 'groups',
          label: 'Groupes HA',
          entitySchemaKey: 'ha-group',
          mutateSection: 'ha',
          dataKey: 'groups',
        },
        { label: 'Statut HA', dataKey: 'status', viewOnly: true },
      ],
    },

    'firewall-cluster': {
      type: 'multi',
      scope: 'cluster',
      blocks: [
        {
          sub: 'options',
          label: 'Options',
          editType: 'form',
          dataKey: 'options',
          fields: [
            { name: 'enable', label: 'Activer', type: 'checkbox' },
            { name: 'policy_in', label: 'Politique entrante', type: 'select', options: FW_ACTIONS },
            { name: 'policy_out', label: 'Politique sortante', type: 'select', options: FW_ACTIONS },
            { name: 'log_ratelimit', label: 'Limite logs', type: 'text' },
          ],
        },
        {
          sub: 'rules',
          label: 'Règles',
          entitySchemaKey: 'fw-rule',
          mutateSection: 'firewall-cluster',
          dataKey: 'rules',
          scope: 'cluster',
        },
        {
          sub: 'aliases',
          label: 'Alias IP',
          entitySchemaKey: 'fw-alias',
          mutateSection: 'firewall-cluster',
          dataKey: 'aliases',
          scope: 'cluster',
        },
        {
          sub: 'groups',
          label: 'Groupes de sécurité',
          entitySchemaKey: 'fw-group',
          mutateSection: 'firewall-cluster',
          dataKey: 'groups',
          scope: 'cluster',
        },
      ],
    },

    'node-firewall': {
      type: 'multi',
      scope: 'node',
      blocks: [
        {
          sub: 'options',
          label: 'Options',
          editType: 'form',
          dataKey: 'options',
          fields: [
            { name: 'enable', label: 'Activer', type: 'checkbox' },
            { name: 'policy_in', label: 'Politique entrante', type: 'select', options: FW_ACTIONS },
            { name: 'policy_out', label: 'Politique sortante', type: 'select', options: FW_ACTIONS },
          ],
        },
        {
          sub: 'rules',
          label: 'Règles',
          entitySchemaKey: 'fw-rule',
          mutateSection: 'node-firewall',
          dataKey: 'rules',
          scope: 'node',
        },
        {
          sub: 'aliases',
          label: 'Alias IP',
          entitySchemaKey: 'fw-alias',
          mutateSection: 'node-firewall',
          dataKey: 'aliases',
          scope: 'node',
        },
      ],
    },

    'node-hosts': {
      type: 'form',
      label: 'Fichier /etc/hosts',
      fields: [
        {
          name: 'data',
          label: 'Contenu du fichier',
          type: 'textarea',
          rows: 14,
          placeholder: '127.0.0.1 localhost\n192.168.1.10 monserveur.local',
        },
      ],
      mapData: (raw) => {
        if (typeof raw === 'string') return { data: raw };
        if (raw?.data != null) return { data: String(raw.data) };
        return { data: '' };
      },
    },

    'node-time': {
      type: 'form',
      label: 'Heure système',
      fields: [
        { name: 'timezone', label: 'Fuseau horaire', type: 'lookup', lookup: 'timezones', allowCustom: true },
      ],
    },

    'node-updates': {
      type: 'actions',
      label: 'Mises à jour APT',
      actions: [
        { id: 'refresh', label: 'Recharger la liste', icon: 'fa-rotate', operation: 'reload' },
        {
          id: 'upgrade',
          label: 'Lancer la mise à niveau',
          icon: 'fa-download',
          operation: 'upgrade',
          confirm: 'Démarrer apt upgrade sur ce nœud ? Les invités peuvent être affectés.',
          danger: true,
        },
      ],
      listDataKey: 'data',
    },

    'node-repositories': {
      type: 'actions',
      label: 'Dépôts APT',
      actions: [
        {
          id: 'add-standard',
          label: 'Ajouter les dépôts Proxmox standard',
          icon: 'fa-plus',
          operation: 'add-standard',
          confirm: 'Ajouter les dépôts recommandés par Proxmox ?',
        },
      ],
      listDataKey: 'data',
    },

    'node-disks': {
      type: 'multi',
      blocks: [
        { label: 'Disques physiques', dataKey: 'disks', viewOnly: true },
        { label: 'LVM', dataKey: 'lvm', viewOnly: true },
        { label: 'ZFS', dataKey: 'zfs', viewOnly: true },
        { label: 'Répertoires', dataKey: 'directory', viewOnly: true },
      ],
    },

    'node-certificates': {
      type: 'view',
      label: 'Certificats',
      dataKeys: ['data'],
    },

    ceph: {
      type: 'multi',
      blocks: [
        { label: 'Métadonnées cluster', dataKey: 'metadata', viewOnly: true },
        { label: 'Statut Ceph', dataKey: 'status', viewOnly: true },
      ],
    },

    sdn: {
      type: 'multi',
      blocks: [
        {
          sub: 'zones',
          label: 'Zones SDN',
          entitySchemaKey: 'sdn-zone',
          mutateSection: 'sdn',
          dataKey: 'zones',
        },
        {
          sub: 'vnets',
          label: 'Réseaux virtuels',
          entitySchemaKey: 'sdn-vnet',
          mutateSection: 'sdn',
          dataKey: 'vnets',
        },
        { label: 'Contrôleurs', dataKey: 'controllers', viewOnly: true },
      ],
    },

    'sdn-zone': {
      type: 'entity',
      label: 'Zone SDN',
      idField: 'zone',
      listColumns: ['zone', 'type', 'bridge', 'mtu', 'nodes'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'zone', label: 'Zone', type: 'text', required: true, createOnly: true },
        {
          name: 'type',
          label: 'Type',
          type: 'select',
          required: true,
          options: [
            ['vlan', 'VLAN'],
            ['vxlan', 'VXLAN'],
            ['evpn', 'EVPN'],
            ['simple', 'Simple'],
            ['qinq', 'QinQ'],
          ],
        },
        { name: 'bridge', label: 'Bridge', type: 'text' },
        { name: 'mtu', label: 'MTU', type: 'number' },
        { name: 'nodes', label: 'Nœuds', type: 'multiLookup', lookup: 'nodes' },
        { name: 'ipam', label: 'IPAM', type: 'text' },
      ],
    },

    'sdn-vnet': {
      type: 'entity',
      label: 'VNet SDN',
      idField: 'vnet',
      listColumns: ['vnet', 'zone', 'alias', 'tag', 'vlanaware'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'vnet', label: 'VNet', type: 'text', required: true, createOnly: true },
        { name: 'zone', label: 'Zone', type: 'lookup', lookup: 'sdnZones', required: true },
        { name: 'alias', label: 'Alias', type: 'text' },
        { name: 'tag', label: 'Tag VLAN', type: 'number' },
        { name: 'vlanaware', label: 'VLAN aware', type: 'checkbox' },
      ],
    },

    metrics: {
      type: 'form',
      label: 'Serveur de métriques',
      help: 'Configuration InfluxDB / métriques Proxmox (Datacenter → Metric Server).',
      fields: [
        { name: 'server', label: 'Serveur', type: 'text', required: true, placeholder: 'influx.example.com' },
        { name: 'port', label: 'Port', type: 'number', default: 8086 },
        { name: 'disable', label: 'Désactivé', type: 'checkbox' },
        { name: 'protocol', label: 'Protocole', type: 'select', options: [['udp', 'UDP'], ['http', 'HTTP'], ['https', 'HTTPS']] },
        { name: 'influxdbproto', label: 'Proto InfluxDB', type: 'text' },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
      mapData: (raw) => (Array.isArray(raw) ? raw[0] || {} : raw || {}),
    },
  };

  Object.assign(base.SCHEMAS, EXTRA);

  base.isEditable = function isEditable(sectionApiKey) {
    const s = base.SCHEMAS[sectionApiKey];
    if (!s) return false;
    if (s.type === 'view') return false;
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
