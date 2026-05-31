/**
 * Panneau de configuration style Synology - grille d'accueil puis navigation latérale + contenu.
 */
(function (global) {
  const Registry = global.ProxPanelControlPanelRegistry;
  if (!Registry) return;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatBytes(n) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return '—';
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let v = num;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function asRows(data) {
    if (data == null) return [];
    if (Array.isArray(data)) {
      return data.map((row, idx) => {
        if (row && typeof row === 'object') {
          const cols = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(' · ');
          return { _index: String(idx), ...row, _preview: cols };
        }
        return { valeur: String(row) };
      });
    }
    if (typeof data === 'object') {
      return Object.entries(data).map(([key, value]) => ({
        clé: key,
        valeur: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
      }));
    }
    return [{ valeur: String(data) }];
  }

  function pickColumns(rows) {
    if (!rows.length) return [];
    const keys = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    const preferred = [
      'userid', 'user', 'groupid', 'roleid', 'poolid', 'id', 'storage', 'type', 'node',
      'content', 'path', 'status', 'enabled', 'digest', 'volid', 'comment', 'realm',
      'sid', 'ugid', 'propagate', 'iface', 'active', 'address', 'gateway', 'bridge',
      'cidr', 'method', 'priority', 'state', 'name', 'size', 'used', 'avail', 'total',
    ];
    const ordered = preferred.filter((k) => keys.has(k));
    const rest = [...keys].filter((k) => !ordered.includes(k) && k !== '_preview' && k !== '_index').slice(0, 6);
    const cols = [...ordered, ...rest].slice(0, 8);
    return cols.length ? cols : Object.keys(rows[0]).slice(0, 6);
  }

  function renderTable(rows, title) {
    if (!rows.length) {
      return `<p class="cp-empty">${esc(title || 'Aucune donnée')}</p>`;
    }
    const cols = pickColumns(rows);
    const head = cols.map((c) => `<th>${esc(c)}</th>`).join('');
    const body = rows
      .map((row) => `<tr>${cols.map((c) => `<td>${esc(row[c] ?? '')}</td>`).join('')}</tr>`)
      .join('');
    return `<div class="cp-table-wrap"><table class="cp-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function renderApiBlock(label, payload) {
    if (!payload) return '';
    if (payload.ok === false) {
      return `<div class="cp-alert cp-alert-warn"><strong>${esc(label)}</strong> - ${esc(payload.error || 'Indisponible')}</div>`;
    }
    const data = payload.data !== undefined ? payload.data : payload;
    const rows = asRows(data);
    if (!rows.length && data && typeof data === 'object' && !Array.isArray(data)) {
      return `<h4 class="cp-subhead">${esc(label)}</h4>${renderTable(asRows(data), '')}`;
    }
    return `<h4 class="cp-subhead">${esc(label)}</h4>${renderTable(rows, 'Aucune entrée')}`;
  }

  function renderSectionContent(sectionId, data, ctx) {
    const section = Registry.getSection(sectionId);
    if (!section) return '<p class="cp-empty">Section inconnue.</p>';

    if (section.scope === 'local') {
      return renderLocalSection(sectionId, ctx);
    }

    if (data?.error) {
      return `<div class="cp-alert cp-alert-error">${esc(data.error)}</div>`;
    }

    switch (sectionId) {
      case 'summary': {
        const statusRows = data.status?.ok ? asRows(data.status.data) : [];
        const resRows = data.resources?.ok ? asRows(data.resources.data) : [];
        const ver = data.version?.ok ? data.version.data : null;
        let html = '';
        if (ver) {
          html += `<div class="cp-kv"><span>Version Proxmox</span><strong>${esc(ver.version || ver.release || JSON.stringify(ver))}</strong></div>`;
        }
        html += renderApiBlock('État cluster', data.status);
        html += renderApiBlock('Ressources', { ok: true, data: resRows });
        return html;
      }
      case 'ha-resources':
        return (
          renderApiBlock('Ressources HA', data.resources)
          + renderApiBlock('Groupes HA', data.groups)
          + renderApiBlock('Statut HA', data.status)
        );
      case 'firewall-cluster':
        return (
          renderApiBlock('Options', data.options)
          + renderApiBlock('Règles', data.rules)
          + renderApiBlock('Groupes', data.groups)
          + renderApiBlock('Alias', data.aliases)
        );
      case 'node-firewall':
        return renderApiBlock('Options', data.options) + renderApiBlock('Règles', data.rules);
      case 'node-disks':
        return (
          renderApiBlock('Disques', data.disks)
          + renderApiBlock('LVM', data.lvm)
          + renderApiBlock('ZFS', data.zfs)
        );
      case 'node-summary': {
        let html = `<p class="cp-hint">Nœud : <strong>${esc(ctx.node)}</strong></p>`;
        html += renderApiBlock('Statut', data.status);
        html += renderApiBlock('Version', data.version);
        html += renderApiBlock('Abonnement', data.subscription);
        return html;
      }
      case 'node-dns':
      case 'node-hosts':
      case 'node-time':
      case 'node-options': {
        const rows = data.ok === false ? [] : asRows(data.data ?? data);
        return renderTable(rows, 'Aucune donnée');
      }
      case 'tokens': {
        const users = data.ok ? asRows(data.data) : [];
        return `<p class="cp-hint">Les jetons API sont gérés par utilisateur dans l'interface Proxmox native (Permissions → API Tokens).</p>${renderTable(users, 'Utilisateurs')}`;
      }
      default: {
        if (data.ok === false) {
          return `<div class="cp-alert cp-alert-warn">${esc(data.error || 'Accès refusé ou section non disponible')}</div>`;
        }
        const raw = data.data !== undefined ? data.data : data;
        const rows = asRows(raw);
        if (sectionId === 'storage' || sectionId === 'node-storage') {
          rows.forEach((r) => {
            if (r.total) r.total = formatBytes(r.total);
            if (r.used) r.used = formatBytes(r.used);
            if (r.avail) r.avail = formatBytes(r.avail);
          });
        }
        return renderTable(rows, 'Aucune entrée pour cette section');
      }
    }
  }

  function renderLocalSection(sectionId) {
    switch (sectionId) {
      case 'ref-ceph':
      case 'ref-sdn':
      case 'ref-metrics':
      case 'ref-notes':
        return `
          <p class="cp-hint">Cette fonctionnalité se configure dans l'interface web Proxmox VE d'origine.</p>
          <p class="cp-hint"><strong>Chemin :</strong> ${esc(Registry.getSection(sectionId)?.proxmoxPath || '')}</p>
          <ul class="cp-ref-list">${Registry.PROXMOX_REF_ITEMS.map((i) => `<li><strong>${esc(i.title)}</strong> - ${esc(i.path)}</li>`).join('')}</ul>`;
      case 'pp-desktop':
        return `
          <div class="cp-actions">
            <button type="button" class="cp-action-btn" data-cp-action="widgets"><i class="fa-solid fa-puzzle-piece"></i> Personnaliser les widgets</button>
            <button type="button" class="cp-action-btn" data-cp-action="wallpaper"><i class="fa-solid fa-image"></i> Fond d'écran (menu bureau)</button>
          </div>`;
      case 'pp-account':
        return `
          <div class="cp-actions">
            <button type="button" class="cp-action-btn" data-cp-action="user-menu"><i class="fa-solid fa-user"></i> Menu compte</button>
            <button type="button" class="cp-action-btn cp-action-danger" data-cp-action="logout"><i class="fa-solid fa-sign-out-alt"></i> Déconnexion</button>
          </div>`;
      case 'pp-tools':
        return `
          <div class="cp-actions">
            <button type="button" class="cp-action-btn" data-cp-action="vmid"><i class="fa-solid fa-hashtag"></i> Changer VMID</button>
            <button type="button" class="cp-action-btn" data-cp-action="tasks"><i class="fa-solid fa-list-check"></i> Gestionnaire de tâches</button>
            <button type="button" class="cp-action-btn" data-cp-action="monitor"><i class="fa-solid fa-chart-line"></i> Moniteur</button>
          </div>`;
      default:
        return '<p class="cp-empty">Section locale.</p>';
    }
  }

  const stateByRoot = new WeakMap();

  function getState(root) {
    if (!stateByRoot.has(root)) {
      stateByRoot.set(root, {
        view: 'home',
        categoryId: null,
        sectionId: null,
        node: '',
        nodes: [],
        loading: false,
      });
    }
    return stateByRoot.get(root);
  }

  async function fetchNodes() {
    try {
      const r = await fetch('/api/data?action=nodes');
      const j = await r.json();
      const list = Array.isArray(j.nodes) ? j.nodes : [];
      return list.map((n) => (typeof n === 'string' ? n : n.node || n.id || n.name)).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function fetchSectionApi(section, node) {
    const params = new URLSearchParams({ action: 'cluster-config', section });
    if (node) params.set('node', node);
    const r = await fetch(`/api/data?${params}`);
    return r.json();
  }

  function bindLocalActions(root) {
    root.querySelectorAll('[data-cp-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.cpAction;
        if (action === 'widgets' && global.ProxPanelDesktop) {
          ProxPanelDesktop.setWidgetEditMode(true);
        } else if (action === 'user-menu' && typeof global.showUserMenu === 'function') {
          showUserMenu();
        } else if (action === 'logout' && typeof global.logout === 'function') {
          logout();
        } else if (action === 'vmid' && typeof global.openToolsMenu === 'function') {
          openToolsMenu('vmid');
        } else if (action === 'tasks' && global.ProxPanelDesktop) {
          ProxPanelDesktop.launchApp('tasks');
        } else if (action === 'monitor' && global.ProxPanelDesktop) {
          ProxPanelDesktop.launchApp('monitor');
        }
      });
    });
  }

  function renderHome(root) {
    const st = getState(root);
    st.view = 'home';
    const tiles = Registry.CATEGORIES.map((cat) => {
      const count = Registry.sectionsForCategory(cat.id).length;
      return `
        <button type="button" class="cp-home-tile" data-cp-category="${esc(cat.id)}">
          <span class="cp-home-tile-icon" style="background:${esc(cat.color)}20;color:${esc(cat.color)}">
            <i class="fa-solid ${esc(cat.icon)}"></i>
          </span>
          <span class="cp-home-tile-text">
            <strong>${esc(cat.title)}</strong>
            <small>${esc(cat.description)}</small>
            <em>${count} section${count > 1 ? 's' : ''}</em>
          </span>
        </button>`;
    }).join('');

    root.innerHTML = `
      <div class="cp-root cp-view-home">
        <header class="cp-header">
          <h2><i class="fa-solid fa-gear"></i> Panneau de configuration</h2>
          <p>Paramétrage du cluster Proxmox VE et de ProxPanel - comme le centre de contrôle Synology.</p>
        </header>
        <div class="cp-home-grid">${tiles}</div>
      </div>`;

    root.querySelectorAll('[data-cp-category]').forEach((btn) => {
      btn.addEventListener('click', () => openCategory(root, btn.dataset.cpCategory));
    });
  }

  async function openCategory(root, categoryId) {
    const st = getState(root);
    st.view = 'category';
    st.categoryId = categoryId;
    const cat = Registry.getCategory(categoryId);
    const sections = Registry.sectionsForCategory(categoryId);
    if (categoryId === 'nodes' && !st.nodes.length) {
      st.nodes = await fetchNodes();
      if (!st.node && st.nodes.length) st.node = st.nodes[0];
    }
    if (!st.sectionId || !sections.find((s) => s.id === st.sectionId)) {
      st.sectionId = sections[0]?.id || null;
    }
    renderCategoryLayout(root, cat, sections);
    if (st.sectionId) await loadSection(root, st.sectionId);
  }

  function renderCategoryLayout(root, cat, sections) {
    const st = getState(root);
    const nav = sections
      .map((s) => {
        const active = s.id === st.sectionId ? ' cp-nav-active' : '';
        return `<button type="button" class="cp-nav-item${active}" data-cp-section="${esc(s.id)}">${esc(s.title)}</button>`;
      })
      .join('');

    let nodeBar = '';
    if (cat.id === 'nodes') {
      const opts = (st.nodes.length ? st.nodes : ['—']).map((n) => `<option value="${esc(n)}"${n === st.node ? ' selected' : ''}>${esc(n)}</option>`).join('');
      nodeBar = `
        <div class="cp-node-bar">
          <label>Nœud</label>
          <select class="cp-node-select" data-cp-node-select>${opts}</select>
        </div>`;
    }

    root.innerHTML = `
      <div class="cp-root cp-view-category">
        <aside class="cp-sidebar">
          <button type="button" class="cp-back" data-cp-back><i class="fa-solid fa-arrow-left"></i> Accueil</button>
          <h3 class="cp-sidebar-title"><i class="fa-solid ${esc(cat.icon)}"></i> ${esc(cat.title)}</h3>
          ${nodeBar}
          <nav class="cp-nav">${nav}</nav>
        </aside>
        <main class="cp-main">
          <header class="cp-main-head">
            <h3 data-cp-section-title>—</h3>
            <p class="cp-proxmox-path" data-cp-proxmox-path></p>
          </header>
          <div class="cp-main-body" data-cp-body><p class="cp-loading">Chargement…</p></div>
        </main>
      </div>`;

    root.querySelector('[data-cp-back]')?.addEventListener('click', () => renderHome(root));
    root.querySelectorAll('[data-cp-section]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        st.sectionId = btn.dataset.cpSection;
        root.querySelectorAll('.cp-nav-item').forEach((el) => {
          el.classList.toggle('cp-nav-active', el.dataset.cpSection === st.sectionId);
        });
        await loadSection(root, st.sectionId);
      });
    });
    root.querySelector('[data-cp-node-select]')?.addEventListener('change', async (e) => {
      st.node = e.target.value;
      global.ProxPanelControlPanelEditor?.invalidateLookupsCache?.();
      if (st.sectionId) await loadSection(root, st.sectionId);
    });
  }

  async function loadSection(root, sectionId) {
    const st = getState(root);
    const section = Registry.getSection(sectionId);
    const body = root.querySelector('[data-cp-body]');
    const titleEl = root.querySelector('[data-cp-section-title]');
    const pathEl = root.querySelector('[data-cp-proxmox-path]');
    if (!section || !body) return;

    titleEl.textContent = section.title;
    pathEl.textContent = section.proxmoxPath ? `Proxmox : ${section.proxmoxPath}` : '';
    if (section.subtitle) pathEl.textContent += (pathEl.textContent ? ' - ' : '') + section.subtitle;

    if (section.scope === 'local') {
      body.innerHTML = renderLocalSection(sectionId);
      bindLocalActions(root);
      return;
    }

    if (section.scope === 'node' && !st.node) {
      body.innerHTML = '<div class="cp-alert cp-alert-warn">Sélectionnez un nœud.</div>';
      return;
    }

    body.innerHTML = '<p class="cp-loading"><i class="fa-solid fa-spinner fa-spin"></i> Chargement depuis Proxmox…</p>';
    st.loading = true;
    try {
      const data = await fetchSectionApi(section.apiSection, section.scope === 'node' ? st.node : '');
      const reload = () => loadSection(root, sectionId);
      const Editor = global.ProxPanelControlPanelEditor;
      const canEdit = Editor?.isEditable(section.apiSection);
      if (canEdit && Editor.renderEditable(body, {
        sectionId,
        apiSection: section.apiSection,
        data,
        node: st.node,
        onReload: reload,
      })) {
        bindLocalActions(root);
        return;
      }
      body.innerHTML = `
        ${section.readOnly ? '<div class="cp-alert cp-alert-info">Lecture seule - la modification s\'effectue dans l\'UI Proxmox ou via l\'API avec les permissions adéquates.</div>' : ''}
        ${renderSectionContent(sectionId, data, { node: st.node })}`;
      bindLocalActions(root);
    } catch (err) {
      body.innerHTML = `<div class="cp-alert cp-alert-error">${esc(err.message || 'Erreur réseau')}</div>`;
    } finally {
      st.loading = false;
    }
  }

  function init(container) {
    if (!container) return;
    container.classList.add('control-panel-host');
    const root = document.createElement('div');
    root.className = 'control-panel-inner';
    container.innerHTML = '';
    container.appendChild(root);
    renderHome(root);
  }

  global.ProxPanelControlPanel = { init };
})(typeof window !== 'undefined' ? window : globalThis);
