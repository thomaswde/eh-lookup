(function initExportView(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  function getTopologyModule() {
    return isNode ? require('./topology-view.js') : root.EHTopologyView;
  }
  if (!isNode && !root.EHTopologyView && root.document?.currentScript) {
    const src = root.document.currentScript.getAttribute('src') || '';
    const topologySrc = src.replace(/[^/]*$/, 'topology-view.js') || './src/topology-view.js';
    root.document.write(`<script src="${topologySrc}"><\/script>`);
  }
  const api = factory(getTopologyModule);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EHExportView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildExportView(getTopologyModule) {
  function createExportView(deps) {
    const {
      state,
      getCatalog,
      getStackItems,
      planTopology,
      computeStorageCapacityTb,
      formatTopologyInstanceName,
      platformMeta,
      moduleMeta,
      moduleKeys,
      deploymentKind,
      fmtNum,
      escapeHtml,
      escapeAttr,
    } = deps;
    const topologyModule = getTopologyModule();
    if (!topologyModule?.createTopologyView) {
      throw new Error('EHTopologyView must be loaded before createExportView is called.');
    }
    const topologyView = topologyModule.createTopologyView(deps);
    const {
      colorForPlatform,
      renderTopologyDiagram,
      layoutTopology,
      renderTopologySvg,
    } = topologyView;

    function catalog() {
      return getCatalog();
    }

    function renderStorageAttachmentMap(plan) {
      if (!plan.esuAssignments.length) return '';
    
      const rows = [];
      const grouped = new Map();
      plan.esuAssignments.forEach(({ esu, host }) => {
        const key = host.type === 'orphan'
          ? 'orphan'
          : `${host.type}:${formatTopologyInstanceName(host.ref)}`;
        if (!grouped.has(key)) grouped.set(key, { host, esus: [] });
        grouped.get(key).esus.push(formatTopologyInstanceName(esu));
      });
    
      plan.etas.forEach(eta => {
        const key = `eta:${formatTopologyInstanceName(eta)}`;
        const bucket = grouped.get(key);
        rows.push(`
          <li>
            <div class="xl-left">${escapeHtml(formatTopologyInstanceName(eta))}</div>
            <div class="xl-right">${bucket?.esus.length ? escapeHtml(bucket.esus.join(', ')) : 'No ESUs attached'}</div>
          </li>
        `);
      });
    
      if (plan.sensor?.item.platform === 'all_in_one') {
        const key = `aio:${formatTopologyInstanceName(plan.sensor)}`;
        const bucket = grouped.get(key);
        if (bucket?.esus.length) {
          rows.push(`
            <li>
              <div class="xl-left">${escapeHtml(formatTopologyInstanceName(plan.sensor))}</div>
              <div class="xl-right">${escapeHtml(bucket.esus.join(', '))}</div>
            </li>
          `);
        }
      }
    
      const orphanBucket = grouped.get('orphan');
      if (orphanBucket?.esus.length) {
        rows.push(`
          <li style="--plt-color:${colorForPlatform('extended_storage')}">
            <div class="xl-left">Unattached ESUs</div>
            <div class="xl-right">${escapeHtml(orphanBucket.esus.join(', '))}</div>
          </li>
        `);
      }
    
      return `
        <div class="export-section">
          <h2>Storage Attachment Map</h2>
          <ul class="export-list">
            ${rows.join('')}
          </ul>
        </div>
      `;
    }
    
    /* ============================================================
       EXPORT — one-pager
       ============================================================ */
    
    function buildExportContent() {
      const t = computeStackTotals();
      const items = getStackItems(state.stack, catalog());
      const topology = planTopology(items);
      const name = state.stackName?.trim() || 'ExtraHop Reference Solution';
      const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const notesHtml = escapeHtml(state.stackNotes || '').replace(/\n/g, '<br>');
    
      // Group for display
      const groups = {};
      for (const it of items) {
        const g = platformMeta(it.platform).group;
        (groups[g] ||= []).push(it);
      }
      const orderedGroups = Object.entries(groups).sort(
        (a, b) => platformMeta(a[1][0].platform).order - platformMeta(b[1][0].platform).order
      );
    
      // Summary line
      const totalUnits = items.reduce((n, x) => n + x.__qty, 0);
      const summary = `${totalUnits} appliance${totalUnits !== 1 ? 's' : ''} · ${t.throughput} Gbps analysis${t.pcapTb ? ' · ' + t.pcapTb + ' TB PCAP' : ''}`;
    
      // Topology SVG — simple reference diagram grouped by role
      const svg = renderTopologyDiagram(items, { showConnections: state.exportShowConnections });
      const storageAttachmentMap = renderStorageAttachmentMap(topology);
    
      const body = `
        <div class="export-root" id="export-root">
          <div class="export-head">
            <div class="brand">
              <svg viewBox="0 0 223.8 22.1" style="height:22px" aria-hidden="true"><path fill="#261F63" d="M0,0h15.9v5.1h-10v3.4h8.2v4.8H5.8V17h10.7v5.1H0V0z M26.9,10.8L19.4,0h7.2l3.7,5.7L33.8,0h6.5l-6.8,10.2 L41.8,22h-7.3L30,15.3l-4.3,6.8h-6.4L26.9,10.8z M49.3,5.1h-6.8V0h19.4v5.1h-6.7V22h-5.9V5.1z M66,0h9.1c1.2,0,2.3,0.2,3.2,0.5 c1,0.3,1.8,0.8,2.5,1.4s1.2,1.4,1.6,2.3S83,6.1,83,7.3c0,1.5-0.3,2.7-1,3.8c-0.6,1.1-1.5,1.9-2.5,2.6l4.7,8.5h-6.3l-3.7-7.5h-2.4 v7.5H66V0z M74.5,10c0.8,0,1.4-0.2,1.9-0.7s0.7-1.1,0.7-1.9s-0.2-1.5-0.7-2s-1.1-0.7-1.9-0.7h-2.8V10H74.5z M94.2,0h6.7l7.8,22 h-6.3l-1.4-4.6h-7.4L92.1,22h-6L94.2,0z M99.8,13.2l-2.4-8.1l-2.5,8.1H99.8z M112.7,0h5.8v8.1h13V0h5.8v22h-5.8v-8.6h-13V22h-5.8V0 z M153.2,22c-1.6,0-3-0.3-4.4-0.8c-1.3-0.6-2.5-1.3-3.5-2.3s-1.7-2.1-2.3-3.5c-0.5-1.4-0.8-2.8-0.8-4.4s0.3-3.1,0.8-4.4 c0.5-1.4,1.3-2.5,2.3-3.5s2.1-1.7,3.5-2.3c1.3-0.5,2.8-0.8,4.4-0.8H166c1.6,0,3,0.3,4.4,0.8c1.3,0.6,2.5,1.3,3.5,2.3 s1.7,2.1,2.3,3.5C176.7,8,177,9.4,177,11s-0.3,3.1-0.8,4.4c-0.5,1.4-1.3,2.5-2.3,3.5s-2.1,1.7-3.5,2.3c-1.3,0.5-2.8,0.8-4.4,0.8 C166,22,153.2,22,153.2,22z M166.1,16.8c0.8,0,1.5-0.2,2.2-0.5c0.6-0.3,1.2-0.7,1.6-1.2c0.4-0.5,0.8-1.1,1-1.9 c0.2-0.7,0.3-1.5,0.3-2.3s-0.1-1.5-0.3-2.3c-0.2-0.7-0.6-1.3-1-1.9c-0.4-0.5-1-0.9-1.6-1.2S166.9,5,166.1,5h-12.8 c-0.8,0-1.5,0.2-2.2,0.5c-0.6,0.3-1.2,0.7-1.6,1.2c-0.4,0.5-0.8,1.1-1,1.9c-0.2,0.7-0.3,1.5-0.3,2.3s0.1,1.5,0.3,2.3 c0.2,0.7,0.6,1.3,1,1.9c0.4,0.5,1,0.9,1.6,1.2c0.6,0.3,1.4,0.5,2.2,0.5H166.1z M181.9,0h25.2c1.2,0,2.3,0.2,3.2,0.5 c1,0.3,1.8,0.8,2.5,1.4s1.2,1.4,1.6,2.3c0.4,0.9,0.6,2,0.6,3.2c0,1.1-0.2,2.1-0.6,3.1c-0.4,0.9-0.9,1.7-1.6,2.3 c-0.7,0.7-1.5,1.1-2.4,1.5c-0.9,0.3-2,0.5-3.1,0.5h-19.7v7.3h-5.7V0z M206.7,10.1c0.8,0,1.4-0.3,1.9-0.8s0.7-1.2,0.7-1.9 c0-0.8-0.2-1.5-0.7-2c-0.4-0.5-1.1-0.8-1.9-0.8h-19v5.5H206.7z"/></svg>
              <h1>Architecture One-Pager</h1>
            </div>
            <div class="stack-meta">
              <div>${dateStr}</div>
              <div>Reference Build</div>
            </div>
          </div>
    
          <div class="export-lozenge">
            <span class="x-name">${escapeHtml(name)}</span>
            <span class="x-sep"></span>
            <span class="x-summary">${escapeHtml(summary)}</span>
          </div>
    
          <div class="export-stats">
            <div class="export-stat"><div class="xs-label">Aggregate Throughput</div><div class="xs-value">${t.throughput}<span class="unit">Gbps</span></div></div>
            <div class="export-stat"><div class="xs-label">IDS Coverage</div><div class="xs-value">${t.ids}<span class="unit">Gbps</span></div></div>
            <div class="export-stat"><div class="xs-label">Advanced Analysis</div><div class="xs-value">${fmtNum(t.advanced)}<span class="unit">dev</span></div></div>
            <div class="export-stat"><div class="xs-label">Standard Analysis</div><div class="xs-value">${fmtNum(t.standard)}<span class="unit">dev</span></div></div>
            <div class="export-stat"><div class="xs-label">PCAP Storage</div><div class="xs-value">${t.pcapTb}<span class="unit">TB</span></div></div>
            <div class="export-stat"><div class="xs-label">Rack Footprint</div><div class="xs-value">${t.rackU}<span class="unit">U</span></div></div>
            <div class="export-stat"><div class="xs-label">Power Budget</div><div class="xs-value">${fmtNum(t.power)}<span class="unit">W</span></div></div>
            <div class="export-stat"><div class="xs-label">Appliances</div><div class="xs-value">${totalUnits}<span class="unit">total</span></div></div>
          </div>
    
          <div class="export-diagram">
            <h2>Reference Topology</h2>
            ${svg}
          </div>
    
          ${storageAttachmentMap}
    
          ${orderedGroups.map(([groupName, arr]) => {
            const accent = platformMeta(arr[0].platform).accent;
            return `
              <div class="export-section">
                <h2>${escapeHtml(groupName)}</h2>
                <ul class="export-list">
                  ${arr.map(it => {
                    const p = it.performance || {};
                    const bits = [];
                    if (p.base_gbps != null && p.base_gbps > 0) bits.push(`${p.base_gbps} Gbps`);
                    if (p.flows_per_second) bits.push(`${fmtNum(p.flows_per_second)} flows/s`);
                    if (it.form_factor?.rack_units) bits.push(`${it.form_factor.rack_units}U`);
                    bits.push(deploymentKind(it));
                    const mods = moduleKeys(it).map(m => `<span class="xl-tag">${escapeHtml(moduleMeta(m).label)}</span>`).join(' ');
                    return `<li style="--plt-color:${accent}">
                      <div class="xl-left">${it.__qty}× ${escapeHtml(it.name)} ${mods}</div>
                      <div class="xl-right">${escapeHtml(bits.join(' · '))}</div>
                    </li>`;
                  }).join('')}
                </ul>
              </div>
            `;
          }).join('')}
    
          <div class="export-section">
            <h2>Notes &amp; Assumptions</h2>
            <p style="margin:0;color:var(--eh-ink-soft);font-size:13px;line-height:1.55;min-height:1.55em">${notesHtml}</p>
          </div>
    
          <div class="export-foot">
            <div>ExtraHop Product Catalog · Stack Builder</div>
            <div>Generated ${dateStr}</div>
          </div>
        </div>
      `;
      return body;
    }
    
    function computeStackTotals() {
        return deps.computeStackTotals();
      }
    
    function getExportStyles() {
      return `
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;800;900&display=swap');
          body { font-family: 'Source Sans 3', Arial, sans-serif; color: #15103A; background: #FAFAFC; margin: 0; padding: 24px; }
          .export-root { background: white; padding: 42px 56px; max-width: 860px; margin: 0 auto; font-size: 13.5px; line-height: 1.5; border: 1px solid #E3E1EC; border-radius: 16px; box-shadow: 0 10px 40px -10px rgba(21,16,58,0.2); }
          .export-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #261F63; padding-bottom: 14px; margin-bottom: 20px; }
          .export-head .brand { display: flex; align-items: center; gap: 12px; }
          .export-head h1 { font-size: 24px; font-weight: 900; margin: 0; color: #261F63; letter-spacing: -0.01em; }
          .export-head .stack-meta { text-align: right; font-size: 11px; color: #6B6880; text-transform: uppercase; letter-spacing: 0.08em; }
          .export-lozenge { background: linear-gradient(135deg, #261F63 0%, #7F2854 100%); color: white; padding: 14px 22px; border-radius: 999px; display: inline-flex; align-items: center; gap: 14px; margin-bottom: 18px; }
          .export-lozenge .x-name { font-size: 22px; font-weight: 900; }
          .export-lozenge .x-sep { width: 1px; height: 22px; background: rgba(255,255,255,0.5); }
          .export-lozenge .x-summary { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 600; opacity: 0.9; }
          .export-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
          .export-stat { border: 1.5px solid #261F63; padding: 10px 14px; border-radius: 8px; }
          .export-stat .xs-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B6880; font-weight: 700; }
          .export-stat .xs-value { font-size: 20px; font-weight: 900; color: #261F63; margin-top: 2px; }
          .export-stat .xs-value .unit { font-size: 10px; font-weight: 500; color: #6B6880; margin-left: 3px; }
          .export-section { margin-bottom: 18px; }
          .export-section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: #7F2854; font-weight: 800; margin: 0 0 8px; padding-bottom: 5px; border-bottom: 1px solid #E3E1EC; }
          .export-list { list-style: none; padding: 0; margin: 0; }
          .export-list li { display: flex; justify-content: space-between; gap: 14px; padding: 7px 10px; border-left: 3px solid var(--plt-color, #261F63); margin-bottom: 4px; background: #FAFAFC; border-radius: 0 4px 4px 0; font-size: 13px; }
          .export-list li .xl-left { font-weight: 700; color: #15103A; }
          .export-list li .xl-tag { font-size: 10px; padding: 1px 7px; border-radius: 999px; background: rgba(38,31,99,0.1); color: #261F63; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; margin-left: 4px; }
          .export-list li .xl-right { font-size: 11px; color: #6B6880; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
          .export-foot { margin-top: 24px; padding-top: 14px; border-top: 1px solid #E3E1EC; color: #6B6880; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; display: flex; justify-content: space-between; }
          .export-diagram { background: #FAFAFC; border-radius: 10px; padding: 16px 18px; border: 1px solid #E3E1EC; margin-bottom: 18px; }
          .export-diagram h2 { border-bottom: none; padding-bottom: 0; margin-bottom: 12px; }
          .diagram-svg { width: 100%; height: auto; }
          @media print { body { padding: 0; background: white; } .export-root { border: none; box-shadow: none; padding: 20px 30px; max-width: none; } }
        </style>
      `;
    }

    function buildExportDocument(content, title, tailScript = '') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${getExportStyles()}</head><body>${content}${tailScript}</body></html>`;
    }
    

    return {
      renderStorageAttachmentMap,
      buildExportContent,
      renderTopologyDiagram,
      layoutTopology,
      renderTopologySvg,
      getExportStyles,
      buildExportDocument,
    };
  }

  return { createExportView };
});
