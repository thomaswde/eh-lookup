(function initState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EHState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildState() {
  function createInitialState() {
    return {
      search: '',
      filters: { platform: new Set(), modules: new Set(), deployment: new Set() },
      hideEos: false,
      sort: 'platform-group',
      stack: [],
      stackName: '',
      stackNotes: '',
      exportShowConnections: false,
      catalogStatus: 'loading',
      catalogError: '',
    };
  }

  function safeStorageGet(storage, key) {
    try {
      return storage?.getItem(key) ?? null;
    } catch (e) {
      return null;
    }
  }

  function safeStorageSet(storage, key, value) {
    try {
      storage?.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function normalizeQuantity(value, fallback = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.floor(n));
  }

  function normalizeStack(stack, catalog) {
    if (!Array.isArray(stack)) return [];
    const known = new Set((Array.isArray(catalog) ? catalog : []).map(item => item.name));
    const byId = new Map();

    for (const entry of stack) {
      if (!entry || typeof entry.id !== 'string') continue;
      if (known.size && !known.has(entry.id)) continue;
      const qty = normalizeQuantity(entry.qty, 0);
      if (qty <= 0) continue;
      byId.set(entry.id, (byId.get(entry.id) || 0) + qty);
    }

    return [...byId.entries()].map(([id, qty]) => ({ id, qty }));
  }

  function loadPersistedState(storage) {
    const persisted = {};
    const saved = safeStorageGet(storage, 'eh-stack');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.stack)) persisted.stack = normalizeStack(parsed.stack);
        if (typeof parsed.name === 'string') persisted.stackName = parsed.name;
        if (typeof parsed.notes === 'string') persisted.stackNotes = parsed.notes;
        if (typeof parsed.showConnections === 'boolean') persisted.exportShowConnections = parsed.showConnections;
      } catch (e) {
        // Ignore malformed persisted state.
      }
    }

    persisted.hideEos = safeStorageGet(storage, 'eh-hide-eos') === '1';
    return persisted;
  }

  function persistStackState(storage, state) {
    return safeStorageSet(storage, 'eh-stack', JSON.stringify({
      stack: normalizeStack(state.stack),
      name: state.stackName,
      notes: state.stackNotes,
      showConnections: state.exportShowConnections,
    }));
  }

  return {
    createInitialState,
    loadPersistedState,
    persistStackState,
    normalizeQuantity,
    normalizeStack,
    safeStorageGet,
    safeStorageSet,
  };
});
