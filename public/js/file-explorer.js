/**
 * Explorateur de fichiers cluster → nœuds → /
 */
(function (global) {
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

  async function apiGet(action, params = {}) {
    const q = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/data?${q}`);
    return res.json();
  }

  class FileExplorerApp {
    constructor(container) {
      this.container = container;
      this.tree = null;
      this.clusterName = 'Cluster';
      this.nodes = [];
      this.selected = { kind: 'cluster' };
      this.listData = { entries: [], path: '/', node: null, hint: null, partial: false, source: null };
      this.expanded = new Set(['cluster']);
      this.loading = false;
      this.renderShell();
      this.init();
    }

    renderShell() {
      this.container.innerHTML = `
        <div class="file-explorer">
          <div class="fe-toolbar">
            <div class="fe-breadcrumb" data-fe-breadcrumb></div>
            <button type="button" class="fe-btn" data-fe-refresh title="Actualiser">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
          <div class="fe-body">
            <aside class="fe-tree-panel">
              <div class="fe-tree-head">Arborescence</div>
              <div class="fe-tree" data-fe-tree></div>
            </aside>
            <section class="fe-list-panel">
              <div class="fe-list-head" data-fe-list-head></div>
              <div class="fe-list" data-fe-list></div>
              <div class="fe-status" data-fe-status></div>
            </section>
          </div>
        </div>`;

      this.treeEl = this.container.querySelector('[data-fe-tree]');
      this.listEl = this.container.querySelector('[data-fe-list]');
      this.listHeadEl = this.container.querySelector('[data-fe-list-head]');
      this.breadcrumbEl = this.container.querySelector('[data-fe-breadcrumb]');
      this.statusEl = this.container.querySelector('[data-fe-status]');

      this.container.querySelector('[data-fe-refresh]')?.addEventListener('click', () => this.refresh());
      this.treeEl?.addEventListener('click', (e) => this.onTreeClick(e));
      this.listEl?.addEventListener('dblclick', (e) => this.onListDblClick(e));
      this.listEl?.addEventListener('click', (e) => this.onListClick(e));
    }

    async init() {
      this.setLoading(true);
      try {
        const data = await apiGet('file-explorer-tree');
        this.clusterName = data.clusterName || 'Cluster';
        this.nodes = Array.isArray(data.nodes) ? data.nodes : [];
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
          const rootKey = this.treeKey('path', node.name, '/');
          const rootOpen = this.expanded.has(nKey) || this.expanded.has(rootKey);
          const rootSel =
            this.selected.kind === 'path' && this.selected.node === node.name;

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
        if (key === 'cluster') this.renderTree();
        else this.renderTree();
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
        const nKey = this.treeKey('node', node);
        this.expanded.add('cluster');
        this.expanded.add(nKey);
        this.selected = { kind: 'path', node, path: '/' };
      } else if (kind === 'path') {
        const node = item.getAttribute('data-fe-node');
        const path = item.getAttribute('data-fe-path') || '/';
        const nKey = this.treeKey('node', node);
        this.expanded.add('cluster');
        this.expanded.add(nKey);
        this.selected = { kind: 'path', node, path };
      }

      this.renderTree();
      this.loadListForSelection();
    }

    async loadListForSelection() {
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
          source: 'tree',
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
        const data = await apiGet('file-explorer-list', { node, path: path || '/' });
        if (data.error) {
          this.showError(data.error);
          return;
        }
        this.listData = {
          entries: data.entries || [],
          path: data.path || path,
          node,
          hint: data.hint || null,
          partial: !!data.partial,
          source: data.source || null,
        };
        this.renderList();
      } catch (err) {
        this.showError('Erreur lors de la lecture du répertoire.');
        console.error(err);
      } finally {
        this.setLoading(false);
      }
    }

    renderList() {
      const { entries, path, node, hint, partial, source } = this.listData;
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
            return `
              <div class="fe-row ${isDir ? 'fe-row-dir' : 'fe-row-file'}" data-fe-entry-type="${esc(entry.type)}" data-fe-entry-name="${esc(entry.name)}" data-fe-entry-path="${esc(entry.path || '')}">
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
        if (partial) parts.push('Vue partielle (API Proxmox — chemins datastore)');
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
          if (nav === 'cluster') {
            this.selected = { kind: 'cluster' };
          } else if (nav === 'root') {
            this.selected = { kind: 'path', node: btn.getAttribute('data-fe-node'), path: '/' };
          } else if (nav === 'path') {
            this.selected = {
              kind: 'path',
              node: btn.getAttribute('data-fe-node'),
              path: btn.getAttribute('data-fe-path') || '/',
            };
          }
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
        const base = this.listData.path || '/';
        const next =
          entryPath && entryPath.startsWith('/')
            ? entryPath
            : base === '/'
              ? `/${name}`
              : `${base}/${name}`;
        this.selected = { kind: 'path', node: this.listData.node, path: next };
        this.renderTree();
        this.loadListForSelection();
      }
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
