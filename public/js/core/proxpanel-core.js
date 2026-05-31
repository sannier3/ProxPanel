/**
 * ProxPanel - utilitaires partagés (stats ciblées, SSE, workspace).
 */
(function (global) {
  const DEFAULT_MAX = 80;

  function vmKey(m) {
    return `${m.node}:${m.type}:${m.id}`;
  }

  /** VM/CT sur nœuds offline exclus (aligné backend). */
  function filterGuestsOnOfflineNodes(parsed) {
    if (!parsed) return parsed;
    const online = new Set(
      (parsed.nodes || [])
        .filter((n) => n.status === 'online' && n.node)
        .map((n) => n.node)
    );
    return {
      nodes: parsed.nodes || [],
      vms: (parsed.vms || []).filter((v) => v.node && online.has(v.node)),
      containers: (parsed.containers || []).filter((c) => c.node && online.has(c.node)),
    };
  }

  /**
   * Construit la liste running à interroger (périmètre restreint).
   */
  function buildRunningStatsScope(ctx) {
    const {
      parsedResources,
      machines = [],
      currentView,
      selectedVM,
      windows = [],
      maxCount = DEFAULT_MAX,
    } = ctx;

    const onlineNodes = new Set(
      (parsedResources?.nodes || [])
        .filter((n) => n.status === 'online')
        .map((n) => n.node)
    );

    const keys = new Set();
    const list = [];

    function add(m) {
      if (!m || m.status !== 'running' || !onlineNodes.has(m.node)) return;
      const k = vmKey(m);
      if (keys.has(k)) return;
      keys.add(k);
      list.push({ type: m.type, node: m.node, vmid: m.id });
    }

    if (selectedVM) add(selectedVM);

    windows.forEach((w) => {
      const m = machines.find((x) => x.id === w.id && (x.type === w.type || !w.type));
      if (m) add(m);
    });

    if (currentView === 'monitor') {
      machines.filter((m) => m.status === 'running').forEach(add);
    } else if (currentView === 'vms' && selectedVM) {
      add(selectedVM);
    } else {
      const grid = document.getElementById('vm-grid');
      if (grid) {
        const cards = grid.querySelectorAll('[data-vmid][data-node]');
        cards.forEach((el) => {
          const vmid = parseInt(el.dataset.vmid, 10);
          const node = el.dataset.node;
          const type = el.dataset.type || 'vm';
          const m = machines.find((x) => x.id === vmid && x.node === node && x.type === type);
          add(m);
        });
      }
      if (list.length < 12) {
        machines
          .filter((m) => m.status === 'running')
          .slice(0, maxCount)
          .forEach(add);
      }
    }

    return list.slice(0, maxCount);
  }

  function applyVmStats(vmstats, machines, clusterNodes) {
    if (!vmstats?.length) return;
    vmstats.forEach((vmStats) => {
      const vm = machines.find(
        (m) => m.id === vmStats.id && m.node === vmStats.node && m.type === vmStats.type
      );
      if (vm) {
        vm.cpu = vmStats.cpu;
        vm.ram = vmStats.ram;
        vm.disk = vmStats.disk;
        vm.ip = vmStats.ip;
        if (vmStats.netin !== undefined) vm.netin = vmStats.netin;
        if (vmStats.netout !== undefined) vm.netout = vmStats.netout;
        if (vmStats.diskread !== undefined) vm.diskread = vmStats.diskread;
        if (vmStats.diskwrite !== undefined) vm.diskwrite = vmStats.diskwrite;
        if (vmStats.diskUsed !== undefined) vm.diskUsed = vmStats.diskUsed;
        if (vmStats.diskTotal !== undefined) vm.diskTotal = vmStats.diskTotal;
      }
      clusterNodes.forEach((node) => {
        if (!node.machines) return;
        const nodeVm = node.machines.find(
          (m) => m.id === vmStats.id && m.type === vmStats.type
        );
        if (nodeVm && nodeVm.status === 'running') {
          nodeVm.cpu = vmStats.cpu;
          nodeVm.ram = vmStats.ram;
          nodeVm.disk = vmStats.disk;
          nodeVm.ip = vmStats.ip;
          if (vmStats.netin !== undefined) nodeVm.netin = vmStats.netin;
          if (vmStats.netout !== undefined) nodeVm.netout = vmStats.netout;
          if (vmStats.diskread !== undefined) nodeVm.diskread = vmStats.diskread;
          if (vmStats.diskwrite !== undefined) nodeVm.diskwrite = vmStats.diskwrite;
          if (vmStats.diskUsed !== undefined) nodeVm.diskUsed = vmStats.diskUsed;
          if (vmStats.diskTotal !== undefined) nodeVm.diskTotal = vmStats.diskTotal;
        }
      });
    });
  }

  class RealtimeClient {
    constructor() {
      this.es = null;
      this.enabled = false;
      this.maxStats = DEFAULT_MAX;
    }

    start(enabled, maxStats) {
      this.enabled = !!enabled;
      this.maxStats = maxStats || DEFAULT_MAX;
      if (!this.enabled || this.es) return;
      this.es = new EventSource('/api/realtime/events');
      this.es.addEventListener('resources', () => {
        if (typeof global.onRealtimeResources === 'function') {
          global.onRealtimeResources();
        }
      });
      this.es.addEventListener('vmstats', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (typeof global.onRealtimeVmStats === 'function') {
            global.onRealtimeVmStats(data.vmstats);
          }
        } catch (e) {
          console.warn('SSE vmstats parse', e);
        }
      });
      this.es.onerror = () => {
        /* EventSource reconnecte automatiquement */
      };
    }

    stop() {
      if (this.es) {
        this.es.close();
        this.es = null;
      }
    }

    async publishScope(running) {
      if (!this.enabled || !running?.length) return;
      try {
        await fetch('/api/realtime/scope', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ running }),
        });
      } catch (e) {
        console.warn('scope publish', e);
      }
    }
  }

  let workspaceSaveTimer = null;

  async function saveWorkspaceDebounced(payload, delayMs = 800) {
    clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = setTimeout(async () => {
      try {
        await fetch('/api/workspace', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.warn('workspace save', e);
      }
    }, delayMs);
  }

  async function loadWorkspace() {
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) return null;
      const data = await res.json();
      return data.workspace;
    } catch {
      return null;
    }
  }

  global.ProxPanelCore = {
    buildRunningStatsScope,
    applyVmStats,
    filterGuestsOnOfflineNodes,
    RealtimeClient,
    saveWorkspaceDebounced,
    loadWorkspace,
  };
})(typeof window !== 'undefined' ? window : globalThis);
