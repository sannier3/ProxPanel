/**
 * Registre des widgets bureau ProxPanel - templates et rendu.
 */
(function (global) {
  const CATEGORIES = {
    overview: { label: 'Vue d\'ensemble', icon: 'fa-house' },
    metrics: { label: 'Métriques', icon: 'fa-chart-simple' },
    instances: { label: 'Instances', icon: 'fa-cube' },
    storage: { label: 'Stockage & sauvegardes', icon: 'fa-hard-drive' },
    tools: { label: 'Outils', icon: 'fa-wrench' },
  };

  function statRow(main, sub, extra) {
    return `<div class="dw-stat-row"><span>${main}</span>${sub ? `<span class="dw-muted">${sub}</span>` : ''}${extra || ''}</div>`;
  }

  function miniList(items, emptyMsg) {
    if (!items.length) return `<div class="dw-empty">${emptyMsg}</div>`;
    return `<ul class="dw-mini-list">${items.map((it) => `<li>${it}</li>`).join('')}</ul>`;
  }

  function gaugeBar(label, value, colorClass, sub) {
    const v = Math.min(100, Math.max(0, Number(value) || 0));
    return `
      <div class="dw-gauge">
        <div class="dw-gauge-head">
          <span>${label}</span>
          <strong>${v.toFixed(1)}%</strong>
        </div>
        <div class="dw-gauge-track"><div class="dw-gauge-fill ${colorClass || ''}" style="width:${v}%"></div></div>
        ${sub ? `<div class="dw-gauge-sub">${sub}</div>` : ''}
      </div>`;
  }

  const WIDGETS = [
    {
      id: 'cluster',
      title: 'Cluster',
      description: 'État des nœuds du cluster',
      icon: 'fa-server',
      category: 'overview',
      size: 'sm',
      launchApp: 'nodes',
      defaultInLayout: true,
      render(ctx, esc) {
        const s = ctx.cluster;
        const ok = s.online === s.nodes && s.nodes > 0;
        return `
          <div class="dw-stat-row">
            <span><strong>${s.online}</strong>/${s.nodes} nœuds</span>
            <span class="desktop-widget-dot ${ok ? 'ok' : 'warn'}"></span>
          </div>
          ${s.offline > 0 ? `<div class="dw-hint warn">${s.offline} hors ligne</div>` : ''}`;
      },
    },
    {
      id: 'instances',
      title: 'Instances',
      description: 'VM et conteneurs actifs',
      icon: 'fa-cube',
      category: 'overview',
      size: 'sm',
      launchApp: 'dashboard',
      defaultInLayout: true,
      render(ctx) {
        const s = ctx.cluster;
        return `
          <div class="dw-stat-row">
            <span><strong>${s.running}</strong> actives</span>
            <span class="dw-muted">${s.vms} total</span>
          </div>
          ${s.stopped > 0 ? `<div class="dw-hint">${s.stopped} arrêtée(s)</div>` : ''}`;
      },
    },
    {
      id: 'tasks',
      title: 'Tâches',
      description: 'Tâches Proxmox en cours',
      icon: 'fa-list-check',
      category: 'overview',
      size: 'sm',
      launchApp: 'tasks',
      defaultInLayout: true,
      render(ctx) {
        const n = ctx.cluster.tasksRunning ?? 0;
        return `
          <div class="dw-stat-row">
            <span><strong>${n}</strong> en cours</span>
          </div>
          ${ctx.cluster.tasksErrors > 0
            ? `<div class="dw-hint warn">${ctx.cluster.tasksErrors} erreur(s)</div>`
            : '<div class="dw-hint">Surveillez vos opérations</div>'}`;
      },
    },
    {
      id: 'storage',
      title: 'Stockage',
      description: 'Résumé des datastores',
      icon: 'fa-database',
      category: 'overview',
      size: 'sm',
      launchApp: 'storage',
      defaultInLayout: false,
      render(ctx, esc) {
        return `<div class="dw-stat-row"><span>${esc(ctx.cluster.storageSummary || '—')}</span></div>`;
      },
    },
    {
      id: 'cpu-gauge',
      title: 'CPU cluster',
      description: 'Charge CPU moyenne du cluster',
      icon: 'fa-microchip',
      category: 'metrics',
      size: 'md',
      launchApp: 'monitor',
      defaultInLayout: true,
      render(ctx) {
        const s = ctx.cluster;
        return gaugeBar('Moyenne cluster', s.avgCpu, 'cpu', `${s.online} nœud(s) en ligne`);
      },
    },
    {
      id: 'memory-gauge',
      title: 'Mémoire cluster',
      description: 'Utilisation RAM moyenne',
      icon: 'fa-memory',
      category: 'metrics',
      size: 'md',
      launchApp: 'monitor',
      defaultInLayout: true,
      render(ctx) {
        const s = ctx.cluster;
        const sub = s.ramUsedGb != null && s.ramTotalGb != null
          ? `${s.ramUsedGb.toFixed(1)} / ${s.ramTotalGb.toFixed(1)} Go`
          : '';
        return gaugeBar('RAM utilisée', s.avgRam, 'ram', sub);
      },
    },
    {
      id: 'clock',
      title: 'Horloge',
      description: 'Date et heure locales',
      icon: 'fa-clock',
      category: 'tools',
      size: 'md',
      defaultInLayout: false,
      render(ctx) {
        return `
          <div class="dw-clock">
            <div class="dw-clock-time">${ctx.clock.time}</div>
            <div class="dw-clock-date">${ctx.clock.date}</div>
          </div>`;
      },
    },
    {
      id: 'quick-actions',
      title: 'Actions rapides',
      description: 'Raccourcis vers les apps principales',
      icon: 'fa-bolt',
      category: 'tools',
      size: 'lg',
      defaultInLayout: true,
      render(ctx, esc) {
        const actions = [
          { app: 'dashboard', icon: 'fa-cube', label: 'Instances' },
          { app: 'monitor', icon: 'fa-chart-line', label: 'Moniteur' },
          { app: 'tasks', icon: 'fa-list-check', label: 'Tâches' },
          { app: 'tools', icon: 'fa-wrench', label: 'Outils' },
        ];
        return `<div class="dw-actions">${actions.map((a) => `
          <button type="button" class="dw-action-btn" data-launch-app="${esc(a.app)}" title="${esc(a.label)}">
            <i class="fa-solid ${esc(a.icon)}"></i>
            <span>${esc(a.label)}</span>
          </button>`).join('')}</div>`;
      },
    },
    {
      id: 'node-list',
      title: 'Nœuds',
      description: 'Liste compacte des nœuds',
      icon: 'fa-sitemap',
      category: 'metrics',
      size: 'lg',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx, esc) {
        const nodes = ctx.nodes.slice(0, 6);
        if (!nodes.length) return '<div class="dw-empty">Aucun nœud</div>';
        return `<ul class="dw-node-list">${nodes.map((n) => `
          <li class="dw-node-item">
            <span class="desktop-widget-dot ${n.status === 'online' ? 'ok' : 'warn'}"></span>
            <span class="dw-node-name">${esc(n.name)}</span>
            <span class="dw-node-cpu">${(n.cpu || 0).toFixed(0)}%</span>
          </li>`).join('')}</ul>`;
      },
    },
    {
      id: 'top-vms',
      title: 'Top CPU',
      description: 'Instances les plus sollicitées',
      icon: 'fa-ranking-star',
      category: 'metrics',
      size: 'lg',
      launchApp: 'monitor',
      defaultInLayout: false,
      render(ctx, esc) {
        const vms = ctx.topVms.slice(0, 4);
        if (!vms.length) return '<div class="dw-empty">Aucune instance active</div>';
        return `<ul class="dw-vm-list">${vms.map((vm) => `
          <li class="dw-vm-item" data-open-console="${vm.id}" data-vm-type="${esc(vm.type)}" data-vm-node="${esc(vm.node)}" data-vm-name="${esc(vm.name)}">
            <i class="fa-solid ${vm.type === 'lxc' ? 'fa-box' : 'fa-desktop'} dw-vm-icon"></i>
            <span class="dw-vm-name">${esc(vm.name)}</span>
            <span class="dw-vm-cpu">${(vm.cpu || 0).toFixed(0)}%</span>
          </li>`).join('')}</ul>`;
      },
    },
    {
      id: 'alerts',
      title: 'Alertes',
      description: 'Problèmes détectés sur le cluster',
      icon: 'fa-triangle-exclamation',
      category: 'overview',
      size: 'md',
      defaultInLayout: false,
      render(ctx) {
        const items = [];
        if (ctx.cluster.offline > 0) {
          items.push({ icon: 'fa-server', text: `${ctx.cluster.offline} nœud(s) hors ligne`, warn: true });
        }
        if (ctx.cluster.stopped > 0) {
          items.push({ icon: 'fa-stop-circle', text: `${ctx.cluster.stopped} instance(s) arrêtée(s)`, warn: false });
        }
        if (ctx.cluster.tasksErrors > 0) {
          items.push({ icon: 'fa-circle-xmark', text: `${ctx.cluster.tasksErrors} tâche(s) en erreur`, warn: true });
        }
        if (!items.length) {
          return `<div class="dw-alert-ok"><i class="fa-solid fa-circle-check"></i> Tout est nominal</div>`;
        }
        return `<ul class="dw-alert-list">${items.map((it) => `
          <li class="dw-alert-item ${it.warn ? 'warn' : ''}">
            <i class="fa-solid ${it.icon}"></i> ${it.text}
          </li>`).join('')}</ul>`;
      },
    },
    {
      id: 'shortcuts',
      title: 'Raccourcis apps',
      description: 'Applications épinglées sur le bureau',
      icon: 'fa-th',
      category: 'tools',
      size: 'lg',
      defaultInLayout: false,
      render(ctx, esc) {
        const apps = ctx.pinnedApps.slice(0, 6);
        if (!apps.length) return '<div class="dw-empty">Aucune app épinglée</div>';
        return `<div class="dw-shortcuts">${apps.map((a) => `
          <button type="button" class="dw-shortcut" data-launch-app="${esc(a.id)}" title="${esc(a.title)}">
            <i class="fa-solid ${esc(a.icon)}"></i>
            <span>${esc(a.title)}</span>
          </button>`).join('')}</div>`;
      },
    },
    {
      id: 'load-avg',
      title: 'Charge système',
      description: 'Load average du cluster',
      icon: 'fa-gauge-high',
      category: 'metrics',
      size: 'sm',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx) {
        const load = ctx.cluster.avgLoad ?? 0;
        const level = load > 2 ? 'warn' : 'ok';
        return `
          <div class="dw-stat-row">
            <span>Load moy.</span>
            <strong class="dw-load-${level}">${load.toFixed(2)}</strong>
          </div>
          <div class="dw-hint">Sur les nœuds en ligne</div>`;
      },
    },
    {
      id: 'network',
      title: 'Réseau',
      description: 'Débit agrégé des nœuds en ligne',
      icon: 'fa-network-wired',
      category: 'metrics',
      size: 'sm',
      launchApp: 'monitor',
      defaultInLayout: false,
      render(ctx) {
        const rx = ctx.cluster.netRxMbps ?? 0;
        const tx = ctx.cluster.netTxMbps ?? 0;
        const fmt = (v) => (v < 0.1 ? '< 0.1' : v.toFixed(1));
        return `
          <div class="dw-net-row" title="Réception (somme des nœuds en ligne)"><i class="fa-solid fa-arrow-down"></i> ${fmt(rx)} Mb/s</div>
          <div class="dw-net-row" title="Émission (somme des nœuds en ligne)"><i class="fa-solid fa-arrow-up"></i> ${fmt(tx)} Mb/s</div>`;
      },
    },
    {
      id: 'notes',
      title: 'Notes',
      description: 'Bloc-notes personnel sur le bureau',
      icon: 'fa-note-sticky',
      category: 'tools',
      size: 'lg',
      defaultInLayout: false,
      noLaunch: true,
      render(ctx, esc) {
        const preview = esc(ctx.widgetNotes || '');
        const hasText = !!(ctx.widgetNotes || '').trim();
        return `
          <div class="dw-notes-preview">${hasText ? preview.replace(/\n/g, '<br>') : '<span class="dw-empty">Aucune note</span>'}</div>
          <button type="button" class="dw-notes-open-btn" data-open-desktop-notes>
            <i class="fa-solid fa-pen-to-square"></i> Modifier les notes
          </button>`;
      },
    },
    {
      id: 'health-score',
      title: 'Santé cluster',
      description: 'Score de santé global',
      icon: 'fa-heart-pulse',
      category: 'overview',
      size: 'sm',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx) {
        const score = ctx.cluster.healthScore ?? 100;
        const cls = score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'bad';
        return `
          <div class="dw-health-score dw-health-${cls}">
            <span class="dw-health-value">${score}</span>
            <span class="dw-health-label">/ 100</span>
          </div>
          <div class="dw-hint">${score >= 80 ? 'Cluster en bonne santé' : 'Points d\'attention'}</div>`;
      },
    },
    {
      id: 'vm-types',
      title: 'Types d\'instances',
      description: 'Répartition VM et LXC',
      icon: 'fa-diagram-project',
      category: 'instances',
      size: 'sm',
      launchApp: 'dashboard',
      defaultInLayout: false,
      render(ctx) {
        const t = ctx.vmTypes || {};
        return `
          ${statRow(`<strong>${t.vm ?? 0}</strong> VMs`, '')}
          ${statRow(`<strong>${t.lxc ?? 0}</strong> LXC`, '')}
          ${statRow(`<strong>${t.templates ?? 0}</strong> modèles`, '')}`;
      },
    },
    {
      id: 'running-list',
      title: 'En cours d\'exécution',
      description: 'Instances actives',
      icon: 'fa-play-circle',
      category: 'instances',
      size: 'lg',
      launchApp: 'dashboard',
      defaultInLayout: false,
      render(ctx, esc) {
        const list = (ctx.runningVms || []).slice(0, 5);
        if (!list.length) return '<div class="dw-empty">Aucune instance active</div>';
        return `<ul class="dw-vm-list">${list.map((vm) => `
          <li class="dw-vm-item" data-open-console="${vm.id}" data-vm-type="${esc(vm.type)}" data-vm-node="${esc(vm.node)}" data-vm-name="${esc(vm.name)}">
            <i class="fa-solid ${vm.type === 'lxc' ? 'fa-box' : 'fa-desktop'} dw-vm-icon"></i>
            <span class="dw-vm-name">${esc(vm.name)}</span>
          </li>`).join('')}</ul>`;
      },
    },
    {
      id: 'stopped-list',
      title: 'Arrêtées',
      description: 'Instances stoppées',
      icon: 'fa-stop-circle',
      category: 'instances',
      size: 'md',
      launchApp: 'dashboard',
      defaultInLayout: false,
      render(ctx, esc) {
        const list = (ctx.stoppedVms || []).slice(0, 5);
        if (!list.length) return '<div class="dw-empty">Toutes actives</div>';
        return `<ul class="dw-vm-list">${list.map((vm) => `
          <li class="dw-vm-item dw-vm-stopped">
            <i class="fa-solid fa-circle-stop dw-vm-icon"></i>
            <span class="dw-vm-name">${esc(vm.name)}</span>
            <span class="dw-muted">${esc(vm.node)}</span>
          </li>`).join('')}</ul>`;
      },
    },
    {
      id: 'top-ram',
      title: 'Top RAM',
      description: 'Instances les plus gourmandes en mémoire',
      icon: 'fa-memory',
      category: 'metrics',
      size: 'lg',
      launchApp: 'monitor',
      defaultInLayout: false,
      render(ctx, esc) {
        const vms = (ctx.topRamVms || []).slice(0, 4);
        if (!vms.length) return '<div class="dw-empty">—</div>';
        return `<ul class="dw-vm-list">${vms.map((vm) => `
          <li class="dw-vm-item">
            <span class="dw-vm-name">${esc(vm.name)}</span>
            <span class="dw-vm-cpu">${(vm.ram || 0).toFixed(0)}%</span>
          </li>`).join('')}</ul>`;
      },
    },
    {
      id: 'node-ram',
      title: 'RAM par nœud',
      description: 'Utilisation mémoire par hôte',
      icon: 'fa-server',
      category: 'metrics',
      size: 'lg',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx, esc) {
        const nodes = (ctx.nodeRamList || []).slice(0, 5);
        if (!nodes.length) return '<div class="dw-empty">—</div>';
        return nodes.map((n) => gaugeBar(esc(n.name), n.pct, 'ram', `${n.used.toFixed(1)} / ${n.total.toFixed(1)} Go`)).join('');
      },
    },
    {
      id: 'recent-tasks',
      title: 'Tâches récentes',
      description: 'Dernières opérations Proxmox',
      icon: 'fa-clock-rotate-left',
      category: 'overview',
      size: 'lg',
      launchApp: 'tasks',
      defaultInLayout: false,
      render(ctx, esc) {
        const tasks = (ctx.recentTasks || []).slice(0, 4);
        if (!tasks.length) return '<div class="dw-empty">Aucune tâche</div>';
        return `<ul class="dw-task-list">${tasks.map((t) => `
          <li class="dw-task-item dw-task-${esc(t.status)}">
            <i class="fa-solid ${t.status === 'running' ? 'fa-spinner' : t.status === 'error' ? 'fa-xmark' : 'fa-check'}"></i>
            <span>${esc(t.label)}</span>
          </li>`).join('')}</ul>`;
      },
    },
    {
      id: 'backups',
      title: 'Sauvegardes',
      description: 'Nombre de sauvegardes connues',
      icon: 'fa-floppy-disk',
      category: 'storage',
      size: 'sm',
      launchApp: 'storage',
      defaultInLayout: false,
      render(ctx) {
        return `
          ${statRow(`<strong>${ctx.backups?.total ?? 0}</strong> sauvegardes`, '')}
          <div class="dw-hint">${ctx.backups?.vmsWithBackup ?? 0} VM(s) sauvegardée(s)</div>`;
      },
    },
    {
      id: 'autostart',
      title: 'Démarrage auto',
      description: 'Instances en autostart',
      icon: 'fa-power-off',
      category: 'instances',
      size: 'sm',
      launchApp: 'dashboard',
      defaultInLayout: false,
      render(ctx) {
        return statRow(`<strong>${ctx.autostartCount ?? 0}</strong> configurées`, '', '');
      },
    },
    {
      id: 'templates',
      title: 'Modèles',
      description: 'Templates VM disponibles',
      icon: 'fa-clone',
      category: 'instances',
      size: 'sm',
      launchApp: 'vms',
      defaultInLayout: false,
      render(ctx) {
        return statRow(`<strong>${ctx.templateCount ?? 0}</strong> modèle(s)`, '', '');
      },
    },
    {
      id: 'cluster-map',
      title: 'Carte nœuds',
      description: 'Vue visuelle du cluster',
      icon: 'fa-circle-nodes',
      category: 'overview',
      size: 'wide',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx, esc) {
        const nodes = ctx.nodes || [];
        if (!nodes.length) return '<div class="dw-empty">—</div>';
        return `<div class="dw-node-map">${nodes.map((n) => `
          <div class="dw-node-chip ${n.status === 'online' ? 'online' : 'offline'}" title="${esc(n.name)}">
            <span class="desktop-widget-dot ${n.status === 'online' ? 'ok' : 'warn'}"></span>
            ${esc(n.name)}
          </div>`).join('')}</div>`;
      },
    },
    {
      id: 'cpu-bars',
      title: 'CPU par nœud',
      description: 'Barres CPU par hôte',
      icon: 'fa-chart-bar',
      category: 'metrics',
      size: 'lg',
      launchApp: 'monitor',
      defaultInLayout: false,
      render(ctx, esc) {
        const nodes = (ctx.nodes || []).filter((n) => n.status === 'online').slice(0, 4);
        if (!nodes.length) return '<div class="dw-empty">—</div>';
        return nodes.map((n) => gaugeBar(esc(n.name), n.cpu, 'cpu')).join('');
      },
    },
    {
      id: 'uptime',
      title: 'Disponibilité',
      description: 'Uptime des nœuds',
      icon: 'fa-hourglass-half',
      category: 'metrics',
      size: 'md',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx, esc) {
        const nodes = (ctx.nodeUptimes || []).slice(0, 4);
        if (!nodes.length) return '<div class="dw-empty">—</div>';
        return `<ul class="dw-mini-list">${nodes.map((n) => `
          <li><span>${esc(n.name)}</span> <strong>${esc(n.uptime)}</strong></li>`).join('')}</ul>`;
      },
    },
    {
      id: 'search-vm',
      title: 'Recherche VM',
      description: 'Filtrer et ouvrir une console',
      icon: 'fa-magnifying-glass',
      category: 'tools',
      size: 'md',
      noLaunch: true,
      defaultInLayout: false,
      render(ctx, esc) {
        const vms = (ctx.allVmsShort || []).slice(0, 12);
        const items = vms.length
          ? vms.map((vm) => `
              <li class="dw-vm-item" data-open-console="${vm.id}" data-vm-type="${esc(vm.type)}" data-vm-node="${esc(vm.node)}" data-vm-name="${esc(vm.name)}">
                <span class="dw-vm-name">${esc(vm.name)}</span>
                <span class="dw-muted">${vm.id}${vm.node ? ` · ${esc(vm.node)}` : ''}</span>
              </li>`).join('')
          : '<li class="dw-empty">Chargement des instances…</li>';
        return `
          <input type="search" class="dw-search-input" data-widget-vm-search placeholder="Nom, ID ou nœud…" autocomplete="off">
          <ul class="dw-vm-list dw-vm-search-results" data-widget-vm-search-results>${items}</ul>`;
      },
    },
    {
      id: 'calendar',
      title: 'Calendrier',
      description: 'Date du jour',
      icon: 'fa-calendar-days',
      category: 'tools',
      size: 'md',
      defaultInLayout: false,
      render(ctx) {
        return `
          <div class="dw-calendar">
            <div class="dw-calendar-day">${ctx.clock.dayNum}</div>
            <div class="dw-calendar-month">${ctx.clock.monthShort}</div>
            <div class="dw-calendar-weekday">${ctx.clock.weekdayShort}</div>
          </div>`;
      },
    },
    {
      id: 'power-summary',
      title: 'État d\'alimentation',
      description: 'Résumé running / stopped',
      icon: 'fa-plug',
      category: 'instances',
      size: 'sm',
      launchApp: 'dashboard',
      defaultInLayout: false,
      render(ctx) {
        const s = ctx.cluster;
        const pct = s.vms > 0 ? Math.round((s.running / s.vms) * 100) : 0;
        return gaugeBar('Instances actives', pct, 'cpu', `${s.running} / ${s.vms}`);
      },
    },
    {
      id: 'io-summary',
      title: 'E/S disque',
      description: 'Activité disque estimée',
      icon: 'fa-hard-drive',
      category: 'storage',
      size: 'sm',
      launchApp: 'storage',
      defaultInLayout: false,
      render(ctx) {
        return `
          <div class="dw-stat-row"><span>Lecture</span><strong>${(ctx.cluster.diskReadMbps ?? 0).toFixed(1)} MB/s</strong></div>
          <div class="dw-stat-row"><span>Écriture</span><strong>${(ctx.cluster.diskWriteMbps ?? 0).toFixed(1)} MB/s</strong></div>`;
      },
    },
    {
      id: 'swap',
      title: 'Swap',
      description: 'Utilisation swap cluster',
      icon: 'fa-exchange-alt',
      category: 'metrics',
      size: 'sm',
      launchApp: 'monitor',
      defaultInLayout: false,
      render(ctx) {
        return gaugeBar('Swap utilisé', ctx.cluster.swapPct ?? 0, 'ram');
      },
    },
    {
      id: 'hypervisor',
      title: 'Hyperviseur',
      description: 'Version Proxmox',
      icon: 'fa-code-branch',
      category: 'overview',
      size: 'sm',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx, esc) {
        return `<div class="dw-stat-row"><span>${esc(ctx.hypervisor?.version || 'Proxmox VE')}</span></div>
          <div class="dw-hint">${esc(ctx.hypervisor?.nodesLabel || '')}</div>`;
      },
    },
    {
      id: 'ips',
      title: 'Adresses IP',
      description: 'IPs des instances actives',
      icon: 'fa-network-wired',
      category: 'instances',
      size: 'lg',
      launchApp: 'dashboard',
      defaultInLayout: false,
      render(ctx, esc) {
        const list = (ctx.vmIps || []).slice(0, 5);
        if (!list.length) return '<div class="dw-empty">Aucune IP</div>';
        return `<ul class="dw-mini-list">${list.map((v) => `
          <li><span>${esc(v.name)}</span> <code class="dw-code">${esc(v.ip)}</code></li>`).join('')}</ul>`;
      },
    },
    {
      id: 'favorites',
      title: 'Favoris',
      description: 'Instances épinglées (top CPU)',
      icon: 'fa-star',
      category: 'tools',
      size: 'md',
      defaultInLayout: false,
      render(ctx, esc) {
        const favs = (ctx.topVms || []).slice(0, 3);
        if (!favs.length) return '<div class="dw-empty">—</div>';
        return `<div class="dw-favorites">${favs.map((vm) => `
          <button type="button" class="dw-fav-btn" data-open-console="${vm.id}" data-vm-type="${esc(vm.type)}" data-vm-node="${esc(vm.node)}" data-vm-name="${esc(vm.name)}">
            <i class="fa-solid fa-star"></i> ${esc(vm.name)}
          </button>`).join('')}</div>`;
      },
    },
    {
      id: 'quote',
      title: 'Citation',
      description: 'Conseil admin du jour',
      icon: 'fa-quote-left',
      category: 'tools',
      size: 'md',
      noLaunch: true,
      defaultInLayout: false,
      render(ctx, esc) {
        return `<blockquote class="dw-quote">${esc(ctx.quote || '')}</blockquote>`;
      },
    },
    {
      id: 'maintenance',
      title: 'Maintenance',
      description: 'Nœuds en maintenance',
      icon: 'fa-screwdriver-wrench',
      category: 'overview',
      size: 'sm',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx) {
        const n = ctx.maintenanceCount ?? 0;
        return n > 0
          ? `<div class="dw-hint warn"><strong>${n}</strong> nœud(s) à surveiller</div>`
          : '<div class="dw-alert-ok"><i class="fa-solid fa-check"></i> Aucune maintenance</div>';
      },
    },
    {
      id: 'density',
      title: 'Densité VM',
      description: 'VM moyennes par nœud',
      icon: 'fa-layer-group',
      category: 'metrics',
      size: 'sm',
      launchApp: 'nodes',
      defaultInLayout: false,
      render(ctx) {
        const d = ctx.cluster.density ?? 0;
        return statRow(`<strong>${d.toFixed(1)}</strong> VM/nœud`, `sur ${ctx.cluster.online} en ligne`);
      },
    },
  ];

  function getWidget(id) {
    return WIDGETS.find((w) => w.id === id) || null;
  }

  function defaultLayout() {
    return WIDGETS.filter((w) => w.defaultInLayout).map((w) => ({
      widgetId: w.id,
      key: w.id,
    }));
  }

  function renderWidget(widgetId, ctx, esc) {
    const def = getWidget(widgetId);
    if (!def) return '<div class="dw-empty">Widget inconnu</div>';
    return def.render(ctx, esc);
  }

  function widgetsByCategory() {
    const map = {};
    for (const w of WIDGETS) {
      if (!map[w.category]) map[w.category] = [];
      map[w.category].push(w);
    }
    return map;
  }

  global.ProxPanelWidgetRegistry = {
    WIDGETS,
    CATEGORIES,
    getWidget,
    defaultLayout,
    renderWidget,
    widgetsByCategory,
  };
})(typeof window !== 'undefined' ? window : globalThis);
