(function initDomain(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EHDomain = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildDomain() {
  const SENSOR_PLATFORMS = new Set([
    'packet_sensor', 'multifunction_sensor', 'all_in_one',
  ]);
  const SINGLETON_PLATFORMS = new Set([
    'command', 'recordstore',
  ]);
  const SENSOR_TOTAL_PLATFORMS = new Set([
    'packet_sensor', 'multifunction_sensor', 'all_in_one', 'ids_standalone',
  ]);

  function itemOf(catalog, name) {
    return catalog.find(x => x.name === name);
  }

  function normalizeQuantity(value, fallback = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.floor(n));
  }

  function normalizeStackEntries(stack, catalog) {
    if (!Array.isArray(stack)) return [];
    const catalogByName = new Map((Array.isArray(catalog) ? catalog : []).map(item => [item.name, item]));
    const known = new Set(catalogByName.keys());
    const byId = new Map();
    const singletonPlatforms = new Set();
    let hasSensor = false;

    for (const entry of stack) {
      if (!entry || typeof entry.id !== 'string') continue;
      if (known.size && !known.has(entry.id)) continue;
      const item = catalogByName.get(entry.id);
      let qty = normalizeQuantity(entry.qty, 0);
      if (qty <= 0) continue;
      if (item && SENSOR_PLATFORMS.has(item.platform)) {
        if (hasSensor) continue;
        hasSensor = true;
        qty = 1;
      }
      if (item && SINGLETON_PLATFORMS.has(item.platform)) {
        if (singletonPlatforms.has(item.platform)) continue;
        singletonPlatforms.add(item.platform);
        qty = 1;
      }
      byId.set(entry.id, (byId.get(entry.id) || 0) + qty);
    }

    return [...byId.entries()].map(([id, qty]) => ({ id, qty }));
  }

  function getStackItems(stack, catalog) {
    return normalizeStackEntries(stack, catalog)
      .map(s => {
        const item = itemOf(catalog, s.id);
        return item ? { ...item, __qty: s.qty } : null;
      })
      .filter(Boolean);
  }

  function computeStorageCapacityTb(item) {
    const cp = item?.storage?.continuous_pcap;
    if (!cp) return 0;
    if (cp.capacity_tb) return cp.capacity_tb;
    if (cp.onboard?.disk_qty && cp.onboard?.disk_size_tb) return cp.onboard.disk_qty * cp.onboard.disk_size_tb;
    if (cp.virtual_disk?.disk_qty && cp.virtual_disk?.disk_size_tb) return cp.virtual_disk.disk_qty * cp.virtual_disk.disk_size_tb;
    return 0;
  }

  function getTrackSet(items) {
    const tracks = new Set();
    for (const it of items) {
      (it.compatibility?.track_limits || []).forEach(t => tracks.add(t));
    }
    return tracks;
  }

  function hasTrackConflict(a, b) {
    return (a.has('enterprise_only') && b.has('rx360_only')) ||
      (a.has('rx360_only') && b.has('enterprise_only'));
  }

  function canAddToStack(stack, item, catalog) {
    if (!item) return { ok: false, message: 'That catalog item is not available.' };
    const normalizedStack = normalizeStackEntries(stack, catalog);

    if (SENSOR_PLATFORMS.has(item.platform)) {
      const existingSensor = normalizedStack
        .map(s => itemOf(catalog, s.id))
        .find(it => it && SENSOR_PLATFORMS.has(it.platform) && it.name !== item.name);
      if (existingSensor) {
        return { ok: false, message: `A stack holds one EDA. Remove ${existingSensor.name} first.` };
      }
      if (normalizedStack.find(s => s.id === item.name)) {
        return { ok: false, message: `A stack holds one EDA - ${item.name} is already in this stack.` };
      }
    }

    if (SINGLETON_PLATFORMS.has(item.platform)) {
      const roleLabel = item.platform === 'command' ? 'ECA' : 'EXA';
      const existingRole = normalizedStack
        .map(s => itemOf(catalog, s.id))
        .find(it => it && it.platform === item.platform && it.name !== item.name);
      if (existingRole) {
        return { ok: false, message: `A stack holds one ${roleLabel}. Remove ${existingRole.name} first.` };
      }
      if (normalizedStack.find(s => s.id === item.name)) {
        return { ok: false, message: `A stack holds one ${roleLabel} - ${item.name} is already in this stack.` };
      }
    }

    const newTracks = getTrackSet([item]);
    const stackTracks = getTrackSet(getStackItems(normalizedStack, catalog));
    if (hasTrackConflict(newTracks, stackTracks)) {
      return { ok: false, message: `${item.name} conflicts with the stack's licensing track.` };
    }

    return { ok: true };
  }

  function addStackItem(stack, itemName, catalog, qty = 1) {
    const item = itemOf(catalog, itemName);
    const allowed = canAddToStack(stack, item, catalog);
    if (!allowed.ok) return { ...allowed, stack };
    const addQty = normalizeQuantity(qty, 1);
    if (addQty <= 0) return { ok: true, stack: normalizeStackEntries(stack, catalog) };

    const nextStack = normalizeStackEntries(stack, catalog);
    const existing = nextStack.find(s => s.id === itemName);
    if (existing) existing.qty += addQty;
    else nextStack.push({ id: itemName, qty: addQty });
    return { ok: true, stack: nextStack };
  }

  function removeStackItem(stack, itemName) {
    return (Array.isArray(stack) ? stack : [])
      .filter(s => s.id !== itemName)
      .map(entry => ({ ...entry, qty: normalizeQuantity(entry.qty, 0) }))
      .filter(entry => entry.qty > 0);
  }

  function changeStackItemQty(stack, itemName, delta, catalog) {
    const normalizedStack = normalizeStackEntries(stack, catalog);
    const entry = normalizedStack.find(s => s.id === itemName);
    if (!entry) return { ok: false, stack: normalizedStack, message: 'That stack item is not present.' };

    const item = itemOf(catalog, itemName);
    const qtyDelta = Number.isFinite(Number(delta)) ? Math.trunc(Number(delta)) : 0;
    if (qtyDelta > 0 && item && SENSOR_PLATFORMS.has(item.platform) && entry.qty >= 1) {
      return { ok: false, stack: normalizedStack, message: 'A stack holds one EDA.' };
    }
    if (qtyDelta > 0 && item && SINGLETON_PLATFORMS.has(item.platform) && entry.qty >= 1) {
      return { ok: false, stack: normalizedStack, message: `A stack holds one ${item.platform === 'command' ? 'ECA' : 'EXA'}.` };
    }

    const nextQty = Math.max(0, entry.qty + qtyDelta);
    if (nextQty === 0) return { ok: true, stack: removeStackItem(normalizedStack, itemName) };
    return {
      ok: true,
      stack: normalizedStack.map(s => s.id === itemName ? { ...s, qty: nextQty } : { ...s }),
    };
  }

  function computeStackTotals(stack, catalog) {
    let throughput = 0, ids = 0, advanced = 0, standard = 0, tiObservable = 0;
    let flowsPerSec = 0, ingestRps = 0;
    let rackU = 0, power = 0, pcapTb = 0;
    let sensorCount = 0, consoleCount = 0, storeCount = 0, recordCount = 0, flowCount = 0;

    for (const s of normalizeStackEntries(stack, catalog)) {
      const item = itemOf(catalog, s.id);
      if (!item) continue;
      const p = item.performance || {};
      const ff = item.form_factor || {};
      const q = s.qty || 0;

      if (SENSOR_TOTAL_PLATFORMS.has(item.platform)) {
        sensorCount += q;
        throughput += (p.base_gbps || 0) * q;
        ids += (p.ids_gbps || 0) * q;
        advanced += (p.advanced_analysis || 0) * q;
        standard += (p.standard_analysis || 0) * q;
        tiObservable += (p.ti_observable || 0) * q;
      }
      if (item.platform === 'command') consoleCount += q;
      if (item.platform === 'packetstore' || item.platform === 'extended_storage') storeCount += q;
      if (item.platform === 'recordstore') {
        recordCount += q;
        ingestRps += (p.ingest_records_per_sec || 0) * q;
      }
      if (item.platform === 'flow_collector') {
        flowCount += q;
        flowsPerSec += (p.flows_per_second || 0) * q;
      }
      if (ff.rack_units) rackU += ff.rack_units * q;
      if (ff.power_watts) power += ff.power_watts * q;
      pcapTb += computeStorageCapacityTb(item) * q;
    }

    return { throughput, ids, advanced, standard, tiObservable, flowsPerSec, ingestRps,
      rackU, power, pcapTb, sensorCount, consoleCount, storeCount, recordCount, flowCount };
  }

  function getEsuAttachmentLimit(hostItem, esuName) {
    const atts = hostItem?.compatibility?.accepts_attachments;
    if (!atts) return 0;
    for (const a of atts) {
      if (a.type !== 'ESU') continue;
      for (const m of (a.models || [])) {
        if (m.model === esuName) return m.limit || 0;
      }
    }
    return 0;
  }

  function getAssignableEsuHosts(etas, aioHost, esuName) {
    const hosts = [];

    for (const eta of etas) {
      const limit = getEsuAttachmentLimit(eta.item, esuName);
      if (!limit) continue;
      hosts.push({ type: 'eta', ref: eta, limit, priority: 0 });
    }

    if (aioHost) {
      const limit = getEsuAttachmentLimit(aioHost.item, esuName);
      if (limit) hosts.push({ type: 'aio', ref: aioHost, limit, priority: 1 });
    }

    hosts.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.ref.idx !== b.ref.idx) return a.ref.idx - b.ref.idx;
      return a.type.localeCompare(b.type);
    });

    return hosts;
  }

  function formatTopologyInstanceName(inst) {
    if (!inst) return '';
    const qty = inst.item?.__qty || 1;
    return qty > 1 ? `${inst.name} #${inst.idx + 1}` : inst.name;
  }

  function reserveHostsForRemainingEsuGroups(groupEntries, startIndex, hostState, etas, aioHost) {
    const reserved = new Set();

    for (let i = startIndex; i < groupEntries.length; i++) {
      const [esuName, group] = groupEntries[i];
      let reservedCapacity = 0;
      const candidates = getAssignableEsuHosts(etas, aioHost, esuName)
        .filter(host => {
          const state = hostState.get(host.ref) || { totalLoad: 0, esuType: null };
          return state.esuType == null && state.totalLoad < host.limit && !reserved.has(host.ref);
        })
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          if (a.ref.idx !== b.ref.idx) return b.ref.idx - a.ref.idx;
          return a.type.localeCompare(b.type);
        });

      for (const host of candidates) {
        reserved.add(host.ref);
        reservedCapacity += host.limit;
        if (reservedCapacity >= group.length) break;
      }
    }

    return reserved;
  }

  function planTopology(items) {
    const ecas = [];
    const exas = [];
    const sensors = [];
    const ids = [];
    const efc = [];
    const etas = [];
    const esus = [];

    for (const it of items) {
      const n = it.__qty || 1;
      for (let i = 0; i < n; i++) {
        const inst = { name: it.name, item: it, idx: i };
        if (it.platform === 'command') ecas.push(inst);
        else if (it.platform === 'recordstore') exas.push(inst);
        else if (SENSOR_PLATFORMS.has(it.platform)) sensors.push(inst);
        else if (it.platform === 'ids_standalone') ids.push(inst);
        else if (it.platform === 'flow_collector') efc.push(inst);
        else if (it.platform === 'packetstore') etas.push(inst);
        else if (it.platform === 'extended_storage') esus.push(inst);
      }
    }

    const eca = ecas[0] || null;
    const exa = exas[0] || null;
    const sensor = sensors[0] || null;
    const aioHost = sensor && sensor.item.platform === 'all_in_one' ? sensor : null;

    const esuAssignments = [];
    const hostState = new Map();
    etas.forEach(eta => hostState.set(eta, { totalLoad: 0, esuType: null }));
    if (aioHost) hostState.set(aioHost, { totalLoad: 0, esuType: null });

    const esuGroups = new Map();
    esus.forEach(esu => {
      if (!esuGroups.has(esu.name)) esuGroups.set(esu.name, []);
      esuGroups.get(esu.name).push(esu);
    });

    const groupEntries = [...esuGroups.entries()];

    if (groupEntries.length <= 1) {
      const assignBalanced = (esu) => {
        const candidates = getAssignableEsuHosts(etas, aioHost, esu.name)
          .map(host => {
            const state = hostState.get(host.ref) || { totalLoad: 0, esuType: null };
            if (state.esuType && state.esuType !== esu.name) return null;
            if (state.totalLoad >= host.limit) return null;
            return { ...host, load: state.totalLoad };
          })
          .filter(Boolean);

        candidates.sort((a, b) => {
          const aRatio = a.load / a.limit;
          const bRatio = b.load / b.limit;
          if (aRatio !== bRatio) return aRatio - bRatio;
          if (a.load !== b.load) return a.load - b.load;
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.ref.idx - b.ref.idx;
        });

        const chosen = candidates[0] || null;
        if (!chosen) {
          esuAssignments.push({ esu, host: { type: 'orphan', ref: null } });
          return;
        }

        const state = hostState.get(chosen.ref);
        state.totalLoad += 1;
        state.esuType = esu.name;
        esuAssignments.push({ esu, host: { type: chosen.type, ref: chosen.ref } });
      };

      esus.forEach(assignBalanced);
      return { eca, exa, sensor, ids, efc, etas, esus, esuAssignments };
    }

    groupEntries.sort((a, b) => {
      const [aName, aEsus] = a;
      const [bName, bEsus] = b;
      const aHosts = getAssignableEsuHosts(etas, aioHost, aName);
      const bHosts = getAssignableEsuHosts(etas, aioHost, bName);
      if (aHosts.length !== bHosts.length) return aHosts.length - bHosts.length;
      if (aEsus.length !== bEsus.length) return bEsus.length - aEsus.length;
      return aName.localeCompare(bName);
    });

    for (let groupIndex = 0; groupIndex < groupEntries.length; groupIndex++) {
      const [esuName, group] = groupEntries[groupIndex];
      const reservedForLater = reserveHostsForRemainingEsuGroups(groupEntries, groupIndex + 1, hostState, etas, aioHost);
      const hostPool = [];
      let hostPoolCapacity = 0;
      const candidateHosts = getAssignableEsuHosts(etas, aioHost, esuName)
        .map(host => {
          const state = hostState.get(host.ref) || { totalLoad: 0, esuType: null };
          const sameType = state.esuType === esuName;
          const empty = state.esuType == null;
          if (!sameType && !empty) return null;
          if (state.totalLoad >= host.limit) return null;
          return {
            ...host,
            load: state.totalLoad,
            sameType,
            reservedForLater: reservedForLater.has(host.ref),
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.sameType !== b.sameType) return a.sameType ? -1 : 1;
          if (a.reservedForLater !== b.reservedForLater) return a.reservedForLater ? 1 : -1;
          if (a.priority !== b.priority) return a.priority - b.priority;
          if (a.ref.idx !== b.ref.idx) return a.ref.idx - b.ref.idx;
          return a.type.localeCompare(b.type);
        });

      for (const host of candidateHosts) {
        if (host.reservedForLater && hostPoolCapacity >= group.length) break;
        hostPool.push(host);
        hostPoolCapacity += host.limit - host.load;
      }

      for (const esu of group) {
        const candidates = hostPool
          .map(host => {
            const state = hostState.get(host.ref) || { totalLoad: 0, esuType: null };
            if (state.totalLoad >= host.limit) return null;
            const sameType = state.esuType === esuName;
            const empty = state.esuType == null;
            if (!sameType && !empty) return null;
            return {
              ...host,
              load: state.totalLoad,
              sameType,
              empty,
            };
          })
          .filter(Boolean);

        candidates.sort((a, b) => {
          const aRatio = a.load / a.limit;
          const bRatio = b.load / b.limit;
          if (aRatio !== bRatio) return aRatio - bRatio;
          if (a.load !== b.load) return a.load - b.load;
          if (a.empty !== b.empty) return a.empty ? -1 : 1;
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.ref.idx - b.ref.idx;
        });

        const chosen = candidates[0] || null;
        if (!chosen) {
          esuAssignments.push({ esu, host: { type: 'orphan', ref: null } });
          continue;
        }

        const state = hostState.get(chosen.ref);
        state.totalLoad += 1;
        state.esuType = esuName;
        esuAssignments.push({ esu, host: { type: chosen.type, ref: chosen.ref } });
      }
    }

    return { eca, exa, sensor, ids, efc, etas, esus, esuAssignments };
  }

  function computeCompatibilityWarnings(stack, catalog) {
    const warns = [];
    const items = getStackItems(stack, catalog);

    const tracks = getTrackSet(items);
    if (tracks.has('enterprise_only') && tracks.has('rx360_only')) {
      warns.push('Mixed track limits: stack contains Enterprise-only and Reveal(x) 360-only components. These cannot coexist in a single deployment.');
    }

    const topology = planTopology(items);
    const orphanedEsus = topology.esuAssignments.filter(x => x.host.type === 'orphan');
    if (orphanedEsus.length) {
      const counts = new Map();
      orphanedEsus.forEach(({ esu }) => counts.set(esu.name, (counts.get(esu.name) || 0) + 1));
      counts.forEach((count, esuName) => {
        warns.push(`${esuName} has ${count} unattached unit${count !== 1 ? 's' : ''}. Add compatible ETA/AIO capacity or reduce ESU quantity.`);
      });
    }

    const eol = items.filter(x => x.sale_status === 'end_of_sale');
    if (eol.length) {
      warns.push(`End-of-sale items in stack: ${eol.map(x => x.name).join(', ')}. Plan for lifecycle replacement.`);
    }

    return warns;
  }

  return {
    SENSOR_PLATFORMS,
    SINGLETON_PLATFORMS,
    getStackItems,
    normalizeQuantity,
    normalizeStackEntries,
    canAddToStack,
    addStackItem,
    removeStackItem,
    changeStackItemQty,
    computeStackTotals,
    computeCompatibilityWarnings,
    computeStorageCapacityTb,
    getEsuAttachmentLimit,
    getAssignableEsuHosts,
    formatTopologyInstanceName,
    reserveHostsForRemainingEsuGroups,
    planTopology,
  };
});
