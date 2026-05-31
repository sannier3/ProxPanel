/**
 * Schémas d'édition alignés sur pve-manager (OptionView, UserEdit, GroupEdit, ACLAdd, etc.)
 */
(function (global) {
  const KEYBOARD_LAYOUTS = [
    ['__default__', 'Par défaut'],
    ['de', 'Allemand'],
    ['de-ch', 'Allemand (Suisse)'],
    ['da', 'Danois'],
    ['en-gb', 'Anglais (UK)'],
    ['en-us', 'Anglais (US)'],
    ['es', 'Espagnol'],
    ['fi', 'Finnois'],
    ['fr', 'Français'],
    ['fr-be', 'Français (Belgique)'],
    ['fr-ca', 'Français (Canada)'],
    ['fr-ch', 'Français (Suisse)'],
    ['hu', 'Hongrois'],
    ['is', 'Islandais'],
    ['it', 'Italien'],
    ['ja', 'Japonais'],
    ['lt', 'Lituanien'],
    ['mk', 'Macédonien'],
    ['nl', 'Néerlandais'],
    ['no', 'Norvégien'],
    ['pl', 'Polonais'],
    ['pt', 'Portugais'],
    ['pt-br', 'Portugais (Brésil)'],
    ['sl', 'Slovène'],
    ['sv', 'Suédois'],
    ['tr', 'Turc'],
  ];

  const CONSOLE_VIEWERS = [
    ['__default__', 'Par défaut (HTML5 préféré)'],
    ['html5', 'HTML5'],
    ['xtermjs', 'xterm.js'],
    ['vv', 'SPICE (virt-viewer)'],
  ];

  const STORAGE_TYPES = [
    ['dir', 'Répertoire'],
    ['lvm', 'LVM'],
    ['lvmthin', 'LVM-Thin'],
    ['zfspool', 'ZFS'],
    ['nfs', 'NFS'],
    ['cifs', 'CIFS/SMB'],
    ['iscsi', 'iSCSI'],
    ['rbd', 'Ceph RBD'],
  ];

  const HA_SHUTDOWN = [
    ['__default__', 'Par défaut (conditional)'],
    ['conditional', 'conditional'],
    ['freeze', 'freeze'],
    ['failover', 'failover'],
    ['migrate', 'migrate'],
  ];

  /** @type {Record<string, object>} */
  const SCHEMAS = {
    'cluster-options': {
      type: 'options-grid',
      label: 'Options du cluster',
      help: 'Comme Datacenter → Options dans Proxmox. Les champs complexes (migration, tags…) utilisent le format propriété Proxmox.',
      options: [
        { key: 'keyboard', label: 'Disposition clavier', type: 'select', options: KEYBOARD_LAYOUTS, emptyMeansDelete: true },
        { key: 'console', label: 'Console par défaut', type: 'select', options: CONSOLE_VIEWERS, emptyMeansDelete: true },
        { key: 'http_proxy', label: 'Proxy HTTP', type: 'text', placeholder: 'http://proxy:3128', emptyMeansDelete: true },
        { key: 'email_from', label: 'E-mail expéditeur', type: 'text', placeholder: 'root@$hostname', emptyMeansDelete: true },
        { key: 'mac_prefix', label: 'Préfixe MAC', type: 'text', placeholder: 'BC:24:11', emptyMeansDelete: true },
        { key: 'max_workers', label: 'Workers max (actions groupées)', type: 'number', min: 1, max: 64 },
        { key: 'consent-text', label: 'Texte de consentement', type: 'textarea', emptyMeansDelete: true },
        { key: 'migration', label: 'Migration (propriétés)', type: 'property', hint: 'Ex: network=10.0.0.0/24' },
        {
          key: 'ha',
          label: 'Politique HA (shutdown)',
          type: 'select',
          options: [
            ['', '__default__'],
            ['conditional', 'conditional'],
            ['freeze', 'freeze'],
            ['failover', 'failover'],
            ['migrate', 'migrate'],
          ],
          propertyKey: 'ha',
          propertySubKey: 'shutdown_policy',
          emptyMeansDelete: true,
        },
        { key: 'bwlimit', label: 'Limites bande passante', type: 'property', hint: 'Ex: default=10240,clone=5120' },
        { key: 'next-id', label: 'Plage VMID libre', type: 'property', hint: 'Ex: lower=100,upper=999999' },
        { key: 'description', label: 'Description cluster', type: 'text', emptyMeansDelete: true },
        { key: 'cluster-resource-scheduling', label: 'Planification ressources (CRS)', type: 'property' },
        { key: 'user-tag-access', label: 'Accès tags utilisateur', type: 'property' },
        { key: 'registered-tags', label: 'Tags enregistrés', type: 'property' },
      ],
    },

    users: {
      type: 'entity',
      label: 'Utilisateur',
      idField: 'userid',
      listColumns: ['userid', 'email', 'firstname', 'lastname', 'enable', 'expire'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'userid', label: 'Identifiant', type: 'text', required: true, createOnly: true },
        { name: 'realm', label: 'Realm', type: 'realm', required: true, createOnly: true },
        { name: 'password', label: 'Mot de passe', type: 'password', minLength: 8, realmPamOnly: true },
        { name: 'verifypassword', label: 'Confirmer', type: 'password', submit: false, realmPamOnly: true },
        { name: 'groups', label: 'Groupes', type: 'multiLookup', lookup: 'groups' },
        { name: 'firstname', label: 'Prénom', type: 'text' },
        { name: 'lastname', label: 'Nom', type: 'text' },
        { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'expire', label: 'Expiration', type: 'text', placeholder: '0 = jamais, ou epoch' },
        { name: 'enable', label: 'Activé', type: 'checkbox', default: true },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
    },

    groups: {
      type: 'entity',
      label: 'Groupe',
      idField: 'groupid',
      listColumns: ['groupid', 'comment', 'users'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'groupid', label: 'Nom du groupe', type: 'text', required: true, createOnly: true },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
    },

    pools: {
      type: 'entity',
      label: 'Pool',
      idField: 'poolid',
      listColumns: ['poolid', 'comment'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'poolid', label: 'Nom', type: 'text', required: true, createOnly: true },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
    },

    acl: {
      type: 'entity',
      label: 'Entrée ACL',
      idField: '_aclKey',
      listColumns: ['path', 'ugid', 'roleid', 'propagate'],
      canCreate: true,
      canEdit: false,
      canDelete: true,
      fields: [
        { name: 'path', label: 'Chemin', type: 'lookup', lookup: 'aclPaths', required: true, allowCustom: true, placeholder: '/vms/100' },
        { name: 'aclType', label: 'Type', type: 'select', required: true, options: [['user', 'Utilisateur'], ['group', 'Groupe']], default: 'user' },
        { name: 'users', label: 'Utilisateur', type: 'lookup', lookup: 'users', showIf: { aclType: 'user' }, required: true },
        { name: 'groups', label: 'Groupe', type: 'lookup', lookup: 'groups', showIf: { aclType: 'group' }, required: true },
        { name: 'roles', label: 'Rôle', type: 'lookup', lookup: 'roles', required: true, default: 'NoAccess' },
        { name: 'propagate', label: 'Propager', type: 'checkbox', default: true },
      ],
      mapRow: (row) => ({
        ...row,
        _aclKey: `${row.path}|${row.ugid}|${row.roleid}`,
        aclType: row.type === 'group' ? 'group' : 'user',
        users: row.type === 'user' ? row.ugid : '',
        groups: row.type === 'group' ? row.ugid : '',
      }),
      buildPayload: (form, op) => {
        const p = { path: form.path, roles: form.roles, propagate: form.propagate ? 1 : 0 };
        if (form.aclType === 'group') p.groups = form.groups;
        else p.users = form.users;
        if (op === 'delete') {
          const del = { delete: 1, path: form.path, roles: form.roles };
          if (form.aclType === 'group') del.groups = form.groups;
          else del.users = form.users;
          return del;
        }
        return p;
      },
    },

    storage: {
      type: 'entity',
      label: 'Stockage',
      idField: 'storage',
      listColumns: ['storage', 'type', 'content', 'nodes', 'shared', 'disable'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'storage', label: 'ID stockage', type: 'text', required: true, createOnly: true },
        {
          name: 'type',
          label: 'Type',
          type: 'select',
          required: true,
          options: STORAGE_TYPES,
          createOnly: true,
        },
        { name: 'path', label: 'Chemin / export', type: 'text', placeholder: '/mnt/data ou export NFS' },
        { name: 'vgname', label: 'Volume group', type: 'text' },
        { name: 'server', label: 'Serveur', type: 'text' },
        { name: 'content', label: 'Types de contenu', type: 'multiLookup', lookup: 'contentTypes' },
        { name: 'nodes', label: 'Nœuds', type: 'multiLookup', lookup: 'nodes', placeholder: 'Vide = tous les nœuds' },
        { name: 'shared', label: 'Partagé', type: 'checkbox' },
        { name: 'disable', label: 'Désactivé', type: 'checkbox' },
      ],
    },

    backup: {
      type: 'entity',
      label: 'Job de sauvegarde',
      idField: 'id',
      listColumns: ['id', 'storage', 'schedule', 'enabled', 'mode', 'comment'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'id', label: 'ID job', type: 'text', required: true, createOnly: true },
        { name: 'storage', label: 'Stockage cible', type: 'lookup', lookup: 'storagesBackup', required: true },
        { name: 'schedule', label: 'Planification', type: 'lookup', lookup: 'schedulePresets', allowCustom: true, placeholder: 'daily, */2:00…' },
        { name: 'enabled', label: 'Activé', type: 'checkbox', default: true },
        { name: 'mode', label: 'Mode', type: 'select', options: [['snapshot', 'Snapshot'], ['suspend', 'Suspend'], ['stop', 'Stop']] },
        { name: 'compress', label: 'Compression', type: 'select', options: [['', 'Aucune'], ['lzo', 'LZO'], ['gzip', 'GZIP'], ['zstd', 'ZSTD']] },
        { name: 'all', label: 'Toutes les VMs', type: 'checkbox' },
        { name: 'vmid', label: 'VMID (si pas toutes)', type: 'lookup', lookup: 'guestVmids', allowCustom: true },
        { name: 'mailto', label: 'E-mail notification', type: 'text' },
        { name: 'notes-template', label: 'Modèle notes', type: 'text' },
        { name: 'prune-backups', label: 'Rétention (prune)', type: 'text', placeholder: 'keep-last=7' },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
    },

    replication: {
      type: 'entity',
      label: 'Job de réplication',
      idField: 'id',
      listColumns: ['id', 'guest', 'target', 'schedule', 'enabled', 'comment'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'id', label: 'ID', type: 'text', required: true, createOnly: true },
        { name: 'guest', label: 'Invité', type: 'lookup', lookup: 'guests', required: true },
        { name: 'target', label: 'Nœud cible', type: 'lookup', lookup: 'nodes', required: true },
        { name: 'schedule', label: 'Planification', type: 'lookup', lookup: 'schedulePresets', allowCustom: true },
        { name: 'enabled', label: 'Activé', type: 'checkbox', default: true },
        { name: 'comment', label: 'Commentaire', type: 'textarea' },
      ],
    },


    'node-dns': {
      type: 'form',
      label: 'DNS du nœud',
      fields: [
        { name: 'search', label: 'Domaine de recherche', type: 'text' },
        { name: 'dns1', label: 'Serveur DNS 1', type: 'text' },
        { name: 'dns2', label: 'Serveur DNS 2', type: 'text' },
        { name: 'dns3', label: 'Serveur DNS 3', type: 'text' },
      ],
    },

    'node-options': {
      type: 'form',
      label: 'Options du nœud',
      fields: [
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'tags', label: 'Tags', type: 'text', placeholder: 'prod;lab' },
        { name: 'startall-onboot-delay', label: 'Délai démarrage auto (s)', type: 'number' },
        { name: 'wakeonlan', label: 'Wake-on-LAN', type: 'text' },
      ],
    },


    'node-network': {
      type: 'entity',
      label: 'Interface réseau',
      idField: 'iface',
      listColumns: ['iface', 'type', 'active', 'address', 'gateway', 'bridge', 'autostart'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      fields: [
        { name: 'iface', label: 'Interface', type: 'text', required: true, createOnly: true },
        {
          name: 'type',
          label: 'Type',
          type: 'select',
          required: true,
          options: [
            ['eth', 'Ethernet'],
            ['bridge', 'Bridge'],
            ['bond', 'Bond'],
            ['vlan', 'VLAN'],
            ['OVSBridge', 'OVS Bridge'],
          ],
        },
        { name: 'address', label: 'Adresse (CIDR)', type: 'text', placeholder: '192.168.1.10/24' },
        { name: 'gateway', label: 'Passerelle', type: 'text' },
        { name: 'bridge', label: 'Bridge', type: 'lookup', lookup: 'bridges', allowCustom: true },
        { name: 'bridge_ports', label: 'Ports bridge', type: 'multiLookup', lookup: 'physicalIfaces' },
        { name: 'bond_slaves', label: 'Esclaves bond', type: 'multiLookup', lookup: 'physicalIfaces' },
        { name: 'vlan-raw-device', label: 'VLAN device', type: 'lookup', lookup: 'ifaces', allowCustom: true },
        { name: 'cidr', label: 'CIDR (alias)', type: 'text' },
        { name: 'comments', label: 'Commentaire', type: 'text' },
        { name: 'autostart', label: 'Démarrage auto', type: 'checkbox', default: true },
      ],
    },
  };

  function getSchema(sectionApiKey) {
    return SCHEMAS[sectionApiKey] || null;
  }

  function isEditable(sectionApiKey) {
    return !!SCHEMAS[sectionApiKey];
  }

  global.ProxPanelControlPanelSchemas = {
    SCHEMAS,
    getSchema,
    isEditable,
    KEYBOARD_LAYOUTS,
    CONSOLE_VIEWERS,
    HA_SHUTDOWN,
  };
})(typeof window !== 'undefined' ? window : globalThis);
