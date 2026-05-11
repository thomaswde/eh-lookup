(function initStackView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EHStackView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildStackView() {
  function createStackView(deps) {
    const {
      state,
      getItem,
      normalizeStackEntries,
      computeStackTotals,
      computeCompatibilityWarnings,
      platformMeta,
      accentForPlatform,
      deploymentKind,
      fmtNum,
      escapeHtml,
      escapeAttr,
      onAdd,
      onRemove,
      onChangeQty,
    } = deps;

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function updateFabCount() {
      const el = document.getElementById('fab-count');
      if (!el) return;
      const total = normalizeStackEntries(state.stack).reduce((n, s) => n + s.qty, 0);
      el.textContent = String(total);
      el.style.display = total ? '' : 'none';
    }

    function isDrawerMode() {
      return window.matchMedia('(max-width: 900px)').matches;
    }

    function openDrawer() {
      document.body.classList.add('stack-builder-open');
      document.getElementById('stack-panel')?.classList.add('open');
      if (isDrawerMode()) document.getElementById('stack-scrim')?.classList.add('open');
      const fab = document.getElementById('stack-fab');
      if (fab) fab.setAttribute('aria-expanded', 'true');
    }

    function closeDrawer() {
      document.body.classList.remove('stack-builder-open');
      document.getElementById('stack-panel')?.classList.remove('open');
      document.getElementById('stack-scrim')?.classList.remove('open');
      const fab = document.getElementById('stack-fab');
      if (fab) fab.setAttribute('aria-expanded', 'false');
    }

    function toggleDrawer() {
      const panel = document.getElementById('stack-panel');
      if (!panel) return;
      panel.classList.contains('open') ? closeDrawer() : openDrawer();
    }

    function syncDrawerCloseVisibility() {
      const btn = document.getElementById('drawer-close');
      if (!btn) return;
      const isOpen = document.body.classList.contains('stack-builder-open');
      btn.style.display = isOpen ? '' : 'none';
      const scrim = document.getElementById('stack-scrim');
      if (!scrim) return;
      if (isOpen && isDrawerMode()) scrim.classList.add('open');
      else scrim.classList.remove('open');
    }

    function pulseTotals() {
      $$('.total-metric').forEach(el => {
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
        setTimeout(() => el.classList.remove('pulse'), 360);
      });
    }

    function wireDropZone(zone) {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/eh-item');
        if (id) onAdd(id);
      });
    }

    function render() {
      $('#stack-name').value = state.stackName || '';
      $('#stack-notes').value = state.stackNotes || '';
      const body = $('#stack-body');
      body.innerHTML = '';

      if (!state.stack.length) {
        const drop = document.createElement('div');
        drop.className = 'drop-zone';
        drop.id = 'drop-zone';
        drop.innerHTML = '<strong>Drop appliances here</strong>Start with one EDA or ECA - add EXA, ETAs, ESUs, IDS, or EFC as needed';
        wireDropZone(drop);
        body.appendChild(drop);
      } else {
        const groups = {};
        for (const entry of state.stack) {
          const item = getItem(entry.id);
          if (!item) continue;
          const g = platformMeta(item.platform).group;
          (groups[g] ||= []).push({ entry, item });
        }
        const orderedGroups = Object.entries(groups).sort(
          (a, b) => platformMeta(a[1][0].item.platform).order - platformMeta(b[1][0].item.platform).order
        );

        orderedGroups.forEach(([groupName, arr]) => {
          const section = document.createElement('div');
          section.className = 'stack-section';
          const accent = platformMeta(arr[0].item.platform).accent;
          const unitTotal = arr.reduce((n, x) => n + x.entry.qty, 0);
          const nodesHtml = arr.map(({ entry, item }) => {
            const perf = item.performance || {};
            const bits = [];
            if (perf.base_gbps != null && perf.base_gbps > 0) bits.push(`${perf.base_gbps} Gbps`);
            const kind = deploymentKind(item);
            if (kind === 'Physical' && item.form_factor?.rack_units) bits.push(`${item.form_factor.rack_units}U`);
            if (kind !== 'Physical') bits.push(kind);
            if (item.sale_status === 'end_of_sale') bits.push('EOS');
            return `
              <div class="stack-node" style="--plt-color:${accentForPlatform(item.platform)}">
                <button class="remove-btn" data-rm="${escapeAttr(item.name)}" aria-label="Remove">&times;</button>
                <div class="stack-node-info">
                  <div class="stack-node-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
                  <div class="stack-node-meta">${bits.map(b => `<span>${escapeHtml(b)}</span>`).join('<span>&middot;</span>')}</div>
                </div>
                <div class="stack-node-qty">
                  <button data-dec="${escapeAttr(item.name)}" aria-label="Decrease">&minus;</button>
                  <span class="qty-num">${entry.qty}</span>
                  <button data-inc="${escapeAttr(item.name)}" aria-label="Increase">+</button>
                </div>
              </div>
            `;
          }).join('');
          section.innerHTML = `
            <div class="stack-section-title" style="--plt-color:${accent}">${escapeHtml(groupName)} <span style="color:var(--eh-gray);font-weight:600;margin-left:auto">${unitTotal} unit${unitTotal !== 1 ? 's' : ''}</span></div>
            <div class="stack-section-nodes">${nodesHtml}</div>
          `;
          body.appendChild(section);
        });

        const warns = computeCompatibilityWarnings();
        if (warns.length) {
          const w = document.createElement('div');
          w.className = 'stack-compat-warn';
          w.innerHTML = `<strong>Compatibility notes</strong><br>${warns.map(x => '- ' + escapeHtml(x)).join('<br>')}`;
          body.appendChild(w);
        }
      }

      const t = computeStackTotals();
      const totals = [
        { label: 'Throughput', value: t.throughput, unit: 'Gbps', accent: 'var(--eh-cyan)' },
        { label: 'IDS', value: t.ids, unit: 'Gbps', accent: 'var(--eh-tangerine)' },
        { label: 'Advanced Analysis', value: fmtNum(t.advanced), unit: 'devices', accent: 'var(--eh-sapphire)' },
        { label: 'Standard Analysis', value: fmtNum(t.standard), unit: 'devices', accent: 'var(--eh-plum)' },
        { label: 'Sensors', value: t.sensorCount, unit: '', accent: 'var(--eh-cyan)' },
        { label: 'Rack Units', value: t.rackU, unit: 'U', accent: 'var(--eh-gray)' },
        { label: 'Power', value: fmtNum(t.power), unit: 'W', accent: 'var(--eh-tangerine)' },
        { label: 'PCAP Storage', value: t.pcapTb, unit: 'TB', accent: 'var(--eh-plum)' },
      ];
      if (t.flowsPerSec > 0) totals.push({ label: 'Flows/sec', value: fmtNum(t.flowsPerSec), unit: '', accent: '#7FA800' });
      if (t.ingestRps > 0) totals.push({ label: 'Record Ingest', value: fmtNum(t.ingestRps), unit: '/s', accent: 'var(--eh-magenta)' });

      $('#stack-totals-grid').innerHTML = totals.map(tt => `
        <div class="total-metric" style="--metric-accent:${tt.accent}">
          <div class="tm-label">${tt.label}</div>
          <div class="tm-value">${tt.value}${tt.unit ? `<span class="unit">${tt.unit}</span>` : ''}</div>
        </div>
      `).join('');

      body.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => onRemove(b.dataset.rm)));
      body.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => onChangeQty(b.dataset.inc, +1)));
      body.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => onChangeQty(b.dataset.dec, -1)));
    }

    function wirePanelDropTarget() {
      const panel = $('#stack-panel');
      if (!panel) return;
      panel.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('text/eh-item')) {
          e.preventDefault();
          $('#drop-zone')?.classList.add('drag-over');
          $('#stack-body')?.classList.add('drag-over-body');
        }
      });
      panel.addEventListener('dragleave', (e) => {
        if (!panel.contains(e.relatedTarget)) {
          $('#drop-zone')?.classList.remove('drag-over');
          $('#stack-body')?.classList.remove('drag-over-body');
        }
      });
      panel.addEventListener('drop', (e) => {
        const id = e.dataTransfer.getData('text/eh-item');
        if (id) {
          e.preventDefault();
          onAdd(id);
          $('#drop-zone')?.classList.remove('drag-over');
          $('#stack-body')?.classList.remove('drag-over-body');
        }
      });
    }

    return {
      render,
      pulseTotals,
      updateFabCount,
      isDrawerMode,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      syncDrawerCloseVisibility,
      wirePanelDropTarget,
    };
  }

  return { createStackView };
});
