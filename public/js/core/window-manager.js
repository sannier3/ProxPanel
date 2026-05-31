/**
 * Gestionnaire de fenêtres style Windows (drag, resize 8 directions, snap, maximize).
 */
(function (global) {
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 200;
  const HEADER_MIN_VISIBLE = 36;
  const SNAP_THRESHOLD = 24;
  const DRAG_MOVE_THRESHOLD = 5;

  const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  let getLayer = () => document.getElementById('window-layer');
  let getWinObj = () => null;
  let onLayoutChange = () => {};
  let focusWindowCb = () => {};
  let zIndexBump = () => 100;

  let isDragging = false;
  let isResizing = false;
  let dragOffset = { x: 0, y: 0 };
  let currentWin = null;
  let resizeDir = null;
  let resizeStart = null;
  let snapPreview = null;
  let snapZone = null;
  let dragStartPos = { x: 0, y: 0 };
  let pendingMaximizedRestore = false;
  let captureEl = null;
  let capturePointerId = null;
  let layerResizeObserver = null;
  let relayoutTimer = null;

  function setWinInteractionLock(active) {
    document.body.classList.toggle('window-interaction-active', active);
  }

  function attachGlobalPointerHandlers(onMove, onEnd) {
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onEnd, true);
    document.addEventListener('pointercancel', onEnd, true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onEnd, true);
  }

  function detachGlobalPointerHandlers(onMove, onEnd) {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onEnd, true);
    document.removeEventListener('pointercancel', onEnd, true);
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onEnd, true);
  }

  function beginPointerCapture(e, el) {
    setWinInteractionLock(true);
    captureEl = el;
    if (e.pointerId != null && el?.setPointerCapture) {
      try {
        el.setPointerCapture(e.pointerId);
        capturePointerId = e.pointerId;
      } catch {
        capturePointerId = null;
      }
    }
  }

  function endPointerCapture() {
    setWinInteractionLock(false);
    if (captureEl && capturePointerId != null && captureEl.releasePointerCapture) {
      try {
        captureEl.releasePointerCapture(capturePointerId);
      } catch {
        /* ignore */
      }
    }
    captureEl = null;
    capturePointerId = null;
  }

  function parsePx(v) {
    return parseFloat(String(v).replace('px', '')) || 0;
  }

  function captureRect(winEl) {
    const layer = getLayer();
    if (!layer) return null;
    const layerRect = layer.getBoundingClientRect();
    const rect = winEl.getBoundingClientRect();
    return {
      left: `${rect.left - layerRect.left}px`,
      top: `${rect.top - layerRect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  }

  function applyRect(winEl, r) {
    if (!r) return;
    winEl.classList.remove('maximized');
    winEl.style.left = r.left;
    winEl.style.top = r.top;
    winEl.style.width = r.width;
    winEl.style.height = r.height;
  }

  function getWinKey(elOrId) {
    const raw = typeof elOrId === 'string' ? elOrId : elOrId?.id || '';
    return String(raw).replace(/^win-/, '');
  }

  function ensureWinMeta(winEl) {
    const key = getWinKey(winEl.id);
    const obj = getWinObj(key);
    if (obj && !obj.savedRect) obj.savedRect = captureRect(winEl);
    return obj;
  }

  function saveFloatingRect(winEl) {
    const obj = ensureWinMeta(winEl);
    if (!obj) return;
    if (!winEl.classList.contains('maximized')) {
      obj.savedRect = captureRect(winEl);
      obj.layoutMode = 'floating';
      obj.snapZone = null;
    }
  }

  function detectSnapZone(mouseX, mouseY, layerRect) {
    const rx = mouseX - layerRect.left;
    const ry = mouseY - layerRect.top;
    const w = layerRect.width;
    const h = layerRect.height;
    const t = SNAP_THRESHOLD;

    const atTop = ry <= t;
    const atBottom = ry >= h - t;
    const atLeft = rx <= t;
    const atRight = rx >= w - t;

    if (atTop && atLeft) return 'top-left';
    if (atTop && atRight) return 'top-right';
    if (atBottom && atLeft) return 'bottom-left';
    if (atBottom && atRight) return 'bottom-right';
    if (atTop) return 'top';
    if (atBottom) return 'bottom';
    if (atLeft) return 'left';
    if (atRight) return 'right';
    return null;
  }

  function getSnapPosition(zone, layerWidth, layerHeight) {
    const halfW = layerWidth / 2;
    const halfH = layerHeight / 2;
    switch (zone) {
      case 'top':
        return { x: 0, y: 0, width: layerWidth, height: layerHeight };
      case 'bottom':
        return { x: 0, y: halfH, width: layerWidth, height: halfH };
      case 'left':
        return { x: 0, y: 0, width: halfW, height: layerHeight };
      case 'right':
        return { x: halfW, y: 0, width: halfW, height: layerHeight };
      case 'top-left':
        return { x: 0, y: 0, width: halfW, height: halfH };
      case 'top-right':
        return { x: halfW, y: 0, width: halfW, height: halfH };
      case 'bottom-left':
        return { x: 0, y: halfH, width: halfW, height: halfH };
      case 'bottom-right':
        return { x: halfW, y: halfH, width: halfW, height: halfH };
      default:
        return null;
    }
  }

  function showSnapPreview(snapPos) {
    const layer = getLayer();
    if (!layer) return;
    if (!snapPreview) {
      snapPreview = document.createElement('div');
      snapPreview.className = 'window-snap-preview';
      layer.appendChild(snapPreview);
    }
    if (snapPos) {
      snapPreview.style.display = 'block';
      snapPreview.style.left = `${snapPos.x}px`;
      snapPreview.style.top = `${snapPos.y}px`;
      snapPreview.style.width = `${snapPos.width}px`;
      snapPreview.style.height = `${snapPos.height}px`;
    } else {
      snapPreview.style.display = 'none';
    }
  }

  function applySnap(winEl, zone, layerWidth, layerHeight, options = {}) {
    const snapPos = getSnapPosition(zone, layerWidth, layerHeight);
    if (!snapPos) return;
    if (!options.skipSaveRect) saveFloatingRect(winEl);
    const obj = ensureWinMeta(winEl);
    if (zone === 'top') {
      winEl.classList.add('maximized');
      if (obj) {
        obj.layoutMode = 'maximized';
        obj.snapZone = 'top';
      }
    } else {
      winEl.classList.remove('maximized');
      winEl.style.left = `${snapPos.x}px`;
      winEl.style.top = `${snapPos.y}px`;
      winEl.style.width = `${snapPos.width}px`;
      winEl.style.height = `${snapPos.height}px`;
      if (obj) {
        obj.layoutMode = 'snapped';
        obj.snapZone = zone;
      }
    }
    onLayoutChange();
  }

  function relayoutManagedWindows() {
    const layer = getLayer();
    if (!layer) return;
    const layerRect = layer.getBoundingClientRect();
    const w = layerRect.width;
    const h = layerRect.height;
    if (w <= 0 || h <= 0) return;

    layer.querySelectorAll('.window.window-managed').forEach((winEl) => {
      const obj = getWinObj(getWinKey(winEl.id));
      if (!obj) return;

      if (obj.layoutMode === 'maximized' || winEl.classList.contains('maximized')) {
        winEl.classList.add('maximized');
        return;
      }

      if (obj.snapZone && obj.layoutMode === 'snapped') {
        applySnap(winEl, obj.snapZone, w, h, { skipSaveRect: true });
      }
    });
  }

  function scheduleRelayout() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => {
      relayoutManagedWindows();
    }, 50);
  }

  function attachLayerResizeObserver() {
    const layer = getLayer();
    if (!layer || layerResizeObserver) return;
    layerResizeObserver = new ResizeObserver(() => scheduleRelayout());
    layerResizeObserver.observe(layer);
    window.addEventListener('resize', scheduleRelayout);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleRelayout);
    }
  }

  function maximizeWindow(winKey) {
    const key = getWinKey(winKey);
    const winEl = document.getElementById(`win-${key}`);
    if (!winEl) return;
    const obj = getWinObj(key);

    if (winEl.classList.contains('maximized')) {
      winEl.classList.remove('maximized');
      const restore = obj?.savedRect;
      if (restore) applyRect(winEl, restore);
      if (obj) {
        obj.layoutMode = 'floating';
        obj.snapZone = null;
      }
    } else {
      saveFloatingRect(winEl);
      if (obj) {
        obj.layoutMode = 'maximized';
        obj.snapZone = null;
      }
      winEl.classList.add('maximized');
    }
    onLayoutChange();
  }

  function restoreFromMaximizedForDrag(winEl, e) {
    const layer = getLayer();
    if (!layer) return;
    const layerRect = layer.getBoundingClientRect();
    const obj = ensureWinMeta(winEl);
    const saved = obj?.savedRect || {
      left: '80px',
      top: '80px',
      width: '600px',
      height: '400px',
    };
    const w = parsePx(saved.width);
    const h = parsePx(saved.height);
    const ratio = Math.min(1, Math.max(0, (e.clientX - layerRect.left) / layerRect.width));
    const left = e.clientX - layerRect.left - w * ratio;
    const top = e.clientY - layerRect.top - 18;

    winEl.classList.remove('maximized');
    winEl.style.width = `${w}px`;
    winEl.style.height = `${h}px`;
    winEl.style.left = `${Math.max(0, Math.min(left, layerRect.width - w))}px`;
    winEl.style.top = `${Math.max(0, Math.min(top, layerRect.height - HEADER_MIN_VISIBLE))}px`;
    if (obj) obj.layoutMode = 'floating';

    dragOffset.x = e.clientX - winEl.getBoundingClientRect().left;
    dragOffset.y = e.clientY - winEl.getBoundingClientRect().top;
  }

  function cancelDrag() {
    if (!isDragging) return;
    if (currentWin) currentWin.classList.remove('snapping');
    showSnapPreview(null);
    isDragging = false;
    pendingMaximizedRestore = false;
    currentWin = null;
    snapZone = null;
    detachGlobalPointerHandlers(onDrag, stopDrag);
    endPointerCapture();
  }

  function startDrag(e, winId) {
    if (e.button !== 0) return;
    if (e.detail > 1) return;
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    if (e.target.closest('.win-resize-handle')) return;

    const winEl = document.getElementById(winId);
    if (!winEl) return;

    dragStartPos = { x: e.clientX, y: e.clientY };
    pendingMaximizedRestore = winEl.classList.contains('maximized');

    if (!pendingMaximizedRestore) {
      saveFloatingRect(winEl);
      const rect = winEl.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
    }

    isDragging = true;
    currentWin = winEl;
    focusWindowCb(winId);
    winEl.style.zIndex = String(zIndexBump());
    e.preventDefault();

    const header = winEl.querySelector('.win-header') || winEl;
    beginPointerCapture(e, header);
    attachGlobalPointerHandlers(onDrag, stopDrag);
  }

  function onDrag(e) {
    if (!isDragging || !currentWin) return;
    e.preventDefault();

    const moved =
      Math.abs(e.clientX - dragStartPos.x) > DRAG_MOVE_THRESHOLD ||
      Math.abs(e.clientY - dragStartPos.y) > DRAG_MOVE_THRESHOLD;

    if (pendingMaximizedRestore) {
      if (!moved) return;
      restoreFromMaximizedForDrag(currentWin, e);
      pendingMaximizedRestore = false;
    }

    const layer = getLayer();
    const layerRect = layer.getBoundingClientRect();
    const winRect = currentWin.getBoundingClientRect();
    const winWidth = winRect.width;
    const winHeight = winRect.height;

    let newX = e.clientX - dragOffset.x - layerRect.left;
    let newY = e.clientY - dragOffset.y - layerRect.top;
    newX = Math.max(0, Math.min(newX, layerRect.width - winWidth));
    newY = Math.max(0, Math.min(newY, layerRect.height - HEADER_MIN_VISIBLE));

    const zone = detectSnapZone(e.clientX, e.clientY, layerRect);
    if (zone) {
      currentWin.classList.add('snapping');
      const snapPos = getSnapPosition(zone, layerRect.width, layerRect.height);
      showSnapPreview(snapPos);
      snapZone = zone;
    } else {
      currentWin.classList.remove('snapping');
      showSnapPreview(null);
      snapZone = null;
      currentWin.style.left = `${newX}px`;
      currentWin.style.top = `${newY}px`;
    }
  }

  function stopDrag() {
    if (!isDragging) return;

    if (pendingMaximizedRestore) {
      cancelDrag();
      return;
    }

    const layer = getLayer();
    if (snapZone && currentWin && layer) {
      const layerRect = layer.getBoundingClientRect();
      applySnap(currentWin, snapZone, layerRect.width, layerRect.height);
    } else if (currentWin) {
      saveFloatingRect(currentWin);
    }

    if (currentWin) currentWin.classList.remove('snapping');
    showSnapPreview(null);
    isDragging = false;
    pendingMaximizedRestore = false;
    currentWin = null;
    snapZone = null;
    detachGlobalPointerHandlers(onDrag, stopDrag);
    endPointerCapture();
    onLayoutChange();
  }

  function startResize(e, winId, dir) {
    if (e.button !== 0) return;
    const winEl = document.getElementById(winId);
    if (!winEl || winEl.classList.contains('maximized')) return;

    e.preventDefault();
    e.stopPropagation();

    isResizing = true;
    resizeDir = dir;
    currentWin = winEl;
    focusWindowCb(winId);
    saveFloatingRect(winEl);

    const rect = winEl.getBoundingClientRect();
    const layer = getLayer();
    const layerRect = layer.getBoundingClientRect();
    resizeStart = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      left: rect.left - layerRect.left,
      top: rect.top - layerRect.top,
      width: rect.width,
      height: rect.height,
    };

    beginPointerCapture(e, e.target);
    attachGlobalPointerHandlers(onResize, stopResize);
  }

  function onResize(e) {
    if (!isResizing || !currentWin || !resizeStart) return;
    e.preventDefault();

    const layer = getLayer();
    const layerRect = layer.getBoundingClientRect();
    const dx = e.clientX - resizeStart.mouseX;
    const dy = e.clientY - resizeStart.mouseY;
    let { left, top, width, height } = resizeStart;
    const dir = resizeDir;

    if (dir.includes('e')) width = Math.max(MIN_WIDTH, resizeStart.width + dx);
    if (dir.includes('w')) {
      width = Math.max(MIN_WIDTH, resizeStart.width - dx);
      left = resizeStart.left + (resizeStart.width - width);
    }
    if (dir.includes('s')) height = Math.max(MIN_HEIGHT, resizeStart.height + dy);
    if (dir.includes('n')) {
      height = Math.max(MIN_HEIGHT, resizeStart.height - dy);
      top = resizeStart.top + (resizeStart.height - height);
    }

    const maxW = layerRect.width - left;
    const maxH = layerRect.height - top;
    width = Math.min(width, maxW);
    height = Math.min(height, maxH);
    left = Math.max(0, Math.min(left, layerRect.width - MIN_WIDTH));
    top = Math.max(0, Math.min(top, layerRect.height - HEADER_MIN_VISIBLE));

    currentWin.style.left = `${left}px`;
    currentWin.style.top = `${top}px`;
    currentWin.style.width = `${width}px`;
    currentWin.style.height = `${height}px`;
  }

  function stopResize() {
    if (!isResizing) return;
    if (currentWin) saveFloatingRect(currentWin);
    isResizing = false;
    resizeDir = null;
    resizeStart = null;
    currentWin = null;
    detachGlobalPointerHandlers(onResize, stopResize);
    endPointerCapture();
    onLayoutChange();
  }

  function handleDoubleClick(e, winId) {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    if (!e.target.closest('.win-header')) return;
    e.preventDefault();
    e.stopPropagation();
    cancelDrag();
    maximizeWindow(getWinKey(winId));
  }

  function decorate(winEl, winKey) {
    if (winEl.dataset.wmDecorated) return;
    winEl.dataset.wmDecorated = '1';
    winEl.classList.add('window-managed');
    const handles = RESIZE_DIRS.map(
      (d) =>
        `<div class="win-resize-handle win-resize-${d}" data-resize="${d}" onmousedown="startWinResize(event, '${winEl.id}', '${d}')"></div>`
    ).join('');
    winEl.insertAdjacentHTML('beforeend', handles);

    const key = getWinKey(winKey || winEl.id);
    const obj = getWinObj(key);
    if (obj) {
      obj.savedRect = captureRect(winEl);
      obj.layoutMode = 'floating';
    }
  }

  function configure(options) {
    if (options.getLayer) getLayer = options.getLayer;
    if (options.getWinObj) getWinObj = options.getWinObj;
    if (options.onLayoutChange) onLayoutChange = options.onLayoutChange;
    if (options.focusWindow) focusWindowCb = options.focusWindow;
    if (options.zIndexBump) zIndexBump = options.zIndexBump;
    attachLayerResizeObserver();
    scheduleRelayout();
  }

  global.ProxPanelWindowManager = {
    configure,
    decorate,
    maximizeWindow,
    startDrag,
    startResize,
    handleDoubleClick,
    captureRect,
    applyRect,
    applySnap,
    relayoutManagedWindows,
  };

  global.startWinResize = (e, winId, dir) => ProxPanelWindowManager.startResize(e, winId, dir);
})(typeof window !== 'undefined' ? window : globalThis);
