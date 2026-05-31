/**
 * Édition conviviale du panneau de configuration (inspiré Proxmox window.Edit + ObjectGrid).
 */
(function (global) {
  const Schemas = global.ProxPanelControlPanelSchemas;
  const LookupUtil = global.ProxPanelControlPanelLookups;
  if (!Schemas) return;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function notify(msg, type) {
    if (typeof global.showNotification === 'function') {
      global.showNotification(msg, type || 'info');
    }
  }

  function asArray(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return Object.values(data);
    return [];
  }

  function getRealms() {
    const boot = global.__PROXPANEL_BOOTSTRAP__ || {};
    return (boot.realms || []).map((r) => (typeof r === 'string' ? r : r.realm)).filter(Boolean);
  }

  const lookupsCacheByKey = {};

  async function getLookups(node = '') {
    const cacheKey = node || '_cluster';
    if (lookupsCacheByKey[cacheKey]) return lookupsCacheByKey[cacheKey];
    try {
      const params = new URLSearchParams({ action: 'cluster-config-lookups' });
      if (node) params.set('node', node);
      const r = await fetch(`/api/data?${params}`);
      lookupsCacheByKey[cacheKey] = await r.json();
    } catch {
      lookupsCacheByKey[cacheKey] = {};
    }
    return lookupsCacheByKey[cacheKey];
  }

  function invalidateLookupsCache() {
    Object.keys(lookupsCacheByKey).forEach((k) => delete lookupsCacheByKey[k]);
  }

  function lookupOptions(field, lookups) {
    const key = field.lookup || (field.type && field.type.startsWith('lookup-') ? field.type.slice(7) : null);
    if (!key || !LookupUtil) return [];
    return LookupUtil.getLookupItems(key, lookups);
  }

  function selectedMultiValues(val) {
    if (Array.isArray(val)) return val.map(String);
    if (val == null || val === '') return [];
    return String(val).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }

  async function mutate(params) {
    const r = await fetch('/api/data?action=cluster-config-mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return r.json();
  }

  function blockPayload(data, key) {
    const p = data?.[key];
    if (p && typeof p === 'object' && ('ok' in p || 'data' in p)) {
      return { ok: p.ok !== false, data: p.data ?? p };
    }
    return { ok: true, data: p };
  }

  function parsePropertyString(str) {
    if (!str || typeof str !== 'string') return {};
    const out = {};
    str.split(',').forEach((part) => {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    });
    return out;
  }

  function printPropertyString(obj) {
    return Object.entries(obj || {})
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }

  function fieldVisible(field, values, isCreate) {
    if (field.createOnly && !isCreate) return false;
    if (field.editOnly && isCreate) return false;
    if (field.showIf) {
      return Object.entries(field.showIf).every(([k, v]) => String(values[k]) === String(v));
    }
    return true;
  }

  function renderFieldHtml(field, value, ctx) {
    const id = `cpf-${field.name}`;
    const val = value ?? field.default ?? '';
    if (field.type === 'checkbox') {
      const checked = val === 1 || val === true || val === '1' || field.default === true;
      return `
        <label class="cp-field cp-field-check">
          <input type="checkbox" id="${id}" name="${esc(field.name)}" ${checked ? 'checked' : ''} value="1">
          <span>${esc(field.label)}</span>
        </label>`;
    }
    if (field.type === 'select') {
      const opts = (field.options || [])
        .map(([v, l]) => `<option value="${esc(v)}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`)
        .join('');
      return `
        <label class="cp-field" for="${id}">
          <span>${esc(field.label)}${field.required ? ' *' : ''}</span>
          <select id="${id}" name="${esc(field.name)}" ${field.required ? 'required' : ''}>${opts}</select>
        </label>`;
    }
    if (field.type === 'realm') {
      const realms = getRealms();
      const opts = realms.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
      return `
        <label class="cp-field" for="${id}">
          <span>${esc(field.label)} *</span>
          <select id="${id}" name="${esc(field.name)}" required>${opts || '<option value="pam">pam</option>'}</select>
        </label>`;
    }
    if (field.type === 'textarea') {
      const rows = field.rows || 3;
      return `
        <label class="cp-field" for="${id}">
          <span>${esc(field.label)}</span>
          <textarea id="${id}" name="${esc(field.name)}" rows="${rows}" placeholder="${esc(field.placeholder || '')}">${esc(val)}</textarea>
        </label>`;
    }
    if (field.type === 'lookup' || field.type === 'lookup-user' || field.type === 'lookup-role') {
      const opts = lookupOptions(field, ctx?.lookups || {});
      const emptyOpt = field.required ? '' : '<option value="">—</option>';
      const optionsHtml = opts
        .map(([v, l]) => `<option value="${esc(v)}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`)
        .join('');
      if (field.allowCustom) {
        const listId = `cp-dl-${field.name}-${Math.random().toString(36).slice(2, 8)}`;
        const datalist = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
        return `
          <label class="cp-field" for="${id}">
            <span>${esc(field.label)}${field.required ? ' *' : ''}</span>
            <input type="text" id="${id}" name="${esc(field.name)}" value="${esc(val)}" list="${listId}"
              ${field.required ? 'required' : ''} placeholder="${esc(field.placeholder || 'Choisir ou saisir…')}">
            <datalist id="${listId}">${datalist}</datalist>
            ${field.hint ? `<small class="cp-field-hint">${esc(field.hint)}</small>` : ''}
          </label>`;
      }
      return `
        <label class="cp-field" for="${id}">
          <span>${esc(field.label)}${field.required ? ' *' : ''}</span>
          <select id="${id}" name="${esc(field.name)}" ${field.required ? 'required' : ''}>${emptyOpt}${optionsHtml}</select>
        </label>`;
    }
    if (field.type === 'multiLookup') {
      const opts = lookupOptions(field, ctx?.lookups || {});
      const selected = new Set(selectedMultiValues(val));
      const optionsHtml = opts
        .map(([v, l]) => `<option value="${esc(v)}"${selected.has(String(v)) ? ' selected' : ''}>${esc(l)}</option>`)
        .join('');
      return `
        <label class="cp-field" for="${id}">
          <span>${esc(field.label)}${field.required ? ' *' : ''}</span>
          <select id="${id}" name="${esc(field.name)}" multiple size="${Math.min(6, Math.max(3, opts.length))}" class="cp-select-multi">${optionsHtml}</select>
          <small class="cp-field-hint">Ctrl+clic pour plusieurs choix</small>
        </label>`;
    }
    if (field.type === 'property') {
      return `
        <label class="cp-field" for="${id}">
          <span>${esc(field.label)}</span>
          <input type="text" id="${id}" name="${esc(field.name)}" value="${esc(val)}" placeholder="${esc(field.hint || '')}">
          ${field.hint ? `<small class="cp-field-hint">${esc(field.hint)}</small>` : ''}
        </label>`;
    }
    const inputType = field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text';
    const attrs = [
      field.required ? 'required' : '',
      field.minLength ? `minlength="${field.minLength}"` : '',
      field.min != null ? `min="${field.min}"` : '',
      field.max != null ? `max="${field.max}"` : '',
      field.createOnly ? 'data-create-only="1"' : '',
    ].filter(Boolean).join(' ');
    return `
      <label class="cp-field" for="${id}">
        <span>${esc(field.label)}${field.required ? ' *' : ''}</span>
        <input type="${inputType}" id="${id}" name="${esc(field.name)}" value="${esc(val)}" placeholder="${esc(field.placeholder || '')}" ${attrs}>
      </label>`;
  }

  function readForm(formEl, schema, isCreate) {
    const values = {};
    const fields = schema.fields || schema.options || [];
    fields.forEach((field) => {
      if (!fieldVisible(field, values, isCreate) && field.showIf) {
        /* showIf evaluated after first pass */
      }
    });
    fields.forEach((field) => {
      if (!fieldVisible(field, values, isCreate)) return;
      if (field.submit === false) return;
      const el = formEl.querySelector(`[name="${field.name}"]`);
      if (!el) return;
      if (field.type === 'checkbox') {
        values[field.name] = el.checked ? 1 : 0;
      } else if (field.type === 'multiLookup') {
        values[field.name] = [...el.selectedOptions].map((o) => o.value).join(',');
      } else {
        values[field.name] = el.value;
      }
    });
    return values;
  }

  function openModal({ title, bodyHtml, onSave, danger }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'cp-modal-overlay';
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true">
          <header class="cp-modal-head">
            <h4>${esc(title)}</h4>
            <button type="button" class="cp-modal-close" aria-label="Fermer">&times;</button>
          </header>
          <form class="cp-modal-form">${bodyHtml}</form>
          <footer class="cp-modal-foot">
            <button type="button" class="cp-btn cp-btn-ghost" data-cp-cancel>Annuler</button>
            <button type="submit" class="cp-btn ${danger ? 'cp-btn-danger' : 'cp-btn-primary'}" form="cp-modal-form-inner">${danger ? 'Supprimer' : 'Enregistrer'}</button>
          </footer>
        </div>`;
      const form = overlay.querySelector('.cp-modal-form');
      form.id = 'cp-modal-form-inner';

      const close = (result) => {
        overlay.remove();
        resolve(result);
      };

      overlay.querySelector('.cp-modal-close')?.addEventListener('click', () => close(null));
      overlay.querySelector('[data-cp-cancel]')?.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null);
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = overlay.querySelector('.cp-btn-primary, .cp-btn-danger');
        if (btn) btn.disabled = true;
        try {
          const ok = await onSave(form);
          if (ok !== false) close(true);
        } finally {
          if (btn) btn.disabled = false;
        }
      });

      document.body.appendChild(overlay);
      form.querySelector('input,select,textarea')?.focus();
    });
  }

  function toolbarHtml(actions) {
    return `<div class="cp-toolbar">${actions.map((a) => `
      <button type="button" class="cp-btn ${a.class || 'cp-btn-secondary'}" data-cp-tool="${esc(a.id)}" ${a.disabled ? 'disabled' : ''}>
        <i class="fa-solid ${a.icon}"></i> ${esc(a.label)}
      </button>`).join('')}</div>`;
  }

  function tableHtml(columns, rows, selectable) {
    if (!rows.length) return '<p class="cp-empty">Aucune entrée.</p>';
    const head = columns.map((c) => `<th>${esc(c.label || c)}</th>`).join('');
    const body = rows
      .map((row, idx) => {
        const id = row._rowId ?? row._aclKey ?? row[columns[0]?.key || columns[0]] ?? String(idx);
        const cells = columns.map((col) => {
          const key = col.key || col;
          let v = row[key];
          if (key === 'enable' || key === 'propagate' || key === 'shared' || key === 'disable' || key === 'enabled') {
            v = v === 1 || v === true || v === '1' ? 'Oui' : 'Non';
          }
          return `<td>${esc(v ?? '')}</td>`;
        }).join('');
        return `<tr data-cp-row-id="${esc(id)}" data-cp-row-idx="${idx}" tabindex="0">${cells}</tr>`;
      })
      .join('');
    return `<div class="cp-table-wrap"><table class="cp-table cp-table-selectable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function bindRowSelection(container) {
    let selectedId = null;
    const rows = container.querySelectorAll('[data-cp-row-id]');
    rows.forEach((tr) => {
      tr.addEventListener('click', () => {
        rows.forEach((r) => r.classList.remove('cp-row-selected'));
        tr.classList.add('cp-row-selected');
        selectedId = tr.dataset.cpRowId;
        container.dataset.cpSelectedId = selectedId;
        container.dataset.cpSelectedIdx = tr.dataset.cpRowIdx;
        container.querySelectorAll('[data-cp-tool]').forEach((btn) => {
          const needsSel = ['edit', 'delete'].includes(btn.dataset.cpTool);
          if (needsSel) btn.disabled = !selectedId;
        });
      });
      tr.addEventListener('dblclick', () => {
        tr.click();
        container.querySelector('[data-cp-tool="edit"]')?.click();
      });
    });
    return () => ({
      getSelectedId: () => container.dataset.cpSelectedId || null,
      getSelectedIdx: () => parseInt(container.dataset.cpSelectedIdx || '-1', 10),
    });
  }

  function renderOptionsGrid(container, schema, data, apiSection, onReload) {
    const opts = data?.ok !== false ? (data.data || data) : {};
    const rows = schema.options.map((def) => {
      let value = opts[def.propertyKey || def.key] ?? '—';
      if (def.propertySubKey && value && value !== '—') {
        const p = typeof value === 'string' ? parsePropertyString(value) : value;
        value = p[def.propertySubKey] ?? value;
      }
      return { key: def.key, label: def.label, value };
    });

    container.innerHTML = `
      ${schema.help ? `<p class="cp-hint">${esc(schema.help)}</p>` : ''}
      ${toolbarHtml([{ id: 'refresh', label: 'Actualiser', icon: 'fa-rotate' }])}
      <div class="cp-table-wrap"><table class="cp-table">
        <thead><tr><th>Option</th><th>Valeur</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td>${esc(r.label)}</td>
            <td class="cp-cell-value">${esc(r.value)}</td>
            <td><button type="button" class="cp-btn cp-btn-sm" data-cp-edit-opt="${esc(r.key)}"><i class="fa-solid fa-pen"></i> Modifier</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

    container.querySelector('[data-cp-tool="refresh"]')?.addEventListener('click', onReload);

    container.querySelectorAll('[data-cp-edit-opt]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.cpEditOpt;
        const def = schema.options.find((o) => o.key === key);
        if (!def) return;
        const optKey = def.propertyKey || key;
        let cur = opts[optKey] ?? '';
        if (def.propertySubKey && cur) {
          const p = typeof cur === 'string' ? parsePropertyString(cur) : cur;
          cur = p[def.propertySubKey] ?? '';
        } else if (def.type === 'property' && cur && typeof cur === 'object') {
          cur = printPropertyString(cur);
        }
        const body = renderFieldHtml(
          { ...def, name: 'value', label: 'Valeur' },
          cur || def.default || '',
          {}
        );
        const extra = def.emptyMeansDelete
          ? '<p class="cp-hint">Laisser vide ou « Par défaut » pour réinitialiser l\'option.</p>'
          : '';
        await openModal({
          title: `Modifier : ${def.label}`,
          bodyHtml: extra + body,
          onSave: async (form) => {
            let value = form.querySelector('[name="value"]')?.value ?? '';
            const mutateKey = def.propertyKey || key;
            if (def.propertySubKey) {
              const raw = opts[mutateKey] ?? '';
              const p = typeof raw === 'string' ? parsePropertyString(raw) : { ...(raw || {}) };
              if (value === '' || value === '__default__') delete p[def.propertySubKey];
              else p[def.propertySubKey] = value;
              value = printPropertyString(p);
              if (!value) {
                const res = await mutate({
                  section: apiSection,
                  operation: 'delete-key',
                  data: { key: mutateKey },
                });
                if (!res.ok) {
                  notify(res.error || 'Erreur', 'error');
                  return false;
                }
                notify('Option réinitialisée', 'success');
                onReload();
                return true;
              }
            } else if (def.type === 'select' && (value === '__default__' || value === '')) {
              const res = await mutate({
                section: apiSection,
                operation: 'delete-key',
                data: { key: mutateKey },
              });
              if (!res.ok) {
                notify(res.error || 'Erreur', 'error');
                return false;
              }
              notify('Option réinitialisée', 'success');
              onReload();
              return true;
            } else if (def.type === 'property' && value) {
              value = printPropertyString(parsePropertyString(value));
            }
            const res = await mutate({
              section: apiSection,
              operation: 'set',
              data: { key: mutateKey, value },
            });
            if (!res.ok) {
              notify(res.error || 'Erreur', 'error');
              return false;
            }
            notify('Option enregistrée', 'success');
            onReload();
            return true;
          },
        });
      });
    });
  }

  function renderEntityEditor(container, schema, data, apiSection, node, onReload, extra = {}) {
    const mutateSection = extra.mutateSection || apiSection;
    const mutateSub = extra.sub || '';
    const mutateScope = extra.scope || (node ? 'node' : 'cluster');
    const ctxNode = node || '';
    let rows = data?.ok !== false ? asArray(data.data !== undefined ? data.data : data) : [];
    if (schema.mapRow) rows = rows.map(schema.mapRow);
    rows = rows.map((r, i) => ({
      ...r,
      _rowId: r[schema.idField] ?? r._aclKey ?? String(i),
    }));

    const cols = (schema.listColumns || [schema.idField]).map((k) => ({ key: k, label: k }));

    const tools = [];
    if (schema.canCreate) tools.push({ id: 'add', label: 'Ajouter', icon: 'fa-plus' });
    if (schema.canEdit) tools.push({ id: 'edit', label: 'Modifier', icon: 'fa-pen', disabled: true });
    if (schema.canDelete) tools.push({ id: 'delete', label: 'Supprimer', icon: 'fa-trash', disabled: true, class: 'cp-btn-danger' });
    tools.push({ id: 'refresh', label: 'Actualiser', icon: 'fa-rotate' });

    container.innerHTML = `
      ${toolbarHtml(tools)}
      <div data-cp-entity-table>${tableHtml(cols, rows, true)}</div>`;

    const sel = bindRowSelection(container);

    async function openEntityForm(mode, record, nodeParam) {
      const isCreate = mode === 'create';
      const fields = schema.fields || [];
      const values = { ...record };
      const lookups = await getLookups(nodeParam || ctxNode || '');
      if (schema.idField === 'roleid' && values.privs && Array.isArray(values.privs)) {
        values.privs = values.privs.join(',');
      }
      if (record?.userid && isCreate === false && !values.realm) {
        const [u, realm] = String(record.userid).split('@');
        values.userid = u;
        values.realm = realm || 'pam';
      }
      const body = fields
        .filter((f) => fieldVisible(f, values, isCreate))
        .map((f) => renderFieldHtml(f, values[f.name], { isCreate, lookups, node: nodeParam || ctxNode }))
        .join('');
      return openModal({
        title: `${isCreate ? 'Ajouter' : 'Modifier'} - ${schema.label}`,
        bodyHtml: body,
        onSave: async (form) => {
          let formValues = readForm(form, schema, isCreate);
          if (schema.buildPayload) {
            formValues = schema.buildPayload(formValues, isCreate ? 'create' : 'update');
          }
          if (formValues.privs && typeof formValues.privs === 'string') {
            formValues.privs = formValues.privs.replace(/\s+/g, '');
          }
          if (formValues.password && formValues.verifypassword && formValues.password !== formValues.verifypassword) {
            notify('Les mots de passe ne correspondent pas', 'error');
            return false;
          }
          const res = await mutate({
            section: mutateSection,
            sub: mutateSub,
            scope: mutateScope,
            operation: isCreate ? 'create' : 'update',
            id: record?.[schema.idField] || '',
            node,
            data: { ...formValues, userid: formValues.userid || record?.userid },
          });
          if (!res.ok) {
            notify(res.error || 'Erreur Proxmox', 'error');
            return false;
          }
          notify(isCreate ? 'Créé avec succès' : 'Mis à jour', 'success');
          onReload();
          return true;
        },
      });
    }

    container.querySelector('[data-cp-tool="add"]')?.addEventListener('click', () => openEntityForm('create', {}, ctxNode));
    container.querySelector('[data-cp-tool="edit"]')?.addEventListener('click', () => {
      const idx = parseInt(container.dataset.cpSelectedIdx || '-1', 10);
      if (idx < 0 || !rows[idx]) return;
      openEntityForm('edit', rows[idx], ctxNode);
    });
    container.querySelector('[data-cp-tool="delete"]')?.addEventListener('click', async () => {
      const idx = parseInt(container.dataset.cpSelectedIdx || '-1', 10);
      if (idx < 0 || !rows[idx]) return;
      const rec = rows[idx];
      if (!confirm(`Supprimer « ${rec[schema.idField] || rec._aclKey} » ?`)) return;
      let payload = { ...rec };
      if (schema.buildPayload) payload = schema.buildPayload(rec, 'delete');
      const res = await mutate({
        section: mutateSection,
        sub: mutateSub,
        scope: mutateScope,
        operation: 'delete',
        id: rec[schema.idField] || rec._aclKey,
        node,
        data: payload,
      });
      if (!res.ok) {
        notify(res.error || 'Erreur', 'error');
        return;
      }
      notify('Supprimé', 'success');
      onReload();
    });
    container.querySelector('[data-cp-tool="refresh"]')?.addEventListener('click', onReload);
  }

  async function renderSimpleForm(container, schema, data, apiSection, node, onReload, extra = {}) {
    const lookups = await getLookups(node || '');
    let values = data?.ok !== false ? (data.data ?? data) : {};
    if (schema.mapData) values = schema.mapData(values);
    container.innerHTML = `
      ${schema.help ? `<p class="cp-hint">${esc(schema.help)}</p>` : ''}
      <p class="cp-hint">Modifiez les champs puis cliquez sur Enregistrer.</p>
      <form class="cp-inline-form" data-cp-inline-form>
        ${(schema.fields || []).map((f) => renderFieldHtml(f, values[f.name], { lookups, node })).join('')}
        <div class="cp-form-actions">
          <button type="submit" class="cp-btn cp-btn-primary"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
          <button type="button" class="cp-btn cp-btn-ghost" data-cp-refresh-inline><i class="fa-solid fa-rotate"></i> Recharger</button>
        </div>
      </form>`;

    container.querySelector('[data-cp-refresh-inline]')?.addEventListener('click', onReload);
    container.querySelector('[data-cp-inline-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const formValues = readForm(form, schema, false);
      const res = await mutate({
        section: extra.mutateSection || apiSection,
        sub: extra.sub || '',
        scope: extra.scope || (node ? 'node' : 'cluster'),
        operation: 'update',
        node,
        data: formValues,
      });
      if (!res.ok) {
        notify(res.error || 'Erreur', 'error');
        return;
      }
      notify(extra.successMsg || 'Configuration enregistrée', 'success');
      onReload();
    });
  }

  function renderViewBlock(container, blockData) {
    if (blockData?.ok === false) {
      container.innerHTML = `<div class="cp-alert cp-alert-warn">${esc(blockData.error || 'Indisponible')}</div>`;
      return;
    }
    const rows = asArray(blockData?.data ?? blockData);
    if (!rows.length) {
      container.innerHTML = '<p class="cp-empty">Aucune donnée.</p>';
      return;
    }
    const cols = Object.keys(rows[0]).slice(0, 10).map((k) => ({ key: k, label: k }));
    container.innerHTML = tableHtml(cols, rows);
  }

  function renderActionsPanel(container, schema, data, apiSection, node, onReload) {
    const blockData = data?.ok !== false ? data : { ok: false, data: [] };
    const rows = asArray(blockData.data ?? blockData);
    const actions = schema.actions || [];
    container.innerHTML = `
      ${schema.help ? `<p class="cp-hint">${esc(schema.help)}</p>` : ''}
      <div class="cp-toolbar">${actions.map((a) => `
        <button type="button" class="cp-btn ${a.danger ? 'cp-btn-danger' : 'cp-btn-secondary'}" data-cp-action="${esc(a.id)}">
          <i class="fa-solid ${esc(a.icon)}"></i> ${esc(a.label)}
        </button>`).join('')}
        <button type="button" class="cp-btn cp-btn-ghost" data-cp-tool="refresh"><i class="fa-solid fa-rotate"></i> Actualiser</button>
      </div>
      ${rows.length ? `<h4 class="cp-subhead">Paquets / dépôts</h4>` : ''}
      <div data-cp-action-list></div>`;
    const listEl = container.querySelector('[data-cp-action-list]');
    if (listEl && rows.length) {
      const cols = Object.keys(rows[0]).slice(0, 8).map((k) => ({ key: k, label: k }));
      listEl.innerHTML = tableHtml(cols, rows);
    } else if (listEl) {
      listEl.innerHTML = '<p class="cp-empty">Aucun paquet listé. Cliquez sur Actualiser après une action.</p>';
    }
    container.querySelector('[data-cp-tool="refresh"]')?.addEventListener('click', onReload);
    actions.forEach((action) => {
      container.querySelector(`[data-cp-action="${action.id}"]`)?.addEventListener('click', async () => {
        if (action.confirm && !confirm(action.confirm)) return;
        const res = await mutate({
          section: apiSection,
          operation: action.operation,
          node,
        });
        if (!res.ok) {
          notify(res.error || 'Erreur', 'error');
          return;
        }
        notify('Action lancée', 'success');
        onReload();
      });
    });
  }

  function renderMultiBlock(container, schema, data, apiSection, node, onReload) {
    container.innerHTML = '';
    (schema.blocks || []).forEach((block, idx) => {
      const section = document.createElement('section');
      section.className = 'cp-block';
      section.innerHTML = `<h4 class="cp-subhead">${esc(block.label)}</h4>`;
      const inner = document.createElement('div');
      section.appendChild(inner);
      container.appendChild(section);

      const subData = blockPayload(data, block.dataKey);

      if (block.editType === 'form' && block.fields) {
        void renderSimpleForm(inner, { fields: block.fields, label: block.label }, subData, apiSection, node, onReload, {
          sub: block.sub,
          mutateSection: block.mutateSection || apiSection,
          scope: block.scope || schema.scope,
          successMsg: block.successMsg || 'Enregistré',
        });
      } else if (block.entitySchemaKey) {
        const entSchema = Schemas.getSchema(block.entitySchemaKey);
        if (entSchema) {
          renderEntityEditor(inner, entSchema, subData, apiSection, node, onReload, {
            sub: block.sub,
            mutateSection: block.mutateSection || apiSection,
            scope: block.scope || schema.scope,
          });
        }
      } else if (block.viewOnly) {
        renderViewBlock(inner, subData);
      }
    });
  }

  /**
   * @returns {boolean} true si rendu éditeur, false pour fallback lecture seule
   */
  function renderEditable(host, { sectionId, apiSection, data, node, onReload }) {
    const schema = Schemas.getSchema(apiSection);
    if (!schema) return false;

    const wrap = document.createElement('div');
    wrap.className = 'cp-editable';
    host.innerHTML = '';
    host.appendChild(wrap);

    if (schema.type === 'options-grid') {
      renderOptionsGrid(wrap, schema, data, apiSection, onReload);
    } else if (schema.type === 'entity') {
      renderEntityEditor(wrap, schema, data, apiSection, node, onReload);
    } else if (schema.type === 'form') {
      void renderSimpleForm(wrap, schema, data, apiSection, node, onReload);
    } else if (schema.type === 'multi') {
      renderMultiBlock(wrap, schema, data, apiSection, node, onReload);
    } else if (schema.type === 'actions') {
      renderActionsPanel(wrap, schema, data, apiSection, node, onReload);
    } else if (schema.type === 'view') {
      renderViewBlock(wrap, data);
    } else {
      return false;
    }
    return true;
  }

  global.ProxPanelControlPanelEditor = {
    renderEditable,
    isEditable: Schemas.isEditable,
    invalidateLookupsCache,
  };
})(typeof window !== 'undefined' ? window : globalThis);
