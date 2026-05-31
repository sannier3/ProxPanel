/**
 * Shell bureau web ProxPanel - lanceur, icônes, widgets, fenêtres apps.
 */
(function (global) {
  const Registry = global.ProxPanelAppRegistry || { APPS: [], CATEGORIES: {}, getApp: () => null, pinnedApps: () => [], appsByCategory: () => ({}) };
  const WidgetReg = global.ProxPanelWidgetRegistry || { WIDGETS: [], defaultLayout: () => [], getWidget: () => null, renderWidget: () => '', widgetsByCategory: () => ({}) };

  let hooks = {
    loadApp: async () => {},
    renderTaskbar: () => {},
    getDesktopContext: () => ({}),
    getWidgetLayout: () => null,
    saveWidgetLayout: () => {},
    getWallpaper: () => 'default',
    saveWallpaper: () => {},
    getWidgetNotes: () => '',
    saveWidgetNotes: () => {},
    openDesktopNotesEditor: () => {},
    openConsole: () => {},
    getWindows: () => [],
    createAppWindow: () => {},
    focusAppWindow: () => {},
    openTools: () => {},
    showUserMenu: () => {},
    switchNode: () => {},
    getCurrentUser: () => null,
    logout: () => {},
  };

  let launcherOpen = false;
  let widgetEditMode = false;
  let widgetLayout = [];
  let widgetPickerOpen = false;
  let dragPayload = null; // { type: 'move'|'new', key?, widgetId? }
  const vmSearchQueries = new Map();

  const DND_TYPE_MOVE = 'application/x-proxpanel-widget-move';
  const DND_TYPE_NEW = 'application/x-proxpanel-widget-new';

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function configure(nextHooks) {
    hooks = { ...hooks, ...nextHooks };
  }

  function appWinKey(appId) {
    return `app-${appId}`;
  }

  function loadWidgetLayoutFromHooks() {
    const saved = hooks.getWidgetLayout?.();
    if (Array.isArray(saved) && saved.length) {
      widgetLayout = saved.map((item) => ({
        widgetId: item.widgetId || item.id,
        key: item.key || item.widgetId || item.id,
      })).filter((item) => WidgetReg.getWidget(item.widgetId));
      return;
    }
    widgetLayout = WidgetReg.defaultLayout().map((item) => ({ ...item }));
  }

  function persistWidgetLayout() {
    hooks.saveWidgetLayout?.(widgetLayout.map((w) => ({ widgetId: w.widgetId, key: w.key })));
  }

  function applyWallpaper(id) {
    const wp = document.querySelector('.desktop-wallpaper');
    if (wp) {
      wp.dataset.wallpaper = id || 'default';
    }
  }

  function renderDesktopIcons() {
    const el = document.getElementById('desktop-icons');
    if (!el) return;
    const pinned = Registry.pinnedApps();
    el.innerHTML = pinned.map((app) => `
      <button type="button" class="desktop-icon" data-launch-app="${esc(app.id)}" title="${esc(app.title)}">
        <span class="desktop-icon-img"><i class="fa-solid ${esc(app.icon)}"></i></span>
        <span class="desktop-icon-label">${esc(app.title)}</span>
      </button>
    `).join('');
  }

  function launcherAccountHtml() {
    const user = hooks.getCurrentUser?.();
    const name = user?.name || user?.username || 'Invité';
    const role = user?.role || '';
    const avatar = user?.avatar || (name.charAt(0).toUpperCase() || '?');
    return `
        <div class="launcher-foot">
          <div class="launcher-account">
            <span class="launcher-account-avatar" aria-hidden="true">${esc(avatar)}</span>
            <div class="launcher-account-text">
              <span class="launcher-account-name">${esc(name)}</span>
              ${role ? `<span class="launcher-account-role">${esc(role)}</span>` : ''}
            </div>
          </div>
          <button type="button" class="launcher-logout" data-launcher-logout title="Se déconnecter">
            <i class="fa-solid fa-sign-out-alt"></i> Déconnexion
          </button>
        </div>`;
  }

  function renderLauncher() {
    const el = document.getElementById('launcher');
    if (!el) return;
    const byCat = Registry.appsByCategory();
    const cats = Registry.CATEGORIES || {};
    const sections = Object.keys(byCat).map((catId) => {
      const cat = cats[catId] || { label: catId, icon: 'fa-folder' };
      const tiles = byCat[catId].map((app) => `
        <button type="button" class="launcher-tile" data-launch-app="${esc(app.id)}">
          <span class="launcher-tile-icon"><i class="fa-solid ${esc(app.icon)}"></i></span>
          <span class="launcher-tile-label">${esc(app.title)}</span>
        </button>
      `).join('');
      return `
        <div class="launcher-section">
          <h4 class="launcher-section-title"><i class="fa-solid ${esc(cat.icon)}"></i> ${esc(cat.label)}</h4>
          <div class="launcher-grid">${tiles}</div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="launcher-backdrop" data-close-launcher></div>
      <div class="launcher-panel" role="dialog" aria-label="Applications">
        <div class="launcher-head">
          <div class="launcher-search-wrap">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="search" id="launcher-search" class="launcher-search" placeholder="Rechercher une application…" autocomplete="off">
          </div>
          <button type="button" class="launcher-close" data-close-launcher title="Fermer"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="launcher-body" id="launcher-body">${sections}</div>
        ${launcherAccountHtml()}
      </div>`;
  }

  function updateLauncherAccount() {
    const panel = document.querySelector('.launcher-panel');
    if (!panel) return;
    const existing = panel.querySelector('.launcher-foot');
    const html = launcherAccountHtml();
    if (existing) {
      existing.outerHTML = html;
    } else {
      panel.insertAdjacentHTML('beforeend', html);
    }
  }

  function captureWidgetFocusState() {
    const active = document.activeElement;
    const root = document.getElementById('desktop-widgets');
    if (!active || !root?.contains(active)) return null;
    const widget = active.closest('.desktop-widget[data-widget-key]');
    if (!widget) return null;
    let field = null;
    if (active.matches('[data-widget-vm-search]')) field = 'search';
    else if (active.matches('[data-widget-notes]')) field = 'notes';
    if (!field) return null;
    return {
      key: widget.dataset.widgetKey,
      field,
      value: active.value,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd,
    };
  }

  function restoreWidgetFocusState(state) {
    if (!state?.key || !state.field) return;
    const widget = document.querySelector(`.desktop-widget[data-widget-key="${state.key}"]`);
    if (!widget) return;
    const input = widget.querySelector(
      state.field === 'search' ? '[data-widget-vm-search]' : '[data-widget-notes]'
    );
    if (!input) return;
    input.value = state.value ?? '';
    if (state.field === 'search') {
      filterWidgetVmSearch(input.value, widget);
    }
    input.focus();
    try {
      if (typeof state.selectionStart === 'number') {
        input.setSelectionRange(state.selectionStart, state.selectionEnd ?? state.selectionStart);
      }
    } catch (_) { /* ignore */ }
  }

  function isWidgetInteractionActive() {
    const active = document.activeElement;
    const root = document.getElementById('desktop-widgets');
    if (!active || !root?.contains(active)) return false;
    return active.matches('input, textarea, select, [contenteditable="true"]');
  }

  function shouldRefreshWidgetCard(card, def) {
    if (!card || !def) return false;
    if (def.noRefresh) return false;
    if (card.contains(document.activeElement)) return false;
    return true;
  }

  function updateWidgetBodies() {
    const ctx = hooks.getDesktopContext?.() || {};
    ctx.widgetNotes = hooks.getWidgetNotes?.() || '';
    document.querySelectorAll('.desktop-widget[data-widget-id]').forEach((card) => {
      const widgetId = card.dataset.widgetId;
      const def = WidgetReg.getWidget(widgetId);
      if (!def || def.noRefresh) return;

      if (widgetId === 'search-vm') {
        if (card.contains(document.activeElement)) return;
        const key = card.dataset.widgetKey;
        const q = vmSearchQueries.get(key) ?? card.querySelector('[data-widget-vm-search]')?.value ?? '';
        if (!card.querySelector('[data-widget-vm-search]')) {
          const body = card.querySelector('.desktop-widget-body');
          if (body) body.innerHTML = WidgetReg.renderWidget('search-vm', ctx, esc);
        }
        filterWidgetVmSearch(q, card, false);
        return;
      }

      if (widgetId === 'notes') {
        const body = card.querySelector('.desktop-widget-body');
        if (body) body.innerHTML = WidgetReg.renderWidget('notes', ctx, esc);
        return;
      }

      if (!shouldRefreshWidgetCard(card, def)) return;
      const body = card.querySelector('.desktop-widget-body');
      if (!body) return;
      body.innerHTML = WidgetReg.renderWidget(widgetId, ctx, esc);
    });
  }

  function buildWidgetHtml(entry) {
    const def = WidgetReg.getWidget(entry.widgetId);
    if (!def) return '';
    const ctx = hooks.getDesktopContext?.() || {};
    ctx.widgetNotes = hooks.getWidgetNotes?.() || '';
    const body = WidgetReg.renderWidget(entry.widgetId, ctx, esc);
    const launchAttr = def.launchApp && !def.noLaunch ? ` data-launch-app="${esc(def.launchApp)}"` : '';
    const sizeClass = def.size ? ` desktop-widget--${def.size}` : '';
    const editControls = widgetEditMode ? `
      <div class="desktop-widget-edit-bar">
        <span class="desktop-widget-drag" title="Glisser pour déplacer"><i class="fa-solid fa-grip-vertical"></i></span>
        <button type="button" class="desktop-widget-remove" data-remove-widget="${esc(entry.key)}" title="Retirer"><i class="fa-solid fa-xmark"></i></button>
      </div>` : '';

    const dragAttr = widgetEditMode ? ' draggable="true"' : '';

    return `
      <div class="desktop-widget${sizeClass}${widgetEditMode ? ' desktop-widget--edit' : ''}"
           data-widget-key="${esc(entry.key)}"
           data-widget-id="${esc(entry.widgetId)}"
           ${dragAttr}
           ${launchAttr}>
        ${editControls}
        <div class="desktop-widget-title"><i class="fa-solid ${esc(def.icon)}"></i> ${esc(def.title)}</div>
        <div class="desktop-widget-body">${body}</div>
      </div>`;
  }

  function renderWidgets() {
    const el = document.getElementById('desktop-widgets');
    if (!el) return;
    if (!widgetLayout.length) {
      el.innerHTML = widgetEditMode
        ? `<button type="button" class="desktop-widget-add-card" data-open-widget-picker><i class="fa-solid fa-plus"></i> Ajouter un widget</button>`
        : '';
      el.classList.toggle('desktop-widgets--empty', !widgetEditMode);
      return;
    }
    const focusState = captureWidgetFocusState();
    el.classList.remove('desktop-widgets--empty');
    let html = widgetLayout.map((entry) => buildWidgetHtml(entry)).join('');
    if (widgetEditMode) {
      html += `<div class="desktop-widgets-drop-slot" data-drop-slot="end"><i class="fa-solid fa-plus"></i> Déposer ici</div>`;
    }
    el.innerHTML = html;
    vmSearchQueries.forEach((query, key) => {
      const widget = el.querySelector(`.desktop-widget[data-widget-key="${key}"]`);
      if (widget) filterWidgetVmSearch(query, widget, false);
    });
    restoreWidgetFocusState(focusState);
  }

  function setWidgetEditMode(on) {
    widgetEditMode = !!on;
    document.body.classList.toggle('desktop-widget-edit', widgetEditMode);
    const bar = document.getElementById('widget-edit-bar');
    const dock = document.getElementById('widget-palette-dock');
    if (bar) {
      if (widgetEditMode) {
        bar.removeAttribute('hidden');
        bar.setAttribute('aria-hidden', 'false');
      } else {
        bar.setAttribute('hidden', '');
        bar.setAttribute('aria-hidden', 'true');
      }
    }
    if (dock) {
      if (widgetEditMode) {
        dock.removeAttribute('hidden');
        renderWidgetPaletteDock();
      } else {
        dock.setAttribute('hidden', '');
      }
    }
    if (!widgetEditMode) toggleWidgetPicker(false);
    renderWidgets();
  }

  function insertWidget(widgetId, beforeKey) {
    const def = WidgetReg.getWidget(widgetId);
    if (!def) return;
    const key = `${widgetId}-${Date.now()}`;
    const entry = { widgetId, key };
    if (beforeKey) {
      const idx = widgetLayout.findIndex((w) => w.key === beforeKey);
      if (idx >= 0) widgetLayout.splice(idx, 0, entry);
      else widgetLayout.push(entry);
    } else {
      widgetLayout.push(entry);
    }
    persistWidgetLayout();
    renderWidgets();
  }

  function addWidget(widgetId) {
    insertWidget(widgetId, null);
  }

  function removeWidget(key) {
    widgetLayout = widgetLayout.filter((w) => w.key !== key);
    persistWidgetLayout();
    renderWidgets();
  }

  function reorderWidget(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const fromIdx = widgetLayout.findIndex((w) => w.key === fromKey);
    const toIdx = widgetLayout.findIndex((w) => w.key === toKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const [item] = widgetLayout.splice(fromIdx, 1);
    widgetLayout.splice(toIdx, 0, item);
    persistWidgetLayout();
    renderWidgets();
  }

  function renderWidgetPaletteDock() {
    const dock = document.getElementById('widget-palette-dock');
    if (!dock) return;
    const byCat = WidgetReg.widgetsByCategory();
    const cats = WidgetReg.CATEGORIES || {};
    const groups = Object.keys(byCat).map((catId) => {
      const cat = cats[catId] || { label: catId };
      const items = byCat[catId].map((w) => `
        <div class="widget-palette-item" draggable="true" data-palette-widget="${esc(w.id)}" title="${esc(w.description)}">
          <span class="widget-palette-item-icon"><i class="fa-solid ${esc(w.icon)}"></i></span>
          <div class="widget-palette-item-text">
            <strong>${esc(w.title)}</strong>
            <span>${esc(w.description)}</span>
          </div>
        </div>`).join('');
      return `<div class="widget-palette-group" data-palette-cat="${esc(catId)}">
        <div class="widget-palette-group-title">${esc(cat.label)}</div>
        ${items}
      </div>`;
    }).join('');

    dock.innerHTML = `
      <div class="widget-palette-dock-head">
        <h3><i class="fa-solid fa-puzzle-piece"></i> Catalogue</h3>
        <p>Glissez sur le bureau</p>
        <input type="search" class="widget-palette-dock-search" id="widget-palette-search" placeholder="Filtrer…" autocomplete="off">
      </div>
      <div class="widget-palette-dock-body" id="widget-palette-dock-body">${groups}</div>`;
  }

  function filterPaletteDock(query) {
    const q = String(query || '').trim().toLowerCase();
    document.querySelectorAll('.widget-palette-item').forEach((item) => {
      const text = item.textContent?.toLowerCase() || '';
      item.style.display = !q || text.includes(q) ? '' : 'none';
    });
    document.querySelectorAll('.widget-palette-group').forEach((grp) => {
      const visible = grp.querySelectorAll('.widget-palette-item:not([style*="display: none"])').length;
      grp.style.display = visible ? '' : 'none';
    });
  }

  function clearDragOverStyles() {
    document.querySelectorAll('.desktop-widget--drag-over, .desktop-widgets-drop-slot--over').forEach((el) => {
      el.classList.remove('desktop-widget--drag-over', 'desktop-widgets-drop-slot--over');
    });
  }

  function handleWidgetDragStart(e) {
    if (!widgetEditMode) return;
    if (e.target.closest('input, textarea, select, button, [data-widget-notes], [data-widget-vm-search]')) {
      e.preventDefault();
      return;
    }
    const paletteItem = e.target.closest('[data-palette-widget]');
    if (paletteItem) {
      dragPayload = { type: 'new', widgetId: paletteItem.dataset.paletteWidget };
      e.dataTransfer.setData(DND_TYPE_NEW, dragPayload.widgetId);
      e.dataTransfer.setData('text/plain', dragPayload.widgetId);
      e.dataTransfer.effectAllowed = 'copy';
      paletteItem.classList.add('dragging');
      return;
    }
    const widget = e.target.closest('.desktop-widget[data-widget-key]');
    if (!widget) return;
    if (e.target.closest('.desktop-widget-remove, .dw-notes-input, textarea, input, button')) {
      e.preventDefault();
      return;
    }
    dragPayload = { type: 'move', key: widget.dataset.widgetKey };
    e.dataTransfer.setData(DND_TYPE_MOVE, dragPayload.key);
    e.dataTransfer.setData('text/plain', dragPayload.key);
    e.dataTransfer.effectAllowed = 'move';
    widget.classList.add('desktop-widget--dragging');
  }

  function handleWidgetDragEnd(e) {
    document.querySelectorAll('.desktop-widget--dragging, .widget-palette-item.dragging').forEach((el) => {
      el.classList.remove('desktop-widget--dragging', 'dragging');
    });
    clearDragOverStyles();
    dragPayload = null;
  }

  function handleWidgetDragOver(e) {
    if (!widgetEditMode || !dragPayload) return;
    const slot = e.target.closest('.desktop-widgets-drop-slot, .desktop-widget[data-widget-key]');
    if (!slot) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragPayload.type === 'new' ? 'copy' : 'move';
    clearDragOverStyles();
    if (slot.classList.contains('desktop-widgets-drop-slot')) {
      slot.classList.add('desktop-widgets-drop-slot--over');
    } else {
      slot.classList.add('desktop-widget--drag-over');
    }
  }

  function handleWidgetDrop(e) {
    if (!widgetEditMode) return;
    e.preventDefault();
    clearDragOverStyles();

    const newId = e.dataTransfer.getData(DND_TYPE_NEW) || e.dataTransfer.getData('text/plain');
    const fromKey = e.dataTransfer.getData(DND_TYPE_MOVE);
    const plain = e.dataTransfer.getData('text/plain');
    const resolvedNew = newId && WidgetReg.getWidget(newId) ? newId : '';
    const resolvedMove = fromKey || (plain && widgetLayout.some((w) => w.key === plain) ? plain : '');
    const targetWidget = e.target.closest('.desktop-widget[data-widget-key]');
    const targetSlot = e.target.closest('.desktop-widgets-drop-slot');

    if (resolvedNew) {
      if (targetWidget) insertWidget(resolvedNew, targetWidget.dataset.widgetKey);
      else insertWidget(resolvedNew, null);
    } else if (resolvedMove) {
      if (targetWidget && targetWidget.dataset.widgetKey !== resolvedMove) {
        reorderWidget(resolvedMove, targetWidget.dataset.widgetKey);
      }
    }
    dragPayload = null;
  }

  function bindWidgetDragDrop() {
    const desktop = document.getElementById('desktop');
    if (!desktop || desktop.dataset.widgetDndBound) return;
    desktop.dataset.widgetDndBound = '1';

    desktop.addEventListener('dragstart', handleWidgetDragStart);
    desktop.addEventListener('dragend', handleWidgetDragEnd);
    desktop.addEventListener('dragover', handleWidgetDragOver);
    desktop.addEventListener('drop', handleWidgetDrop);

    desktop.addEventListener('input', (e) => {
      if (e.target.id === 'widget-palette-search') filterPaletteDock(e.target.value);
    });
  }

  function renderWidgetPicker() {
    const el = document.getElementById('widget-picker');
    if (!el) return;
    const byCat = WidgetReg.widgetsByCategory();
    const cats = WidgetReg.CATEGORIES || {};
    const activeIds = new Set(widgetLayout.map((w) => w.widgetId));

    const sections = Object.keys(byCat).map((catId) => {
      const cat = cats[catId] || { label: catId, icon: 'fa-folder' };
      const cards = byCat[catId].map((w) => {
        const added = activeIds.has(w.id);
        return `
          <div class="widget-picker-card${added ? ' added' : ''}" data-add-widget="${esc(w.id)}">
            <div class="widget-picker-card-icon"><i class="fa-solid ${esc(w.icon)}"></i></div>
            <div class="widget-picker-card-text">
              <strong>${esc(w.title)}</strong>
              <span>${esc(w.description)}</span>
            </div>
            <button type="button" class="widget-picker-add-btn" data-add-widget="${esc(w.id)}" title="${added ? 'Ajouter une autre instance' : 'Ajouter'}">
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>`;
      }).join('');
      return `
        <div class="widget-picker-section">
          <h4><i class="fa-solid ${esc(cat.icon)}"></i> ${esc(cat.label)}</h4>
          <div class="widget-picker-grid">${cards}</div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="widget-picker-backdrop" data-close-widget-picker></div>
      <div class="widget-picker-panel" role="dialog" aria-label="Ajouter un widget">
        <div class="widget-picker-head">
          <h3><i class="fa-solid fa-puzzle-piece"></i> Widgets</h3>
          <button type="button" class="widget-picker-close" data-close-widget-picker><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="widget-picker-body">${sections}</div>
      </div>`;
  }

  function toggleWidgetPicker(force) {
    widgetPickerOpen = force !== undefined ? force : !widgetPickerOpen;
    const el = document.getElementById('widget-picker');
    if (!el) return;
    if (widgetPickerOpen) renderWidgetPicker();
    el.classList.toggle('open', widgetPickerOpen);
  }

  function renderDesktopContextMenu() {
    const el = document.getElementById('desktop-context-menu');
    if (!el) return;
    const wp = hooks.getWallpaper?.() || 'default';
    const wallpapers = [
      { id: 'default', label: 'ProxPanel' },
      { id: 'aurora', label: 'Aurore' },
      { id: 'midnight', label: 'Minuit' },
      { id: 'proxmox', label: 'Proxmox' },
      { id: 'slate', label: 'Ardoise' },
    ];
    el.innerHTML = `
      <button type="button" data-desktop-action="edit-widgets"><i class="fa-solid fa-puzzle-piece"></i> Personnaliser les widgets</button>
      <button type="button" data-desktop-action="add-widget"><i class="fa-solid fa-plus"></i> Ajouter un widget</button>
      <div class="desktop-ctx-divider"></div>
      <div class="desktop-ctx-label">Fond d'écran</div>
      ${wallpapers.map((w) => `
        <button type="button" class="desktop-ctx-wallpaper${wp === w.id ? ' active' : ''}" data-set-wallpaper="${esc(w.id)}">
          <span class="desktop-ctx-swatch" data-wp="${esc(w.id)}"></span> ${esc(w.label)}
        </button>`).join('')}
      <div class="desktop-ctx-divider"></div>
      <button type="button" data-launch-app="control-panel"><i class="fa-solid fa-gear"></i> Panneau de configuration</button>
      <button type="button" data-launch-app="settings"><i class="fa-solid fa-sliders"></i> Paramètres ProxPanel</button>
      <button type="button" data-desktop-action="refresh"><i class="fa-solid fa-rotate"></i> Actualiser le bureau</button>`;
  }

  function showContextMenu(x, y) {
    const menu = document.getElementById('desktop-context-menu');
    if (!menu) return;
    renderDesktopContextMenu();
    menu.hidden = false;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      let left = x;
      let top = y;
      if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
      if (top + rect.height > window.innerHeight - 56) top = window.innerHeight - rect.height - 56;
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, top)}px`;
    });
  }

  function hideContextMenu() {
    const menu = document.getElementById('desktop-context-menu');
    if (menu) menu.hidden = true;
  }

  function toggleLauncher(force) {
    launcherOpen = force !== undefined ? force : !launcherOpen;
    document.getElementById('launcher')?.classList.toggle('open', launcherOpen);
    document.body.classList.toggle('launcher-open', launcherOpen);
    if (launcherOpen) {
      document.getElementById('launcher-search')?.focus();
    }
  }

  function filterLauncher(query) {
    const q = String(query || '').trim().toLowerCase();
    document.querySelectorAll('.launcher-tile').forEach((tile) => {
      const label = tile.querySelector('.launcher-tile-label')?.textContent?.toLowerCase() || '';
      tile.style.display = !q || label.includes(q) ? '' : 'none';
    });
    document.querySelectorAll('.launcher-section').forEach((sec) => {
      const visible = sec.querySelectorAll('.launcher-tile:not([style*="display: none"])').length;
      sec.style.display = visible ? '' : 'none';
    });
  }

  async function launchApp(appId, params) {
    const app = Registry.getApp(appId);
    if (!app) return;
    const winKey = appWinKey(appId);
    const existing = hooks.getWindows().find((w) => w.winKey === winKey);
    if (existing && app.singleton) {
      hooks.focusAppWindow(winKey);
      return existing;
    }
    const win = hooks.createAppWindow(app, winKey, params);
    if (!win) return null;
    const body = document.querySelector(`#win-${winKey} .app-view-body`);
    if (body) {
      body.dataset.appId = appId;
      await hooks.loadApp(appId, body, params);
    }
    hooks.renderTaskbar();
    return win;
  }

  function handleDesktopClick(e) {
    const appBtn = e.target.closest('[data-launch-app]');
    if (appBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleLauncher(false);
      hideContextMenu();
      launchApp(appBtn.dataset.launchApp);
      return;
    }

    const consoleBtn = e.target.closest('[data-open-console]');
    if (consoleBtn) {
      e.preventDefault();
      e.stopPropagation();
      hooks.openConsole?.(
        Number(consoleBtn.dataset.openConsole),
        consoleBtn.dataset.vmType,
        consoleBtn.dataset.vmName,
        consoleBtn.dataset.vmNode
      );
      return;
    }

    const openDesktopNotes = e.target.closest('[data-open-desktop-notes]');
    if (openDesktopNotes) {
      e.preventDefault();
      e.stopPropagation();
      hooks.openDesktopNotesEditor?.();
      return;
    }

    if (widgetEditMode) return;

    const widget = e.target.closest('.desktop-widget[data-launch-app]');
    if (widget && !e.target.closest('.dw-action-btn, .dw-shortcut, .dw-notes-open-btn, .dw-search-input, .dw-vm-item, [data-widget-vm-search]')) {
      launchApp(widget.dataset.launchApp);
    }

    const vmItem = e.target.closest('.dw-vm-item[data-open-console]');
    if (vmItem) {
      e.preventDefault();
      hooks.openConsole?.(
        Number(vmItem.dataset.openConsole),
        vmItem.dataset.vmType,
        vmItem.dataset.vmName,
        vmItem.dataset.vmNode
      );
    }
  }

  function bindDesktopEvents() {
    document.getElementById('launcher-toggle')?.addEventListener('click', () => toggleLauncher());
    document.getElementById('desktop')?.addEventListener('click', handleDesktopClick);
    document.getElementById('desktop')?.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.window, .launcher, .widget-picker-panel, .desktop-context-menu')) return;
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY);
    });

    document.getElementById('desktop-context-menu')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-desktop-action], [data-set-wallpaper], [data-launch-app]');
      if (!btn) return;
      hideContextMenu();
      const action = btn.dataset.desktopAction;
      if (action === 'edit-widgets') setWidgetEditMode(true);
      else if (action === 'add-widget') {
        setWidgetEditMode(true);
      }
      else if (action === 'refresh') refreshWidgets();
      else if (btn.dataset.setWallpaper) {
        hooks.saveWallpaper?.(btn.dataset.setWallpaper);
        applyWallpaper(btn.dataset.setWallpaper);
      } else if (btn.dataset.launchApp) launchApp(btn.dataset.launchApp);
    });

    document.getElementById('widget-edit-done')?.addEventListener('click', () => {
      setWidgetEditMode(false);
      toggleWidgetPicker(false);
    });

    document.getElementById('widget-edit-reset')?.addEventListener('click', () => {
      if (!confirm('Réinitialiser la disposition des widgets par défaut ?')) return;
      widgetLayout = WidgetReg.defaultLayout().map((w) => ({ ...w }));
      persistWidgetLayout();
      renderWidgets();
    });

    document.getElementById('desktop-widgets')?.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-widget]');
      if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        removeWidget(removeBtn.dataset.removeWidget);
      }
    });

    document.getElementById('desktop')?.addEventListener('input', (e) => {
      const search = e.target.closest('[data-widget-vm-search]');
      if (search) {
        filterWidgetVmSearch(search.value, search.closest('.desktop-widget'));
        return;
      }
      const notes = e.target.closest('[data-widget-notes]');
      if (notes) hooks.saveWidgetNotes?.(notes.value);
    });

    bindWidgetDragDrop();

    document.getElementById('widget-picker')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-widget-picker]')) toggleWidgetPicker(false);
      const addBtn = e.target.closest('[data-add-widget]');
      if (addBtn) {
        addWidget(addBtn.dataset.addWidget);
        renderWidgetPicker();
      }
    });

    document.getElementById('launcher')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-launcher]')) toggleLauncher(false);
      const appBtn = e.target.closest('[data-launch-app]');
      if (appBtn) {
        toggleLauncher(false);
        launchApp(appBtn.dataset.launchApp);
      }
      if (e.target.closest('[data-launcher-logout]')) {
        toggleLauncher(false);
        hooks.logout?.();
      }
    });
    document.getElementById('launcher')?.addEventListener('input', (e) => {
      if (e.target.id === 'launcher-search') filterLauncher(e.target.value);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (widgetPickerOpen) toggleWidgetPicker(false);
        else if (widgetEditMode) setWidgetEditMode(false);
        else if (launcherOpen) toggleLauncher(false);
        hideContextMenu();
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#desktop-context-menu')) hideContextMenu();
    });
    document.getElementById('taskbar-user')?.addEventListener('click', () => hooks.showUserMenu());
    document.getElementById('taskbar-widgets')?.addEventListener('click', () => setWidgetEditMode(true));
    document.getElementById('node-selector')?.addEventListener('change', (e) => hooks.switchNode(e.target.value));
  }

  function init() {
    widgetEditMode = false;
    const bar = document.getElementById('widget-edit-bar');
    const dock = document.getElementById('widget-palette-dock');
    if (bar) { bar.setAttribute('hidden', ''); bar.setAttribute('aria-hidden', 'true'); }
    if (dock) dock.setAttribute('hidden', '');
    document.body.classList.remove('desktop-widget-edit');

    loadWidgetLayoutFromHooks();
    applyWallpaper(hooks.getWallpaper?.() || 'default');
    renderDesktopIcons();
    renderLauncher();
    renderWidgets();
    renderDesktopContextMenu();
    bindDesktopEvents();
  }

  function refreshWidgets(opts = {}) {
    const force = opts.force === true;
    if (!force && (widgetEditMode || isWidgetInteractionActive())) return;
    const el = document.getElementById('desktop-widgets');
    if (!el || !widgetLayout.length) return;
    updateWidgetBodies();
  }

  function reloadSettings() {
    loadWidgetLayoutFromHooks();
    applyWallpaper(hooks.getWallpaper?.() || 'default');
    renderWidgets();
  }

  function filterWidgetVmSearch(query, widgetEl, saveQuery = true) {
    const widget = widgetEl || document.querySelector('.desktop-widget[data-widget-id="search-vm"]');
    if (!widget) return;
    const key = widget.dataset.widgetKey || 'search-vm';
    const q = String(query ?? '').trim().toLowerCase();
    if (saveQuery) vmSearchQueries.set(key, query ?? '');

    const input = widget.querySelector('[data-widget-vm-search]');
    if (input && input.value !== (query ?? '')) input.value = query ?? '';

    const results = widget.querySelector('[data-widget-vm-search-results]');
    if (!results) return;

    const ctx = hooks.getDesktopContext?.() || {};
    const list = (ctx.allVmsShort || []).filter((vm) => {
      if (!q) return true;
      const name = String(vm.name || '').toLowerCase();
      const id = String(vm.id ?? '');
      const node = String(vm.node || '').toLowerCase();
      return name.includes(q) || id.includes(q) || node.includes(q);
    }).slice(0, 20);

    results.innerHTML = list.length
      ? list.map((vm) => `
        <li class="dw-vm-item" data-open-console="${vm.id}" data-vm-type="${esc(vm.type)}" data-vm-node="${esc(vm.node)}" data-vm-name="${esc(vm.name)}">
          <span class="dw-vm-name">${esc(vm.name)}</span>
          <span class="dw-muted">${vm.id}${vm.node ? ` · ${esc(vm.node)}` : ''}</span>
        </li>`).join('')
      : '<li class="dw-empty">Aucun résultat</li>';
  }

  global.ProxPanelDesktop = {
    configure,
    init,
    launchApp,
    appWinKey,
    toggleLauncher,
    refreshWidgets,
    renderWidgets,
    updateLauncherAccount,
    setWidgetEditMode,
    addWidget,
    removeWidget,
    reloadSettings,
    filterWidgetVmSearch,
    getWidgetLayout: () => widgetLayout.map((w) => ({ ...w })),
  };
})(typeof window !== 'undefined' ? window : globalThis);
