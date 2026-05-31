/**
 * Registre des applications du bureau ProxPanel.
 */
(function (global) {
  const CATEGORIES = {
    overview: { label: 'Vue d\'ensemble', icon: 'fa-house' },
    compute: { label: 'Calcul', icon: 'fa-cube' },
    infra: { label: 'Infrastructure', icon: 'fa-server' },
    storage: { label: 'Stockage', icon: 'fa-hard-drive' },
    system: { label: 'Système', icon: 'fa-gear' },
  };

  const APPS = [
    {
      id: 'dashboard',
      title: 'Instances',
      icon: 'fa-cube',
      category: 'compute',
      singleton: true,
      pinned: true,
      defaultRect: { width: 1080, height: 720 },
      minSize: { width: 640, height: 420 },
    },
    {
      id: 'vms',
      title: 'Gestion VMs',
      icon: 'fa-table-list',
      category: 'compute',
      singleton: true,
      pinned: false,
      defaultRect: { width: 960, height: 640 },
      minSize: { width: 560, height: 400 },
    },
    {
      id: 'nodes',
      title: 'Nœuds',
      icon: 'fa-server',
      category: 'infra',
      singleton: true,
      pinned: true,
      defaultRect: { width: 1100, height: 760 },
      minSize: { width: 720, height: 480 },
    },
    {
      id: 'monitor',
      title: 'Moniteur',
      icon: 'fa-chart-line',
      category: 'infra',
      singleton: true,
      pinned: true,
      defaultRect: { width: 1000, height: 680 },
      minSize: { width: 640, height: 420 },
    },
    {
      id: 'tasks',
      title: 'Tâches',
      icon: 'fa-list-check',
      category: 'infra',
      singleton: true,
      pinned: true,
      defaultRect: { width: 920, height: 600 },
      minSize: { width: 560, height: 360 },
    },
    {
      id: 'storage',
      title: 'Stockage',
      icon: 'fa-database',
      category: 'storage',
      singleton: true,
      pinned: true,
      defaultRect: { width: 900, height: 580 },
      minSize: { width: 520, height: 360 },
    },
    {
      id: 'control-panel',
      title: 'Panneau de configuration',
      icon: 'fa-gear',
      category: 'system',
      singleton: true,
      pinned: true,
      defaultRect: { width: 1020, height: 680 },
      minSize: { width: 720, height: 480 },
    },
    {
      id: 'settings',
      title: 'Paramètres ProxPanel',
      icon: 'fa-sliders',
      category: 'system',
      singleton: true,
      pinned: false,
      defaultRect: { width: 560, height: 480 },
      minSize: { width: 400, height: 320 },
    },
    {
      id: 'tools',
      title: 'Outils',
      icon: 'fa-wrench',
      category: 'system',
      singleton: true,
      pinned: false,
      defaultRect: { width: 480, height: 360 },
      minSize: { width: 360, height: 280 },
    },
  ];

  function getApp(id) {
    return APPS.find((a) => a.id === id) || null;
  }

  function pinnedApps() {
    return APPS.filter((a) => a.pinned);
  }

  function appsByCategory() {
    const map = {};
    for (const app of APPS) {
      if (!map[app.category]) map[app.category] = [];
      map[app.category].push(app);
    }
    return map;
  }

  global.ProxPanelAppRegistry = {
    APPS,
    CATEGORIES,
    getApp,
    pinnedApps,
    appsByCategory,
  };
})(typeof window !== 'undefined' ? window : globalThis);
