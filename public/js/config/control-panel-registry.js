/**
 * Sections du panneau de configuration - alignées sur l'arborescence Proxmox VE (Datacenter / Nœud).
 */
(function (global) {
  const CATEGORIES = [
    {
      id: 'datacenter',
      title: 'Centre de données',
      description: 'Cluster, stockage, sauvegardes, réplication',
      icon: 'fa-building',
      color: '#2563eb',
    },
    {
      id: 'ha',
      title: 'Haute disponibilité',
      description: 'Groupes et ressources HA',
      icon: 'fa-shield-halved',
      color: '#7c3aed',
    },
    {
      id: 'security',
      title: 'Sécurité et accès',
      description: 'Utilisateurs, rôles, ACL, pare-feu cluster',
      icon: 'fa-user-lock',
      color: '#dc2626',
    },
    {
      id: 'nodes',
      title: 'Nœuds',
      description: 'Système, réseau, DNS, mises à jour, disques',
      icon: 'fa-server',
      color: '#059669',
    },
    {
      id: 'advanced',
      title: 'Avancé',
      description: 'Ceph, SDN, métriques',
      icon: 'fa-diagram-project',
      color: '#6b7280',
    },
    {
      id: 'proxmoxpanel',
      title: 'ProxPanel',
      description: 'Personnalisation du bureau et compte',
      icon: 'fa-layer-group',
      color: '#0ea5e9',
    },
  ];

  /** @type {Array<{id:string,categoryId:string,title:string,subtitle?:string,apiSection?:string,scope:'cluster'|'node'|'local',proxmoxPath?:string,readOnly?:boolean}>} */
  const SECTIONS = [
    // —- Datacenter ——
    { id: 'summary', categoryId: 'datacenter', title: 'Résumé', subtitle: 'État du cluster', apiSection: 'summary', scope: 'cluster', proxmoxPath: 'Datacenter → Résumé' },
    { id: 'cluster-options', categoryId: 'datacenter', title: 'Options', subtitle: 'Paramètres globaux du cluster', apiSection: 'cluster-options', scope: 'cluster', proxmoxPath: 'Datacenter → Options' },
    { id: 'storage', categoryId: 'datacenter', title: 'Stockage', subtitle: 'Datastore et contenus', apiSection: 'storage', scope: 'cluster', proxmoxPath: 'Datacenter → Stockage' },
    { id: 'backup', categoryId: 'datacenter', title: 'Sauvegarde', subtitle: 'Planifications et jobs', apiSection: 'backup', scope: 'cluster', proxmoxPath: 'Datacenter → Sauvegarde' },
    { id: 'replication', categoryId: 'datacenter', title: 'Réplication', subtitle: 'Jobs de réplication', apiSection: 'replication', scope: 'cluster', proxmoxPath: 'Datacenter → Réplication' },

    // —- HA ——
    { id: 'ha-resources', categoryId: 'ha', title: 'HA', subtitle: 'Ressources, groupes et statut', apiSection: 'ha-resources', scope: 'cluster', proxmoxPath: 'Datacenter → HA' },

    // —- Sécurité ——
    { id: 'users', categoryId: 'security', title: 'Utilisateurs', apiSection: 'users', scope: 'cluster', proxmoxPath: 'Datacenter → Permissions → Utilisateurs' },
    { id: 'groups', categoryId: 'security', title: 'Groupes', apiSection: 'groups', scope: 'cluster', proxmoxPath: 'Datacenter → Permissions → Groupes' },
    { id: 'roles', categoryId: 'security', title: 'Rôles', apiSection: 'roles', scope: 'cluster', proxmoxPath: 'Datacenter → Permissions → Rôles' },
    { id: 'acl', categoryId: 'security', title: 'ACL', subtitle: 'Contrôle d\'accès', apiSection: 'acl', scope: 'cluster', proxmoxPath: 'Datacenter → Permissions → ACL' },
    { id: 'pools', categoryId: 'security', title: 'Pools', apiSection: 'pools', scope: 'cluster', proxmoxPath: 'Datacenter → Permissions → Pools' },
    { id: 'tokens', categoryId: 'security', title: 'Jetons API', subtitle: 'Liés aux utilisateurs', apiSection: 'tokens', scope: 'cluster', proxmoxPath: 'Datacenter → Permissions → API Tokens' },
    { id: 'firewall-cluster', categoryId: 'security', title: 'Pare-feu (cluster)', apiSection: 'firewall-cluster', scope: 'cluster', proxmoxPath: 'Datacenter → Pare-feu' },

    // —- Nœud (apiSection partagé, scope node) ——
    { id: 'node-summary', categoryId: 'nodes', title: 'Résumé', apiSection: 'node-summary', scope: 'node', proxmoxPath: 'Nœud → Résumé' },
    { id: 'node-options', categoryId: 'nodes', title: 'Options système', apiSection: 'node-options', scope: 'node', proxmoxPath: 'Nœud → Système → Options' },
    { id: 'node-network', categoryId: 'nodes', title: 'Réseau', apiSection: 'node-network', scope: 'node', proxmoxPath: 'Nœud → Système → Réseau' },
    { id: 'node-dns', categoryId: 'nodes', title: 'DNS', apiSection: 'node-dns', scope: 'node', proxmoxPath: 'Nœud → Système → DNS' },
    { id: 'node-hosts', categoryId: 'nodes', title: 'Fichier hosts', apiSection: 'node-hosts', scope: 'node', proxmoxPath: 'Nœud → Système → Hosts' },
    { id: 'node-time', categoryId: 'nodes', title: 'Heure', apiSection: 'node-time', scope: 'node', proxmoxPath: 'Nœud → Système → Heure' },
    { id: 'node-certificates', categoryId: 'nodes', title: 'Certificats', apiSection: 'node-certificates', scope: 'node', proxmoxPath: 'Nœud → Système → Certificats' },
    { id: 'node-storage', categoryId: 'nodes', title: 'Stockage (nœud)', apiSection: 'node-storage', scope: 'node', proxmoxPath: 'Nœud → Stockage local' },
    { id: 'node-repositories', categoryId: 'nodes', title: 'Dépôts APT', apiSection: 'node-repositories', scope: 'node', proxmoxPath: 'Nœud → Mises à jour → Dépôts' },
    { id: 'node-updates', categoryId: 'nodes', title: 'Mises à jour', apiSection: 'node-updates', scope: 'node', proxmoxPath: 'Nœud → Mises à jour' },
    { id: 'node-firewall', categoryId: 'nodes', title: 'Pare-feu (nœud)', apiSection: 'node-firewall', scope: 'node', proxmoxPath: 'Nœud → Pare-feu' },
    { id: 'node-disks', categoryId: 'nodes', title: 'Disques', subtitle: 'Liste, LVM, ZFS', apiSection: 'node-disks', scope: 'node', proxmoxPath: 'Nœud → Disques' },

    // —- Avancé ——
    { id: 'ceph', categoryId: 'advanced', title: 'Ceph', apiSection: 'ceph', scope: 'cluster', proxmoxPath: 'Datacenter / Nœud → Ceph' },
    { id: 'sdn', categoryId: 'advanced', title: 'SDN', subtitle: 'Zones et VNets', apiSection: 'sdn', scope: 'cluster', proxmoxPath: 'Datacenter → SDN' },
    { id: 'metrics', categoryId: 'advanced', title: 'Métriques', apiSection: 'metrics', scope: 'cluster', proxmoxPath: 'Datacenter → Metric Server' },

    // —- ProxPanel ——
    { id: 'pp-desktop', categoryId: 'proxmoxpanel', title: 'Bureau et widgets', scope: 'local' },
    { id: 'pp-account', categoryId: 'proxmoxpanel', title: 'Compte et session', scope: 'local' },
    { id: 'pp-tools', categoryId: 'proxmoxpanel', title: 'Outils ProxPanel', scope: 'local' },
  ];

  const PROXMOX_REF_ITEMS = [
    { title: 'Console invité / VNC', path: 'VM → Console' },
    { title: 'Cloud-Init', path: 'VM → Cloud-Init' },
    { title: 'Snapshots', path: 'VM → Snapshots' },
    { title: 'Pare-feu VM/CT', path: 'VM → Pare-feu' },
    { title: 'Réplication VM', path: 'VM → Réplication' },
    { title: 'Tâches cluster', path: 'Datacenter → tâches (barre inférieure)' },
  ];

  function getCategory(id) {
    return CATEGORIES.find((c) => c.id === id) || null;
  }

  function getSection(id) {
    return SECTIONS.find((s) => s.id === id) || null;
  }

  function sectionsForCategory(categoryId) {
    return SECTIONS.filter((s) => s.categoryId === categoryId);
  }

  global.ProxPanelControlPanelRegistry = {
    CATEGORIES,
    SECTIONS,
    PROXMOX_REF_ITEMS,
    getCategory,
    getSection,
    sectionsForCategory,
  };
})(typeof window !== 'undefined' ? window : globalThis);
