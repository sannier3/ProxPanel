/**
 * Résolution des listes déroulantes (aligné sur les sélecteurs Proxmox).
 */
(function (global) {
  function normalizeOptions(items, lookups, field) {
    if (!items) return [];
    if (field?.lookup === 'schedulePresets' || field?.lookup === 'contentTypes') {
      return items;
    }
    return items.map((item) => {
      if (item && typeof item === 'object' && 'value' in item) {
        return [String(item.value), String(item.label ?? item.value)];
      }
      if (Array.isArray(item)) return [String(item[0]), String(item[1] ?? item[0])];
      return [String(item), String(item)];
    });
  }

  function getLookupItems(lookupKey, lookups) {
    if (!lookups || !lookupKey) return [];
    const raw = lookups[lookupKey];
    if (!raw) return [];
    if (lookupKey === 'contentTypes' || lookupKey === 'schedulePresets') {
      return raw;
    }
    if (lookupKey === 'guests' || lookupKey === 'guestVmids') {
      return normalizeOptions(raw, lookups, { lookup: lookupKey });
    }
    return (Array.isArray(raw) ? raw : []).map((v) => [String(v), String(v)]);
  }

  global.ProxPanelControlPanelLookups = {
    getLookupItems,
    normalizeOptions,
  };
})(typeof window !== 'undefined' ? window : globalThis);
