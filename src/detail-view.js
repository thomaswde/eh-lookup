(function initDetailView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EHDetailView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildDetailView() {
  function createDetailView(deps) {
    const {
      state,
      getItem,
      sensorPlatforms,
      singletonPlatforms,
      computeStorageCapacityTb,
      platformMeta,
      moduleMeta,
      accentForPlatform,
      moduleKeys,
      prettyStatus,
      isPhysical,
      fmtNum,
      escapeHtml,
      escapeAttr,
      escapeUrl,
    } = deps;

    const $ = (sel, root = document) => root.querySelector(sel);
    let activeItem = null;

    const statIcons = {
      throughput: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/><path d="M9 20h6"/></svg>',
      ids: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.4-2.8 7.8-7 10-4.2-2.2-7-5.6-7-10V6l7-3z"/><path d="M9 12l2 2 4-5"/></svg>',
      packets: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-7 4 14 2-7h4"/></svg>',
      advanced: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M5.6 5.6l2.1 2.1"/><path d="M16.3 16.3l2.1 2.1"/><path d="M18.4 5.6l-2.1 2.1"/><path d="M7.7 16.3l-2.1 2.1"/></svg>',
      standard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5"/><path d="M5 19h14"/><path d="M9 15v-4"/><path d="M13 15V8"/><path d="M17 15v-2"/></svg>',
      ti: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/><path d="M11 8v3l2 2"/></svg>',
      flows: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9a4 4 0 0 1 4 4v6"/><path d="M14 14l3 3 3-3"/><path d="M4 17h6"/></svg>',
      ingest: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 20h14"/></svg>',
      storage: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>',
      rack: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h8"/></svg>',
      power: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 14h7l-1 8 8-12h-7l1-8z"/></svg>',
    };

    function statIconMarkup(stat) {
      const icon = statIcons[stat.icon];
      if (icon) return icon;
      return `<span>${escapeHtml(stat.fallbackIcon || stat.icon || '')}</span>`;
    }

    function deploymentBadge(item) {
      if (isPhysical(item)) return 'Physical appliance';
      const dep = item.deployments || {};
      const parts = [];
      if (dep.hypervisors?.length) parts.push('Virtual: ' + dep.hypervisors.join(', '));
      if (dep.clouds?.length) parts.push('Cloud: ' + dep.clouds.map(c => c.toUpperCase()).join(', '));
      return parts.join(' / ') || 'Virtual';
    }

    function renderDetailBody(item) {
      const perf = item.performance || {};
      const ff = item.form_factor || {};
      const stats = [];
      const accent = accentForPlatform(item.platform);
      if (perf.base_gbps != null) stats.push({ label: 'Throughput', value: perf.base_gbps, unit: 'Gbps', color: accent, icon: 'throughput', fallbackIcon: 'Gb' });
      if (perf.ids_gbps != null && perf.ids_gbps > 0) stats.push({ label: 'IDS Throughput', value: perf.ids_gbps, unit: 'Gbps', color: 'var(--eh-tangerine)', icon: 'ids', fallbackIcon: 'IDS' });
      if (perf.base_packetrate != null) stats.push({ label: 'Packet Rate', value: fmtNum(perf.base_packetrate), unit: 'pps', color: 'var(--eh-cyan)', icon: 'packets', fallbackIcon: 'Pkt' });
      if (perf.advanced_analysis != null) stats.push({ label: 'Advanced Analysis', value: fmtNum(perf.advanced_analysis), unit: 'devices', color: 'var(--eh-sapphire)', icon: 'advanced', fallbackIcon: 'AA' });
      if (perf.standard_analysis != null) stats.push({ label: 'Standard Analysis', value: fmtNum(perf.standard_analysis), unit: 'devices', color: 'var(--eh-plum)', icon: 'standard', fallbackIcon: 'SA' });
      if (perf.ti_observable != null) stats.push({ label: 'TI Observables', value: fmtNum(perf.ti_observable), unit: '', color: 'var(--eh-magenta)', icon: 'ti', fallbackIcon: 'TI' });
      if (perf.flows_per_second != null) stats.push({ label: 'Flows / sec', value: fmtNum(perf.flows_per_second), unit: '', color: '#7FA800', icon: 'flows', fallbackIcon: 'Flow' });
      if (perf.ingest_records_per_sec != null) stats.push({ label: 'Ingest Records', value: fmtNum(perf.ingest_records_per_sec), unit: '/s', color: 'var(--eh-magenta)', icon: 'ingest', fallbackIcon: 'In' });
      const cap = computeStorageCapacityTb(item);
      if (cap > 0) stats.push({ label: 'PCAP Capacity', value: cap, unit: 'TB', color: 'var(--eh-plum)', icon: 'storage', fallbackIcon: 'TB' });
      if (ff.rack_units != null) stats.push({ label: 'Rack Units', value: ff.rack_units, unit: 'U', color: 'var(--eh-gray)', icon: 'rack', fallbackIcon: 'RU' });
      if (ff.power_watts != null) stats.push({ label: 'Power', value: ff.power_watts, unit: 'W', color: 'var(--eh-tangerine)', icon: 'power', fallbackIcon: 'W' });

      const statCards = stats.slice(0, 8).map(s => `
        <div class="detail-stat" style="--stat-accent:${s.color}">
          <div class="ds-icon" style="background:${s.color}">${statIconMarkup(s)}</div>
          <div class="ds-label">${escapeHtml(s.label)}</div>
          <div class="ds-value">${escapeHtml(s.value)}${s.unit ? `<span class="unit">${escapeHtml(s.unit)}</span>` : ''}</div>
        </div>
      `).join('');

      const skus = item.skus || {};
      const identRows = [];
      if (skus.enterprise) identRows.push({ l: 'Enterprise SKU', v: skus.enterprise, mono: true });
      if (skus.rx360) identRows.push({ l: 'Reveal(x) 360 SKU', v: skus.rx360, mono: true });
      identRows.push({ l: 'Generation', v: item.generation !== undefined ? 'Gen ' + item.generation : '-' });
      identRows.push({ l: 'Deployment', v: deploymentBadge(item) });
      identRows.push({ l: 'Sale Status', v: prettyStatus(item.sale_status || '-') });
      if (item.firmware_end_date) identRows.push({ l: 'Firmware End Date', v: item.firmware_end_date });
      if (item.support_end_date) identRows.push({ l: 'Support End Date', v: item.support_end_date });
      if (item.engine) identRows.push({ l: 'Engine', v: `${item.engine.name} v${item.engine.version}` });

      let interfacesHtml = '';
      const ifs = item.interfaces || {};
      const mgmt = ifs.management || [];
      const capIf = ifs.capture || [];
      if (mgmt.length || capIf.length) {
        const allPorts = [...mgmt.map(p => ({ ...p, _kind: 'mgmt' })), ...capIf.map(p => ({ ...p, _kind: 'capture' }))];
        interfacesHtml = `
          <div class="section-block">
            <div class="section-head">
              <h3>Interfaces</h3>
              <div class="eyebrow">${allPorts.length} ports &middot; ${mgmt.length} mgmt &middot; ${capIf.length} capture</div>
            </div>
            <div class="capture-ring">
              ${allPorts.map(p => `
                <div class="port-slot ${escapeAttr(p._kind)}">
                  <div class="port-num">${escapeHtml(p.id)}</div>
                  <div class="port-speed">${escapeHtml((p.supported_speeds_gb || []).map(s => s + 'G').join('/'))}</div>
                  <div>${escapeHtml(p.transceiver_type || '-')}</div>
                </div>
              `).join('')}
            </div>
            <table class="iface-table" style="margin-top:14px">
              <thead><tr><th>Port</th><th>Roles</th><th>Speeds</th><th>Transceiver</th><th>Inc.</th></tr></thead>
              <tbody>
                ${allPorts.map(p => `
                  <tr>
                    <td><strong>${escapeHtml(p.id)}</strong> <span style="color:var(--eh-muted);font-size:11px;text-transform:uppercase;margin-left:4px">${escapeHtml(p._kind)}</span></td>
                    <td>${(p.roles || []).map(r => `<span class="ifchip ${escapeAttr(String(r).toLowerCase())}">${escapeHtml(r)}</span>`).join(' ')}</td>
                    <td>${escapeHtml((p.supported_speeds_gb || []).map(s => s + 'G').join(' / '))}</td>
                    <td>${escapeHtml(p.transceiver_type || '-')}</td>
                    <td>${p.transceiver_included ? 'Yes' : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      let storageHtml = '';
      const st = item.storage || {};
      if (st.continuous_pcap || st.datastore) {
        const rows = [];
        const cp = st.continuous_pcap;
        if (cp) {
          if (cp.disk_qty) rows.push({ l: 'Onboard Disks', v: `${cp.disk_qty} x ${cp.disk_size_tb}TB (${cp.raid_level || ''})` });
          if (cp.capacity_tb) rows.push({ l: 'Onboard Capacity', v: cp.capacity_tb + ' TB' });
          if (cp.onboard) rows.push({ l: 'Onboard Storage', v: `${cp.onboard.disk_qty} x ${cp.onboard.disk_size_tb}TB @ ${cp.onboard.rpm || ''} RPM` });
          if (cp.virtual_disk) rows.push({ l: 'Virtual Disk', v: `${cp.virtual_disk.disk_qty} x ${cp.virtual_disk.disk_size_tb || cp.virtual_disk.max_disk_size_tb}TB` });
        }
        if (st.datastore?.exds?.protocols) rows.push({ l: 'External Datastore (EXDS)', v: st.datastore.exds.protocols.map(p => p.toUpperCase()).join(', ') });

        const rulesHtml = cp?.extended_pcap?.rules ? `
          <div style="margin-top:12px">
            <div class="kv-label" style="margin-bottom:6px">Extended PCAP - ESU Scaling</div>
            <table class="iface-table">
              <thead><tr><th>ESUs</th><th>Type</th><th>Throughput</th><th>Packets/sec</th></tr></thead>
              <tbody>
                ${cp.extended_pcap.rules.map(r => `
                  <tr>
                    <td><strong>${r.esu_count}x</strong></td>
                    <td>${escapeHtml(r.esu_type)}</td>
                    <td>${r.throughput_gbps} Gbps</td>
                    <td>${fmtNum(r.packets_per_second)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '';

        storageHtml = `
          <div class="section-block">
            <div class="section-head"><h3>Storage</h3></div>
            <div class="kv-grid">
              ${rows.map(r => `<div class="kv"><div class="kv-label">${escapeHtml(r.l)}</div><div class="kv-value">${escapeHtml(r.v)}</div></div>`).join('')}
            </div>
            ${rulesHtml}
          </div>
        `;
      }

      let compatHtml = '';
      const c = item.compatibility;
      if (c) {
        const parts = [];
        if (c.track_limits) parts.push(`<div class="kv"><div class="kv-label">Track Limits</div><div class="kv-value">${escapeHtml(c.track_limits.map(t => t.replace(/_/g, ' ')).join(' / '))}</div></div>`);
        if (c.allows) parts.push(`<div class="kv"><div class="kv-label">Attaches To</div><div class="kv-value">${escapeHtml(c.allows.join(', '))}</div></div>`);
        if (c.accepts_attachments) {
          const atts = c.accepts_attachments.map(a => {
            const models = a.models.map(m => `${m.model} (up to ${m.limit})`).join(', ');
            return `${a.type}: ${models}`;
          }).join('; ');
          parts.push(`<div class="kv"><div class="kv-label">Accepts Attachments</div><div class="kv-value">${escapeHtml(atts)}</div></div>`);
        }
        compatHtml = `
          <div class="section-block">
            <div class="section-head"><h3>Compatibility</h3></div>
            <div class="kv-grid">${parts.join('')}</div>
          </div>
        `;
      }

      const ingestHtml = item.ingest ? `
        <div class="section-block">
          <div class="section-head"><h3>Ingest</h3></div>
          <div class="kv-grid">
            <div class="kv"><div class="kv-label">Supported Protocols</div><div class="kv-value">${escapeHtml((item.ingest.supported_protocols || []).join(', ').toUpperCase())}</div></div>
          </div>
        </div>
      ` : '';

      const notesHtml = item.notes?.length ? `
        <div class="section-block">
          <div class="section-head"><h3>References</h3></div>
          <ul class="notes-list">
            ${item.notes.map(n => {
              const href = escapeUrl(n);
              return href
                ? `<li><a href="${escapeAttr(href)}" target="_blank" rel="noopener">${escapeHtml(n)}</a></li>`
                : `<li>${escapeHtml(n)}</li>`;
            }).join('')}
          </ul>
        </div>
      ` : '';

      return `
        <div class="detail-grid">${statCards}</div>
        <div class="section-block">
          <div class="section-head">
            <h3>Identifiers</h3>
            <div class="eyebrow">${escapeHtml(item.platform.replace(/_/g, ' '))}</div>
          </div>
          <div class="kv-grid">
            ${identRows.map(r => `<div class="kv"><div class="kv-label">${escapeHtml(r.l)}</div><div class="kv-value ${r.mono ? 'mono' : ''}">${escapeHtml(r.v || '-')}</div></div>`).join('')}
          </div>
        </div>
        ${(Object.keys(item.modules || {}).length)
          ? `<div class="section-block">
              <div class="section-head"><h3>Supported Modules</h3></div>
              <div class="tag-row">
                ${moduleKeys(item).map(m => {
                  const mm = moduleMeta(m);
                  return `<span class="tag" style="--tag-bg:${mm.color}1f;--tag-color:${mm.color};font-size:11.5px;padding:4px 10px">${escapeHtml(mm.label)} - ${escapeHtml(mm.description)}</span>`;
                }).join('')}
              </div>
             </div>`
          : ''}
        ${interfacesHtml}
        ${storageHtml}
        ${compatHtml}
        ${ingestHtml}
        ${notesHtml}
      `;
    }

    function open(name) {
      const item = getItem(name);
      if (!item) return;
      activeItem = item;
      const accent = accentForPlatform(item.platform);
      const platformLabel = platformMeta(item.platform).label;
      const statusClass = item.sale_status || 'unknown';
      const modules = moduleKeys(item);
      const header = $('#modal-header');
      header.style.background = `linear-gradient(135deg, ${accent} 0%, var(--eh-plum) 110%)`;
      header.innerHTML = `
        <div class="modal-header-inner">
          <div>
            <div class="modal-lozenge">${escapeHtml(platformLabel)}${item.generation !== undefined ? ' &middot; Gen ' + escapeHtml(item.generation) : ''}</div>
            <div class="modal-title">${escapeHtml(item.name)}</div>
            <div class="modal-subtitle">${escapeHtml(deploymentBadge(item))} &middot; ${escapeHtml(prettyStatus(statusClass))}</div>
            <div class="modal-header-tags">
              ${modules.map(m => `<span class="tag">${escapeHtml(moduleMeta(m).label)}</span>`).join('')}
              ${(item.compatibility?.track_limits || []).map(t => `<span class="tag">${escapeHtml(t.replace(/_/g, ' '))}</span>`).join('')}
            </div>
          </div>
          <button class="modal-close" id="modal-close-x">&times;</button>
        </div>
      `;

      $('#modal-body').innerHTML = renderDetailBody(item);
      const alreadyInStack = state.stack.find(s => s.id === item.name);
      $('#modal-add-btn').innerHTML = alreadyInStack
        ? (sensorPlatforms.has(item.platform) || singletonPlatforms.has(item.platform)
          ? '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> In Stack'
          : '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Add Another')
        : '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add to Stack';

      $('#modal-backdrop').classList.add('open');
      $('#modal-close-x').addEventListener('click', close);
    }

    function close() {
      $('#modal-backdrop').classList.remove('open');
      activeItem = null;
    }

    function getActiveItem() {
      return activeItem;
    }

    return {
      open,
      close,
      getActiveItem,
      deploymentBadge,
      renderDetailBody,
    };
  }

  return { createDetailView };
});
