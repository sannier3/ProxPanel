/**
 * Explorateur de fichiers cluster → nœuds → / (CRUD + éditeur)
 */
(function (global) {
  const API = '/api/file-explorer';

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function formatSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} Go`;
  }

  function formatMtime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return new Date(n * 1000).toLocaleString('fr-FR');
  }

  async function apiJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  }

  class FileExplorerApp {
    constructor(container) {
      this.container = container;
      this.clusterName = 'Cluster';
      this.nodes = [];
      this.selected = { kind: 'cluster' };
      this.listData = { entries: [], path: '/', node: null, hint: null, partial: false, canModify: false };
      this.expanded = new Set(['cluster']);
      this.loading = false;
      this.selectedEntry = null;
      this.canModify = false;
      this.renderShell();
      this.init();
    }

    renderShell() {
      this.container.innerHTML = `
        <div class="file-explorer">
          <div class="fe-toolbar">
            <div class="fe-breadcrumb" data-fe-breadcrumb></div>
            <div class="fe-toolbar-actions" data-fe-toolbar-actions></div>
            <button type="button" class="fe-btn" data-fe-refresh title="Actualiser"><i class="fa-solid fa-rotate"></i></button>
          </div>
          <div class="fe-body">
            <aside class="fe-tree-panel">
              <div class="fe-tree-head">Arborescence</div>
              <div class="fe-tree-scroll">
                <div class="fe-tree" data-fe-tree></div>
              </div>
            </aside>
            <section class="fe-list-panel">
              <div class="fe-list-toolbar" data-fe-list-toolbar hidden></div>
              <div class="fe-list-head" data-fe-list-head></div>
              <div class="fe-list-scroll">
                <div class="fe-list" data-fe-list></div>
              </div>
              <div class="fe-status" data-fe-status></div>
            </section>
          </div>
          <div class="fe-editor-overlay" data-fe-editor hidden>
            <div class="fe-editor-panel" role="dialog">
              <div class="fe-editor-head">
                <span data-fe-editor-title></span>
                <button type="button" class="fe-btn" data-fe-editor-close title="Fermer"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <textarea class="fe-editor-textarea" data-fe-editor-text spellcheck="false"></textarea>
              <div class="fe-editor-foot">
                <span class="fe-editor-hint"><kbd>Ctrl</kbd>+<kbd>S</kbd> enregistrer</span>
                <button type="button" class="fe-btn fe-btn-primary" data-fe-editor-save><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
              </div>
            </div>
          </div>
        </div>`;

      this.treeEl = this.container.querySelector('[data-fe-tree]');
      this.listEl = this.container.querySelector('[data-fe-list]');
      this.listHeadEl = this.container.querySelector('[data-fe-list-head]');
      this.listToolbarEl = this.container.querySelector('[data-fe-list-toolbar]');
      this.breadcrumbEl = this.container.querySelector('[data-fe-breadcrumb]');
      this.toolbarActionsEl = this.container.querySelector('[data-fe-toolbar-actions]');
      this.statusEl = this.container.querySelector('[data-fe-status]');
      this.editorOverlay = this.container.querySelector('[data-fe-editor]');
      this.editorText = this.container.querySelector('[data-fe-editor-text]');
      this.editorTitle = this.container.querySelector('[data-fe-editor-title]');

      this.container.querySelector('[data-fe-refresh]')?.addEventListener('click', () => this.refresh());
      this.treeEl?.addEventListener('click', (e) => this.onTreeClick(e));
      this.listEl?.addEventListener('dblclick', (e) => this.onListDblClick(e));
      this.listEl?.addEventListener('click', (e) => this.onListClick(e));
      this.listEl?.addEventListener('contextmenu', (e) => this.onListContextMenu(e));
      this.container.querySelector('[data-fe-editor-close]')?.addEventListener('click', () => this.closeEditor());
      this.container.querySelector('[data-fe-editor-save]')?.addEventListener('click', () => this.saveEditor());
      this.editorText?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          this.saveEditor();
        }
      });
      document.addEventListener('click', () => this.hideContextMenu());
    }

    async init() {
      this.setLoading(true);
      try {
        const data = await apiJson(`${API}/tree`);
        this.clusterName = data.clusterName || 'Cluster';
        this.nodes = Array.isArray(data.nodes) ? data.nodes : [];
        this.canModify = !!data.canModify;
        this.sortNodes();
        this.selected = { kind: 'cluster' };
        this.renderTree();
        await this.loadListForSelection();
      } catch (err) {
        this.showError('Impossible de charger l\'arborescence.');
        console.error(err);
      } finally {
        this.setLoading(false);
      }
    }

    sortNodes() {
      this.nodes.sort((a, b) => {
        const ar = a.status === 'online' ? 0 : 1;
        const br = b.status === 'online' ? 0 : 1;
        if (ar !== br) return ar - br;
        return (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
      });
    }

    treeKey(kind, node, path) {
      if (kind === 'cluster') return 'cluster';
      if (kind === 'node') return `node:${node}`;
      return `path:${node}:${path || '/'}`;
    }

    toggleExpanded(key) {
      if (this.expanded.has(key)) this.expanded.delete(key);
      else this.expanded.add(key);
    }

    isPathMode() {
      return this.selected.kind === 'path' && this.listData.node;
    }

    renderToolbarActions() {
      if (!this.toolbarActionsEl) return;
      const show = this.isPathMode() && this.canModify && !this.listData.partial;
      if (!show) {
        this.toolbarActionsEl.innerHTML = '';
        return;
      }
      this.toolbarActionsEl.innerHTML = `
        <button type="button" class="fe-btn fe-btn-text" data-fe-mkdir title="Nouveau dossier"><i class="fa-solid fa-folder-plus"></i></button>
        <label class="fe-btn fe-btn-text fe-upload-label" title="Téléverser">
          <i class="fa-solid fa-upload"></i>
          <input type="file" data-fe-upload-input multiple hidden>
        </label>`;
      this.toolbarActionsEl.querySelector('[data-fe-mkdir]')?.addEventListener('click', () => this.promptMkdir());
      const input = this.toolbarActionsEl.querySelector('[data-fe-upload-input]');
      if (input) {
        input.addEventListener('change', (e) => this.onUploadFiles(e));
      }
    }

    renderListToolbar() {
      if (!this.listToolbarEl) return;
      const entry = this.selectedEntry;
      const show = this.isPathMode() && this.canModify && !this.listData.partial && entry;
      this.listToolbarEl.hidden = !show;
      if (!show) {
        this.listToolbarEl.innerHTML = '';
        return;
      }
      const isFile = entry.type === 'file';
      const isDir = entry.type === 'dir';
      this.listToolbarEl.innerHTML = `
        ${isFile ? `<button type="button" class="fe-action-btn" data-fe-act="edit"><i class="fa-solid fa-pen"></i> Éditer</button>` : ''}
        ${isFile ? `<button type="button" class="fe-action-btn" data-fe-act="download"><i class="fa-solid fa-download"></i> Télécharger</button>` : ''}
        <button type="button" class="fe-action-btn" data-fe-act="rename"><i class="fa-solid fa-i-cursor"></i> Renommer</button>
        <button type="button" class="fe-action-btn" data-fe-act="move"><i class="fa-solid fa-arrow-right-arrow-left"></i> Déplacer</button>
        <button type="button" class="fe-action-btn fe-action-danger" data-fe-act="delete"><i class="fa-solid fa-trash"></i> Supprimer</button>`;
      this.listToolbarEl.querySelectorAll('[data-fe-act]').forEach((btn) => {
        btn.addEventListener('click', () => this.runAction(btn.getAttribute('data-fe-act'), entry));
      });
    }

    renderTree() {
      if (!this.treeEl) return;
      const clusterOpen = this.expanded.has('cluster');
      const clusterSel = this.selected.kind === 'cluster';

      let html = `
        <div class="fe-tree-item ${clusterSel ? 'is-selected' : ''}" data-fe-kind="cluster">
          <button type="button" class="fe-tree-toggle" data-fe-toggle="cluster" aria-label="Déplier">
            <i class="fa-solid fa-chevron-${clusterOpen ? 'down' : 'right'}"></i>
          </button>
          <span class="fe-tree-icon"><i class="fa-solid fa-sitemap"></i></span>
          <span class="fe-tree-label">${esc(this.clusterName)}</span>
        </div>`;

      if (clusterOpen) {
        html += '<div class="fe-tree-children">';
        for (const node of this.nodes) {
          const nKey = this.treeKey('node', node.name);
          const nodeOpen = this.expanded.has(nKey);
          const nodeSel = this.selected.kind === 'node' && this.selected.node === node.name;
          const rootSel = this.selected.kind === 'path' && this.selected.node === node.name;
          const statusClass = node.status === 'online' ? 'fe-status-online' : 'fe-status-offline';

          html += `
            <div class="fe-tree-item fe-tree-depth-1 ${nodeSel ? 'is-selected' : ''}" data-fe-kind="node" data-fe-node="${esc(node.name)}">
              <button type="button" class="fe-tree-toggle" data-fe-toggle="${esc(nKey)}">
                <i class="fa-solid fa-chevron-${nodeOpen ? 'down' : 'right'}"></i>
              </button>
              <span class="fe-tree-icon ${statusClass}"><i class="fa-solid fa-server"></i></span>
              <span class="fe-tree-label">${esc(node.name)}</span>
            </div>`;

          if (nodeOpen) {
            html += `
              <div class="fe-tree-children fe-tree-depth-2">
                <div class="fe-tree-item ${rootSel ? 'is-selected' : ''}" data-fe-kind="path" data-fe-node="${esc(node.name)}" data-fe-path="/">
                  <span class="fe-tree-toggle fe-tree-toggle-spacer"></span>
                  <span class="fe-tree-icon"><i class="fa-solid fa-folder"></i></span>
                  <span class="fe-tree-label">/</span>
                </div>
              </div>`;
          }
        }
        html += '</div>';
      }

      this.treeEl.innerHTML = html;
    }

    onTreeClick(e) {
      const toggle = e.target.closest('[data-fe-toggle]');
      if (toggle) {
        e.stopPropagation();
        const key = toggle.getAttribute('data-fe-toggle');
        if (key) this.toggleExpanded(key);
        this.renderTree();
        return;
      }

      const item = e.target.closest('.fe-tree-item[data-fe-kind]');
      if (!item) return;

      const kind = item.getAttribute('data-fe-kind');
      if (kind === 'cluster') {
        this.selected = { kind: 'cluster' };
        this.expanded.add('cluster');
      } else if (kind === 'node') {
        const node = item.getAttribute('data-fe-node');
        this.expanded.add('cluster');
        this.expanded.add(this.treeKey('node', node));
        this.selected = { kind: 'path', node, path: '/' };
      } else if (kind === 'path') {
        const node = item.getAttribute('data-fe-node');
        const path = item.getAttribute('data-fe-path') || '/';
        this.expanded.add('cluster');
        this.expanded.add(this.treeKey('node', node));
        this.selected = { kind: 'path', node, path };
      }

      this.selectedEntry = null;
      this.renderTree();
      this.loadListForSelection();
    }

    async loadListForSelection() {
      this.selectedEntry = null;
      this.renderListToolbar();
      this.renderToolbarActions();

      if (this.selected.kind === 'cluster') {
        this.listData = {
          entries: this.nodes.map((n) => ({
            name: n.name,
            type: 'node',
            path: null,
            status: n.status,
          })),
          path: null,
          node: null,
          hint: null,
          partial: false,
          canModify: false,
        };
        this.renderList();
        return;
      }

      if (this.selected.kind === 'node') {
        this.selected = { kind: 'path', node: this.selected.node, path: '/' };
      }

      const { node, path } = this.selected;
      if (!node) return;

      this.setLoading(true);
      try {
        const q = new URLSearchParams({ node, path: path || '/' });
        const data = await apiJson(`${API}/list?${q}`);
        if (data.error) {
          this.showError(data.error);
          return;
        }
        this.canModify = !!data.canModify;
        this.listData = {
          entries: data.entries || [],
          path: data.path || path,
          node,
          hint: data.hint || null,
          partial: !!data.partial,
          canModify: !!data.canModify,
        };
        this.renderList();
        this.renderToolbarActions();
      } catch (err) {
        this.showError('Erreur lors de la lecture du répertoire.');
        console.error(err);
      } finally {
        this.setLoading(false);
      }
    }

    getEntryPath(entry) {
      if (entry.path) return entry.path;
      const base = this.listData.path || '/';
      const name = entry.name;
      return base === '/' ? `/${name}` : `${base}/${name}`;
    }

    renderList() {
      const { entries, path, node, hint, partial, source, canModify } = this.listData;
      this.renderBreadcrumb();

      if (this.listHeadEl) {
        if (this.selected.kind === 'cluster') {
          this.listHeadEl.textContent = `${this.nodes.length} nœud(s)`;
        } else {
          this.listHeadEl.textContent = `${node}:${path || '/'}`;
        }
      }

      if (!this.listEl) return;

      if (!entries.length) {
        this.listEl.innerHTML = `<p class="fe-empty">Répertoire vide ou inaccessible.</p>`;
      } else {
        const rows = entries
          .map((entry) => {
            const isDir = entry.type === 'dir' || entry.type === 'node';
            const icon =
              entry.type === 'node'
                ? 'fa-server'
                : isDir
                  ? 'fa-folder'
                  : 'fa-file';
            const iconClass = entry.type === 'node' && entry.status !== 'online' ? 'fe-muted' : '';
            const fullPath = entry.type === 'node' ? '' : esc(this.getEntryPath(entry));
            return `
              <div class="fe-row ${isDir ? 'fe-row-dir' : 'fe-row-file'}"
                   data-fe-entry-type="${esc(entry.type)}"
                   data-fe-entry-name="${esc(entry.name)}"
                   data-fe-entry-path="${fullPath}">
                <span class="fe-row-icon ${iconClass}"><i class="fa-solid ${icon}"></i></span>
                <span class="fe-row-name">${esc(entry.name)}</span>
                <span class="fe-row-size">${isDir ? '—' : formatSize(entry.size)}</span>
                <span class="fe-row-mtime">${isDir ? '—' : formatMtime(entry.mtime)}</span>
              </div>`;
          })
          .join('');
        this.listEl.innerHTML = `
          <div class="fe-table-head">
            <span></span><span>Nom</span><span>Taille</span><span>Modifié</span>
          </div>
          ${rows}`;
      }

      if (this.statusEl) {
        const parts = [];
        if (source) parts.push(`Source : ${source}`);
        if (partial) parts.push('Vue partielle — activez LOCAL_EXEC ou FILE_EXPLORER_SSH pour toutes les actions');
        else if (canModify) parts.push('Modification autorisée');
        if (hint) parts.push(hint);
        this.statusEl.textContent = parts.join(' · ');
      }
    }

    renderBreadcrumb() {
      if (!this.breadcrumbEl) return;
      if (this.selected.kind === 'cluster') {
        this.breadcrumbEl.innerHTML = `<span class="fe-crumb is-current"><i class="fa-solid fa-sitemap"></i> ${esc(this.clusterName)}</span>`;
        return;
      }

      const { node, path } = this.selected;
      const parts = [];
      parts.push(`<button type="button" class="fe-crumb" data-fe-nav="cluster">${esc(this.clusterName)}</button>`);
      parts.push('<span class="fe-crumb-sep">/</span>');
      parts.push(`<button type="button" class="fe-crumb" data-fe-nav="root" data-fe-node="${esc(node)}">${esc(node)}</button>`);

      const segments = (path || '/').split('/').filter(Boolean);
      let acc = '';
      segments.forEach((seg, idx) => {
        acc += `/${seg}`;
        const isLast = idx === segments.length - 1;
        parts.push('<span class="fe-crumb-sep">/</span>');
        if (isLast) {
          parts.push(`<span class="fe-crumb is-current">${esc(seg)}</span>`);
        } else {
          parts.push(`<button type="button" class="fe-crumb" data-fe-nav="path" data-fe-node="${esc(node)}" data-fe-path="${esc(acc)}">${esc(seg)}</button>`);
        }
      });

      if (segments.length === 0) {
        parts.push('<span class="fe-crumb-sep">/</span>');
        parts.push('<span class="fe-crumb is-current">/</span>');
      }

      this.breadcrumbEl.innerHTML = parts.join('');
      this.breadcrumbEl.querySelectorAll('[data-fe-nav]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const nav = btn.getAttribute('data-fe-nav');
          if (nav === 'cluster') this.selected = { kind: 'cluster' };
          else if (nav === 'root') this.selected = { kind: 'path', node: btn.getAttribute('data-fe-node'), path: '/' };
          else if (nav === 'path') {
            this.selected = {
              kind: 'path',
              node: btn.getAttribute('data-fe-node'),
              path: btn.getAttribute('data-fe-path') || '/',
            };
          }
          this.selectedEntry = null;
          this.renderTree();
          this.loadListForSelection();
        });
      });
    }

    onListClick(e) {
      const row = e.target.closest('.fe-row');
      if (!row || this.selected.kind === 'cluster') return;
      this.listEl?.querySelectorAll('.fe-row').forEach((r) => r.classList.remove('is-selected'));
      row.classList.add('is-selected');
      const name = row.getAttribute('data-fe-entry-name');
      const type = row.getAttribute('data-fe-entry-type');
      const path = row.getAttribute('data-fe-entry-path');
      this.selectedEntry = this.listData.entries.find((en) => en.name === name && en.type === type) || {
        name,
        type,
        path,
      };
      if (!this.selectedEntry.path && path) this.selectedEntry.path = path;
      this.renderListToolbar();
    }

    onListDblClick(e) {
      const row = e.target.closest('.fe-row');
      if (!row) return;

      const entryType = row.getAttribute('data-fe-entry-type');
      const name = row.getAttribute('data-fe-entry-name');
      const entryPath = row.getAttribute('data-fe-entry-path');

      if (this.selected.kind === 'cluster' && entryType === 'node') {
        const nKey = this.treeKey('node', name);
        this.expanded.add('cluster');
        this.expanded.add(nKey);
        this.selected = { kind: 'path', node: name, path: '/' };
        this.renderTree();
        this.loadListForSelection();
        return;
      }

      if (entryType === 'dir') {
        const next = entryPath || (this.listData.path === '/' ? `/${name}` : `${this.listData.path}/${name}`);
        this.selected = { kind: 'path', node: this.listData.node, path: next };
        this.selectedEntry = null;
        this.renderTree();
        this.loadListForSelection();
        return;
      }

      if (entryType === 'file') {
        this.selectedEntry = { name, type: 'file', path: entryPath };
        this.openEditor(entryPath);
      }
    }

    onListContextMenu(e) {
      if (!this.isPathMode() || !this.canModify || this.listData.partial) return;
      const row = e.target.closest('.fe-row');
      if (!row) return;
      e.preventDefault();
      this.onListClick(e);
      this.showContextMenu(e.clientX, e.clientY, this.selectedEntry);
    }

    showContextMenu(x, y, entry) {
      this.hideContextMenu();
      if (!entry) return;
      const menu = document.createElement('div');
      menu.className = 'fe-context-menu';
      menu.id = 'fe-context-menu';
      const isFile = entry.type === 'file';
      menu.innerHTML = `
        ${isFile ? '<button type="button" data-fe-ctx="edit"><i class="fa-solid fa-pen"></i> Éditer</button>' : ''}
        ${isFile ? '<button type="button" data-fe-ctx="download"><i class="fa-solid fa-download"></i> Télécharger</button>' : ''}
        <button type="button" data-fe-ctx="rename"><i class="fa-solid fa-i-cursor"></i> Renommer</button>
        <button type="button" data-fe-ctx="move"><i class="fa-solid fa-arrow-right-arrow-left"></i> Déplacer</button>
        <button type="button" data-fe-ctx="delete" class="danger"><i class="fa-solid fa-trash"></i> Supprimer</button>`;
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      document.body.appendChild(menu);
      menu.querySelectorAll('[data-fe-ctx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.runAction(btn.getAttribute('data-fe-ctx'), entry);
          this.hideContextMenu();
        });
      });
    }

    hideContextMenu() {
      document.getElementById('fe-context-menu')?.remove();
    }

    async runAction(action, entry) {
      if (!entry || !this.listData.node) return;
      const filePath = this.getEntryPath(entry);
      switch (action) {
        case 'edit':
          await this.openEditor(filePath);
          break;
        case 'download':
          this.downloadFile(filePath, entry.name);
          break;
        case 'rename':
          await this.promptRename(entry, filePath);
          break;
        case 'move':
          await this.promptMove(entry, filePath);
          break;
        case 'delete':
          await this.confirmDelete(entry, filePath);
          break;
        default:
          break;
      }
    }

    downloadFile(filePath, name) {
      const q = new URLSearchParams({ node: this.listData.node, path: filePath });
      window.open(`${API}/download?${q}`, '_blank');
    }

    async openEditor(filePath) {
      if (!this.editorOverlay || !this.editorText) return;
      this.editorPath = filePath;
      this.editorTitle.textContent = filePath;
      this.editorText.value = 'Chargement…';
      this.editorOverlay.hidden = false;
      try {
        const q = new URLSearchParams({ node: this.listData.node, path: filePath });
        const data = await apiJson(`${API}/read?${q}`);
        if (!data.ok) {
          this.editorText.value = `Erreur : ${data.error || 'lecture impossible'}`;
          return;
        }
        this.editorText.value = data.text ?? '';
      } catch (err) {
        this.editorText.value = `Erreur réseau : ${err.message}`;
      }
    }

    closeEditor() {
      if (this.editorOverlay) this.editorOverlay.hidden = true;
      this.editorPath = null;
    }

    async saveEditor() {
      if (!this.editorPath || !this.listData.node) return;
      const data = await apiJson(`${API}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node: this.listData.node,
          path: this.editorPath,
          content: this.editorText.value,
        }),
      });
      if (data.ok) {
        this.notify('Fichier enregistré', 'success');
        this.closeEditor();
        await this.loadListForSelection();
      } else {
        this.notify(data.error || 'Échec enregistrement', 'error');
      }
    }

    async promptMkdir() {
      const name = window.prompt('Nom du nouveau dossier :');
      if (!name?.trim()) return;
      const dirPath = this.listData.path === '/' ? `/${name.trim()}` : `${this.listData.path}/${name.trim()}`;
      const data = await apiJson(`${API}/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: this.listData.node, path: dirPath }),
      });
      if (data.ok) {
        this.notify('Dossier créé', 'success');
        await this.loadListForSelection();
      } else {
        this.notify(data.error || 'Échec création', 'error');
      }
    }

    async promptRename(entry, filePath) {
      const name = window.prompt('Nouveau nom :', entry.name);
      if (!name?.trim() || name === entry.name) return;
      const parent = filePath.replace(/\/[^/]+$/, '') || '/';
      const dest = parent === '/' ? `/${name.trim()}` : `${parent}/${name.trim()}`;
      const data = await apiJson(`${API}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: this.listData.node, from: filePath, to: dest }),
      });
      if (data.ok) {
        this.notify('Renommé', 'success');
        this.selectedEntry = null;
        await this.loadListForSelection();
      } else {
        this.notify(data.error || 'Échec renommage', 'error');
      }
    }

    async promptMove(entry, filePath) {
      const dest = window.prompt('Chemin de destination (complet) :', filePath);
      if (!dest?.trim()) return;
      const data = await apiJson(`${API}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: this.listData.node, from: filePath, to: dest.trim() }),
      });
      if (data.ok) {
        this.notify('Déplacé', 'success');
        this.selectedEntry = null;
        await this.loadListForSelection();
      } else {
        this.notify(data.error || 'Échec déplacement', 'error');
      }
    }

    async confirmDelete(entry, filePath) {
      const msg =
        entry.type === 'dir'
          ? `Supprimer le dossier « ${entry.name} » et son contenu ?`
          : `Supprimer « ${entry.name} » ?`;
      if (!window.confirm(msg)) return;
      const data = await apiJson(`${API}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node: this.listData.node,
          path: filePath,
          recursive: entry.type === 'dir',
        }),
      });
      if (data.ok) {
        this.notify('Supprimé', 'success');
        this.selectedEntry = null;
        await this.loadListForSelection();
      } else {
        this.notify(data.error || 'Échec suppression', 'error');
      }
    }

    async onUploadFiles(e) {
      const files = e.target.files;
      if (!files?.length || !this.listData.node) return;
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('node', this.listData.node);
        fd.append('path', this.listData.path || '/');
        try {
          const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
          const data = await res.json();
          if (!data.ok) this.notify(`${file.name} : ${data.error}`, 'error');
        } catch (err) {
          this.notify(`${file.name} : ${err.message}`, 'error');
        }
      }
      e.target.value = '';
      this.notify('Téléversement terminé', 'success');
      await this.loadListForSelection();
    }

    notify(msg, type) {
      const fn = global.showNotification || (typeof window !== 'undefined' && window.showNotification);
      if (typeof fn === 'function') fn(msg, type);
      else window.alert(msg);
    }

    async refresh() {
      if (this.selected.kind === 'cluster') {
        await this.init();
        return;
      }
      await this.loadListForSelection();
    }

    setLoading(on) {
      this.loading = on;
      this.container?.classList.toggle('fe-loading', on);
    }

    showError(msg) {
      if (this.listEl) {
        this.listEl.innerHTML = `<p class="fe-empty fe-error">${esc(msg)}</p>`;
      }
    }
  }

  function init(container) {
    if (!container) return;
    if (container._fileExplorer) return container._fileExplorer;
    container._fileExplorer = new FileExplorerApp(container);
    return container._fileExplorer;
  }

  global.ProxPanelFileExplorer = { init };
})(typeof window !== 'undefined' ? window : globalThis);
