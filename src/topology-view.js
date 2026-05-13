(function initTopologyView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EHTopologyView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildTopologyView() {
  function createTopologyView(deps) {
    const {
      planTopology,
      computeStorageCapacityTb,
      formatTopologyInstanceName,
      deploymentKind,
      escapeHtml,
    } = deps;

    function colorForPlatform(platform) {
      const m = {
        packet_sensor: '#00AAEF',
        multifunction_sensor: '#007FAF',
        all_in_one: '#5B2F8E',
        ids_standalone: '#F05918',
        flow_collector: '#7FA800',
        packetstore: '#7F2854',
        extended_storage: '#898A8D',
        command: '#261F63',
        recordstore: '#EC0889',
      };
      return m[platform] || '#261F63';
    }
    
    function renderAppNode(x, y, w, h, opts) {
      // opts: { title, subtitle, accent, ribbon, dim, dashed }
      const accent = opts.accent || '#261F63';
      const dim = !!opts.dim;
      const ribbon = opts.ribbon || '';
      const dashed = !!opts.dashed;
      const title = escapeHtml(opts.title || '');
      const subtitle = escapeHtml(opts.subtitle || '');
      const textLeft = 22;
      // Text positions adapt to box height so 1U (~38px) boxes don't overflow
      const hasSub = !!subtitle;
      const titleY = hasSub ? Math.max(16, h / 2 - 3) : h / 2 + 4;
      const subY = hasSub ? Math.min(h - 7, titleY + 15) : 0;
      return `
        <g transform="translate(${x}, ${y})" opacity="${dim ? 0.55 : 1}">
          <rect x="0" y="0" width="${w}" height="${h}" rx="10"
                fill="white" stroke="${accent}" stroke-width="1.6" ${dashed ? 'stroke-dasharray="6 4"' : ''} filter="url(#eh-shadow)"/>
          <rect x="7" y="7" width="4" height="${Math.max(0, h - 14)}" rx="2" fill="${accent}"/>
          ${ribbon ? `
            <g transform="translate(${w - 8}, 8)">
              <rect x="-44" y="0" width="44" height="15" rx="7.5" fill="${accent}"/>
              <text x="-22" y="10.5" text-anchor="middle" font-family="Source Sans 3"
                    font-weight="800" font-size="9" fill="white" letter-spacing="0.8">${ribbon}</text>
            </g>` : ''}
          <text x="${textLeft}" y="${titleY}" text-anchor="start" font-family="Source Sans 3"
                font-weight="800" font-size="12.5" fill="#15103A">${title}</text>
          ${hasSub ? `<text x="${textLeft}" y="${subY}" text-anchor="start" font-family="Source Sans 3"
                font-size="10.5" fill="#6B6880">${subtitle}</text>` : ''}
        </g>
      `;
    }
    
    function renderConsoleNode(x, y, w, h, opts) {
      const dim = !!opts.dim;
      const title = escapeHtml(opts.title || '');
      const subtitle = escapeHtml(opts.subtitle || '');
      const textLeft = 22;
      const titleY = Math.max(16, h / 2 - 3);
      const subY = Math.min(h - 7, titleY + 15);
      return `
        <g transform="translate(${x}, ${y})" opacity="${dim ? 0.55 : 1}">
          <rect x="0" y="0" width="${w}" height="${h}" rx="10"
                fill="url(#eh-grad)" stroke="white" stroke-width="2" stroke-dasharray="6 4" filter="url(#eh-shadow)"/>
          <rect x="7" y="7" width="4" height="${Math.max(0, h - 14)}" rx="2" fill="rgba(255,255,255,0.88)"/>
          <text x="${textLeft}" y="${titleY}" text-anchor="start" font-family="Source Sans 3"
                font-weight="900" font-size="12.5" fill="white" letter-spacing="1">${title}</text>
          <text x="${textLeft}" y="${subY}" text-anchor="start" font-family="Source Sans 3"
                font-weight="700" font-size="9.5" fill="rgba(255,255,255,0.84)" letter-spacing="0.8">${subtitle}</text>
        </g>
      `;
    }
    
    function drawCable(from, to, opts = {}) {
      // from/to: {x,y} points on node edges
      const color = opts.color || '#261F63';
      const dashed = !!opts.dashed;
      const dx = to.x - from.x, dy = to.y - from.y;
      const cy1 = from.y + dy * 0.5;
      const cy2 = to.y - dy * 0.5;
      const path = `M ${from.x} ${from.y} C ${from.x} ${cy1}, ${to.x} ${cy2}, ${to.x} ${to.y}`;
      return `
        <path d="${path}" stroke="${color}" stroke-width="1.6" fill="none"
              ${dashed ? 'stroke-dasharray="4 3"' : ''} opacity="0.75"/>
        <circle cx="${from.x}" cy="${from.y}" r="2.5" fill="${color}"/>
        <circle cx="${to.x}" cy="${to.y}" r="2.5" fill="${color}"/>
      `;
    }
    
    function drawConnection(from, to, opts = {}) {
      const color = opts.color || '#261F63';
      const dashed = !!opts.dashed;
      const bidirectional = !!opts.bidirectional;
      const dx = to.x - from.x, dy = to.y - from.y;
      const laneY = Number.isFinite(opts.laneY) ? opts.laneY : null;
      const cy1 = laneY ?? (from.y + dy * 0.5);
      const cy2 = laneY ?? (to.y - dy * 0.5);
      const path = `M ${from.x} ${from.y} C ${from.x} ${cy1}, ${to.x} ${cy2}, ${to.x} ${to.y}`;
      const markerEnd = opts.arrow !== false ? `marker-end="url(#arrow-${opts.markerId || 'sapphire'})"` : '';
      const markerStart = bidirectional ? `marker-start="url(#arrow-${opts.markerId || 'sapphire'})"` : '';
      return `
        <path d="${path}" stroke="${color}" stroke-width="1.7" fill="none"
              ${dashed ? 'stroke-dasharray="4 3"' : ''} opacity="0.86" ${markerStart} ${markerEnd}/>
      `;
    }
    
    function topologyConnectionLabel(fromPlatform, toPlatform) {
      const pair = new Set([fromPlatform, toPlatform]);
      if (pair.has('extended_storage')) return 'SAS';
      return 'TCP/443';
    }
    
    function colorForConnectionPort(label) {
      if (label === 'SAS') return '#898A8D';
      return '#EC0889';
    }
    
    function markerForConnectionPort(label) {
      if (label === 'SAS') return 'muted';
      return 'magenta';
    }
    
    function renderConnectionLegendRows(routes, startY) {
      const routeRows = routes.map((route, i) => {
        const rowY = startY + i * 22;
        return `
          <path d="M 18 ${rowY - 4} L 42 ${rowY - 4}" stroke="${route.color}" stroke-width="2.2" marker-end="url(#arrow-${route.markerId})"/>
          <text x="52" y="${rowY}" font-family="Source Sans 3" font-weight="700" font-size="10" fill="#15103A">${route.text}</text>
        `;
      }).join('');
      return routeRows;
    }
    
    // Right-side rail listing the common edge ports every UI-bearing appliance
    // (ECA / EDA / ETA / EXA / IDS / EFC) needs. STORAGE row is intentionally
    // excluded — ESUs are DAS-only and have no external ports.
    function renderEdgePortsRail(x, y, h, routes = []) {
      const w = 210;
      const firstRowY = 44;
      const lines = [
        { dir: 'down', color: '#00AAEF', text: 'TCP/443 UI/API in' },
        { dir: 'up',   color: '#261F63', text: 'TCP/443 cloud out' },
        { dir: 'up',   color: '#6B6880', text: 'UDP/53 DNS' },
        { dir: 'up',   color: '#6B6880', text: 'UDP/123 NTP' },
      ];
      const connectionHeadingY = firstRowY + lines.length * 22 + 18;
      const connectionRowsY = connectionHeadingY + 25;
      const minH = routes.length
        ? connectionRowsY + routes.length * 22 + 10
        : firstRowY + lines.length * 22 + 10;
      const railH = Math.max(h, minH);
      const lineRows = lines.map((line, i) => {
        const rowY = firstRowY + i * 22;
        const arrow = line.dir === 'up'
          ? `<path d="M 12 ${rowY + 5} L 12 ${rowY - 6}" stroke="${line.color}" stroke-width="1.7" marker-end="url(#arrow-muted)"/>`
          : `<path d="M 12 ${rowY - 6} L 12 ${rowY + 5}" stroke="${line.color}" stroke-width="1.7" marker-end="url(#arrow-muted)"/>`;
        return `${arrow}<text x="34" y="${rowY + 2}" font-family="Source Sans 3" font-weight="700" font-size="10" fill="#15103A">${line.text}</text>`;
      }).join('');
      const connectionRows = routes.length
        ? `
          <path d="M 18 ${connectionHeadingY - 14} L ${w - 18} ${connectionHeadingY - 14}" stroke="#E3E1EC"/>
          <text x="18" y="${connectionHeadingY}" font-family="Source Sans 3" font-weight="800" font-size="9.5" fill="#898A8D" letter-spacing="1.2">CONNECTION PORTS</text>
          ${renderConnectionLegendRows(routes, connectionRowsY)}
        `
        : '';
      return `
        <g transform="translate(${x}, ${y})">
          <rect x="0" y="0" width="${w}" height="${railH}" rx="10" fill="white" stroke="#E3E1EC"/>
          <text x="18" y="19" font-family="Source Sans 3" font-weight="800" font-size="9.5" fill="#898A8D" letter-spacing="1.2">COMMON EDGE PORTS</text>
          ${lineRows}
          ${connectionRows}
        </g>
      `;
    }
    
    function nodeHForItem(item) {
      const ru = item?.form_factor?.rack_units;
      if (!ru || ru < 1) return 38; // virtual/cloud/unknown — compact size
      return Math.max(38, 24 + ru * 14); // 1U=38, 2U=52, 3U=66, 4U=80
    }
    
    function renderTopologyDiagram(items, options = {}) {
      const plan = planTopology(items);
      const layout = layoutTopology(plan, { ...options, items });
      return renderTopologySvg(layout, options);
    }
    
    function layoutTopology(plan, options = {}) {
      return {
        plan,
        items: options.items || [],
        showConnections: !!options.showConnections,
      };
    }
    
    function renderTopologySvg(layout, options = {}) {
      const { items, plan } = layout;
      if (!items.length) {
        return `<svg viewBox="0 0 800 140" class="diagram-svg"><rect x="0" y="0" width="800" height="140" fill="#FAFAFC" rx="10"/><text x="400" y="76" text-anchor="middle" font-family="Source Sans 3" font-size="14" fill="#898A8D">No components in stack · drag appliances to build one</text></svg>`;
      }
    
      const { eca, exa, sensor, ids, efc, etas, esus, esuAssignments } = plan;
      const showConnections = !!layout.showConnections;
    
      // Layout constants
      const nodeW = 140;
      const gapX = 22, gapY = 56;
      const esuStackGap = 6; // tight gap between ESUs in a vertical stack — rack-like
      const defaultNodeH = 52;
    
      // Row 0: services, only when ECA and/or EXA are explicitly included.
      const serviceY = 28;
      const ecaH = 44;
      const serviceNodes = [
        ...(exa ? [{ inst: exa, kind: 'exa', w: nodeW, h: nodeHForItem(exa.item) }] : []),
        ...(eca ? [{ inst: eca, kind: 'eca', w: nodeW, h: ecaH }] : []),
      ];
      const hasServiceRow = serviceNodes.length > 0;
      const serviceRowH = serviceNodes.reduce((m, n) => Math.max(m, n.h), defaultNodeH);
      const serviceContentW = serviceNodes.reduce((sum, n) => sum + n.w, 0)
        + Math.max(serviceNodes.length - 1, 0) * gapX;
    
      // Row 1: EDA + optional IDS/EFC sensor-side services.
      const edaRowY = hasServiceRow ? serviceY + serviceRowH + gapY : 28;
      const row1Nodes = [
        ...(sensor ? [{ inst: sensor, kind: 'sensor' }] : []),
        ...ids.map(inst => ({ inst, kind: 'ids' })),
        ...efc.map(inst => ({ inst, kind: 'efc' })),
      ];
      const row1Count = row1Nodes.length;
      // Tallest box in row1 determines where the next row starts
      const row1MaxH = row1Nodes.reduce((m, n) => Math.max(m, nodeHForItem(n.inst.item)), defaultNodeH);
    
      // Row 2: ETAs
      const etaRowY = (row1Count ? edaRowY + row1MaxH : (hasServiceRow ? serviceY + serviceRowH : edaRowY)) + gapY;
      const etaMaxH = etas.reduce((m, eta) => Math.max(m, nodeHForItem(eta.item)), defaultNodeH);
    
      const esusByHost = new Map();
      const orphanEsus = [];
      esuAssignments.forEach(assign => {
        if (assign.host.type === 'orphan') {
          orphanEsus.push(assign.esu);
          return;
        }
        const key = `${assign.host.type}:${formatTopologyInstanceName(assign.host.ref)}`;
        if (!esusByHost.has(key)) esusByHost.set(key, []);
        esusByHost.get(key).push(assign.esu);
      });
    
      // Build host columns for the ESU layout — one column per ETA (and AIO/orphan if present)
      const hostColumns = [];
      etas.forEach(eta => {
        hostColumns.push({ key: `eta:${formatTopologyInstanceName(eta)}`, host: eta, type: 'eta' });
      });
      if (sensor?.item.platform === 'all_in_one' && esusByHost.get(`aio:${formatTopologyInstanceName(sensor)}`)?.length) {
        hostColumns.push({ key: `aio:${formatTopologyInstanceName(sensor)}`, host: sensor, type: 'aio' });
      }
      if (orphanEsus.length) {
        hostColumns.push({ key: 'orphan', host: null, type: 'orphan' });
      }
    
      // ESU row Y baseline (top edge of each column's first ESU).
      // Sit directly below the ETA row when present; otherwise hang off the EDA/AIO row.
      const esuRowY = etas.length
        ? etaRowY + etaMaxH + gapY
        : edaRowY + row1MaxH + gapY;
    
      // Pre-compute each column's ESU stack height so we can size the SVG correctly
      const columnStackHeights = hostColumns.map(col => {
        const list = col.type === 'orphan' ? orphanEsus : (esusByHost.get(col.key) || []);
        if (!list.length) return 0;
        return list.reduce((sum, esu, i) => sum + nodeHForItem(esu.item) + (i > 0 ? esuStackGap : 0), 0);
      });
      const tallestStack = columnStackHeights.reduce((m, h) => Math.max(m, h), 0);
    
      // Width: one column per host (ETAs anchor their stacks). Orphan column added when present.
      const row1ContentW = row1Count * nodeW + Math.max(row1Count - 1, 0) * gapX;
      const row2ContentW = etas.length * nodeW + Math.max(etas.length - 1, 0) * gapX;
      const row3ContentW = hostColumns.length * nodeW + Math.max(hostColumns.length - 1, 0) * gapX;
      const contentW = Math.max(serviceContentW, row1ContentW, row2ContentW, row3ContentW);
      // Reserve space on the right for the edge-ports rail when connections are shown.
      const leftGutter = 60;
      const rightGutter = showConnections ? 240 : 40;
      const w = Math.max(820, leftGutter + contentW + rightGutter);
      // Center appliances between the left labels and right rail (or right margin)
      const applianceCenterX = (leftGutter + (w - rightGutter)) / 2;
    
      // Only draw the ESU row if there are ESUs
      const hasEsuRow = esus.length > 0;
      const hasEtaRow = etas.length > 0;
      const terminalY = hasEsuRow
        ? esuRowY
        : hasEtaRow
          ? etaRowY
            : row1Count
              ? edaRowY
              : hasServiceRow
                ? serviceY
                : edaRowY;
      const terminalH = (!row1Count && hasServiceRow && !hasEtaRow && !hasEsuRow)
        ? serviceRowH
        : hasEsuRow
          ? tallestStack
          : hasEtaRow
            ? etaMaxH
            : row1MaxH;
      let height = terminalY + terminalH + 32;

      const routeMap = new Map();
      const routeList = [];
      // In labeled mode, color denotes the connection port rather than appliance role.
      const routeFor = (text) => {
        if (!routeMap.has(text)) {
          const route = {
            text,
            color: colorForConnectionPort(text),
            markerId: markerForConnectionPort(text),
          };
          routeMap.set(text, route);
          routeList.push(route);
        }
        return routeMap.get(text);
      };
      const connectionFor = (label, opts = {}) => {
        const route = routeFor(label);
        return {
          ...opts,
          color: route.color,
          markerId: opts.markerId || route.markerId,
        };
      };
      if (showConnections) {
        const hasTcpConnection = (eca && exa)
          || (eca && row1Count)
          || (exa && (sensor || efc.length))
          || (eca && hasEtaRow)
          || (sensor && hasEtaRow);
        const hasSasConnection = esuAssignments.some(assign => assign.host.type === 'eta' || assign.host.type === 'aio');
        if (hasTcpConnection) routeFor('TCP/443');
        if (hasSasConnection) routeFor('SAS');
        if (row1Count || hasServiceRow || hasEtaRow) {
          const railTop = hasServiceRow ? serviceY : edaRowY;
          const railBottom = hasEtaRow
            ? etaRowY + etaMaxH
            : row1Count
              ? edaRowY + row1MaxH
              : serviceY + serviceRowH;
          const railH = Math.max(128, railBottom - railTop);
          const commonRowsH = 44 + 4 * 22 + 10;
          const connectionRowsH = routeList.length ? 18 + 25 + routeList.length * 22 + 10 : 0;
          const minRailH = Math.max(railH, commonRowsH + connectionRowsH);
          height = Math.max(height, railTop + minRailH + 32);
        }
      }
    
      let svg = `<svg viewBox="0 0 ${w} ${height}" class="diagram-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="eh-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#261F63"/>
            <stop offset="100%" stop-color="#7F2854"/>
          </linearGradient>
          <filter id="eh-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#261F63" flood-opacity="0.18"/>
          </filter>
          <marker id="arrow-sapphire" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#261F63"/>
          </marker>
          <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#00AAEF"/>
          </marker>
          <marker id="arrow-plum" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#7F2854"/>
          </marker>
          <marker id="arrow-magenta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#EC0889"/>
          </marker>
          <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6B6880"/>
          </marker>
        </defs>
        <rect x="0" y="0" width="${w}" height="${height}" fill="#FAFAFC" rx="10"/>
      `;
    
      // Row labels (left gutter)
      const labelX = 18;
      if (hasServiceRow) svg += `<text x="${labelX}" y="${serviceY + serviceRowH/2 + 4}" font-family="Source Sans 3" font-weight="800" font-size="9.5" fill="#898A8D" letter-spacing="1.4">SERVICES</text>`;
      if (row1Count) svg += `<text x="${labelX}" y="${edaRowY + row1MaxH/2 + 4}" font-family="Source Sans 3" font-weight="800" font-size="9.5" fill="#898A8D" letter-spacing="1.4">SENSORS</text>`;
      if (hasEtaRow) svg += `<text x="${labelX}" y="${etaRowY + etaMaxH/2 + 4}" font-family="Source Sans 3" font-weight="800" font-size="9.5" fill="#898A8D" letter-spacing="1.4">PCAP</text>`;
      if (hasEsuRow) svg += `<text x="${labelX}" y="${esuRowY + 14}" font-family="Source Sans 3" font-weight="800" font-size="9.5" fill="#898A8D" letter-spacing="1.4">STORAGE</text>`;
    
      // Row 0 — services, drawn only from added catalog products.
      const servicePositions = [];
      const serviceRowStartX = applianceCenterX - serviceContentW / 2;
      let serviceCursor = serviceRowStartX;
      let ecaAnchor = null;
      let exaAnchor = null;
      for (const node of serviceNodes) {
        const y = serviceY + (serviceRowH - node.h) / 2;
        const p = { ...node, x: serviceCursor, y };
        servicePositions.push(p);
        serviceCursor += node.w + gapX;
    
        if (node.kind === 'eca') ecaAnchor = { x: p.x + p.w / 2, y: p.y + p.h };
        else exaAnchor = { x: p.x + p.w / 2, y: p.y + p.h };
      }
    
      // Row 1 — EDA + side (IDS/EFC). Items top-align at edaRowY; height varies by rack units.
      const row1Total = row1Count * nodeW + (row1Count - 1) * gapX;
      const row1StartX = applianceCenterX - row1Total / 2;
    
      const row1Positions = []; // {inst, kind, x, y, h}
      let cursor = row1StartX;
      for (const node of row1Nodes) {
        row1Positions.push({ ...node, x: cursor, y: edaRowY, h: nodeHForItem(node.inst.item) });
        cursor += nodeW + gapX;
      }
    
      const etaPositions = new Map();
      if (hasEtaRow) {
        const row2Total = etas.length * nodeW + (etas.length - 1) * gapX;
        const row2StartX = applianceCenterX - row2Total / 2;
        etas.forEach((eta, i) => {
          const x = row2StartX + i * (nodeW + gapX);
          etaPositions.set(eta, { x, y: etaRowY, h: nodeHForItem(eta.item) });
        });
      }
    
      if (ecaAnchor && exaAnchor) {
        const ecaPos = servicePositions.find(p => p.kind === 'eca');
        const exaPos = servicePositions.find(p => p.kind === 'exa');
        if (ecaPos && exaPos) {
          const exaLeftOfEca = exaPos.x < ecaPos.x;
          const from = {
            x: exaLeftOfEca ? ecaPos.x : ecaPos.x + ecaPos.w,
            y: ecaPos.y + ecaPos.h / 2,
          };
          const to = {
            x: exaLeftOfEca ? exaPos.x + exaPos.w : exaPos.x,
            y: exaPos.y + exaPos.h / 2,
          };
          const label = topologyConnectionLabel('command', 'recordstore');
          svg += showConnections
            ? drawConnection(from, to, connectionFor(label, {
                bidirectional: true,
              }))
            : drawCable(from, to, { color: colorForPlatform('recordstore') });
        }
      }
    
      // Draw ECA → row1 cables only when an ECA was explicitly added.
      if (ecaAnchor) for (const p of row1Positions) {
        const accent = colorForPlatform(p.inst.item.platform);
        const top = { x: p.x + nodeW/2, y: p.y };
        const label = topologyConnectionLabel('command', p.inst.item.platform);
        svg += showConnections
          ? drawConnection(ecaAnchor, top, connectionFor(label, {
            bidirectional: true,
          }))
          : drawCable(ecaAnchor, top, { color: accent });
      }
    
      const sensorPos = row1Positions.find(p => p.kind === 'sensor');
      if (exaAnchor) {
        const exaTargets = row1Positions.filter(p => p.kind === 'sensor' || p.kind === 'efc');
        for (const target of exaTargets) {
          const from = { x: exaAnchor.x, y: exaAnchor.y };
          const to = { x: target.x + nodeW / 2, y: target.y };
          const label = topologyConnectionLabel(target.inst.item.platform, 'recordstore');
          svg += showConnections
            ? drawConnection(from, to, connectionFor(label, {
              bidirectional: true,
            }))
            : drawCable(from, to, { color: colorForPlatform('recordstore') });
        }
      }
    
      if (showConnections && ecaAnchor && hasEtaRow) {
        const laneY = row1Count ? edaRowY + row1MaxH / 2 : etaRowY - gapY / 2;
        etas.forEach((eta, i) => {
          const pos = etaPositions.get(eta);
          if (!pos) return;
          const to = { x: pos.x + nodeW / 2, y: pos.y };
          const label = topologyConnectionLabel('command', 'packetstore');
          svg += drawConnection(ecaAnchor, to, connectionFor(label, {
            bidirectional: true,
            laneY,
          }));
        });
      }
    
      if (sensorPos && hasEtaRow) {
        etas.forEach((eta, i) => {
          const pos = etaPositions.get(eta);
          if (!pos) return;
          const from = { x: sensorPos.x + nodeW/2, y: sensorPos.y + sensorPos.h };
          const to = { x: pos.x + nodeW/2, y: pos.y };
          const label = topologyConnectionLabel(sensor.item.platform, 'packetstore');
          svg += showConnections
            ? drawConnection(from, to, connectionFor(label, {
              bidirectional: true,
            }))
            : drawCable(from, to, { color: colorForPlatform('packetstore') });
        });
      }
    
      // Repaint service nodes above horizontal service-to-service connectors.
      for (const p of servicePositions) {
        if (p.kind === 'eca') {
          svg += renderConsoleNode(p.x, p.y, p.w, p.h, {
            title: eca.name,
            subtitle: 'Console · Virtual',
          });
        } else {
          const it = p.inst.item;
          const sub = [];
          const kind = deploymentKind(it);
          if (kind === 'Physical' && it.form_factor?.rack_units) sub.push(`${it.form_factor.rack_units}U`);
          if (kind !== 'Physical') sub.push(kind);
          svg += renderAppNode(p.x, p.y, p.w, p.h, {
            title: it.name,
            subtitle: sub.join(' · '),
            accent: colorForPlatform('recordstore'),
            dashed: kind === 'Virtual',
          });
        }
      }
    
      // Draw sensor-row nodes — model name carries the type (EDA/IDS/EFC), no ribbon needed
      for (const p of row1Positions) {
        const it = p.inst.item;
        const accent = colorForPlatform(it.platform);
        const sub = [];
        if (it.performance?.base_gbps) sub.push(`${it.performance.base_gbps} Gbps`);
        const kind = deploymentKind(it);
        if (kind === 'Physical' && it.form_factor?.rack_units) sub.push(`${it.form_factor.rack_units}U`);
        if (kind !== 'Physical') sub.push(kind);
        svg += renderAppNode(p.x, p.y, nodeW, p.h, {
          title: it.name,
          subtitle: sub.join(' · '),
          accent,
          dashed: kind === 'Virtual',
        });
      }
    
      // Row 2 — ETAs centered under the EDA. Each ETA top-aligned at etaRowY; height varies.
      if (hasEtaRow) {
        etas.forEach((eta) => {
          const pos = etaPositions.get(eta);
          if (!pos) return;
          const it = eta.item;
          const sub = [];
          if (it.performance?.base_gbps) sub.push(`${it.performance.base_gbps} Gbps`);
          const kind = deploymentKind(it);
          if (kind === 'Physical' && it.form_factor?.rack_units) sub.push(`${it.form_factor.rack_units}U`);
          if (kind !== 'Physical') sub.push(kind);
          svg += renderAppNode(pos.x, pos.y, nodeW, pos.h, {
            title: formatTopologyInstanceName(eta),
            subtitle: sub.join(' · '),
            accent: colorForPlatform('packetstore'),
            dashed: kind === 'Virtual',
          });
        });
      }
    
      // Row 3 — ESUs stacked VERTICALLY directly under their assigned host (ETA or AIO),
      // one column per host. The visual stack reads like rack-mounted units under the ETA.
      if (hasEsuRow) {
        const row3Total = hostColumns.length * nodeW + (hostColumns.length - 1) * gapX;
        const row3StartX = applianceCenterX - row3Total / 2;
    
        hostColumns.forEach((column, colIdx) => {
          const columnEsus = column.type === 'orphan'
            ? orphanEsus
            : (esusByHost.get(column.key) || []);
          if (!columnEsus.length) return;
    
          const x = row3StartX + colIdx * (nodeW + gapX);
    
          // Connect host (ETA/AIO bottom) to the top of the column's first ESU
          let from = null;
          let dashed = false;
          let color = colorForPlatform('extended_storage');
          if (column.type === 'eta') {
            const pos = etaPositions.get(column.host);
            if (pos) from = { x: pos.x + nodeW/2, y: pos.y + pos.h };
          } else if (column.type === 'aio') {
            const sensorPos = row1Positions.find(p => p.kind === 'sensor');
            if (sensorPos) from = { x: sensorPos.x + nodeW/2, y: sensorPos.y + sensorPos.h };
            color = colorForPlatform('all_in_one');
          } else {
            dashed = true;
          }
          if (from) {
            const hostPlatform = column.type === 'aio' ? 'all_in_one' : 'packetstore';
            const label = topologyConnectionLabel(hostPlatform, 'extended_storage');
            const to = { x: x + nodeW/2, y: esuRowY };
            svg += showConnections
              ? drawConnection(from, to, connectionFor(label, {
                  dashed,
                  arrow: false,
                }))
              : drawCable(from, to, { color, dashed });
          }
    
          // Draw the ESUs stacked downward at the same X
          let stackY = esuRowY;
          columnEsus.forEach(esu => {
            const it = esu.item;
            const h = nodeHForItem(it);
            const cap = computeStorageCapacityTb(it);
            const sub = cap ? `${cap} TB` : '';
            svg += renderAppNode(x, stackY, nodeW, h, {
              title: formatTopologyInstanceName(esu),
              subtitle: sub || (column.type === 'orphan' ? 'Unattached' : ''),
              accent: colorForPlatform('extended_storage'),
              dim: column.type === 'orphan',
              dashed: deploymentKind(it) === 'Virtual',
            });
            stackY += h + esuStackGap;
          });
        });
      }
    
      if (showConnections) {
        // Right-side rail spans only the rows with edge connectivity (SERVICES/SENSORS/PCAP).
        // It deliberately stops above the STORAGE row to show ESUs don't need edge ports.
        if (row1Count || hasServiceRow || hasEtaRow) {
          const railX = w - 220;
          const railTop = hasServiceRow ? serviceY : edaRowY;
          const railBottom = hasEtaRow
            ? etaRowY + etaMaxH
            : row1Count
              ? edaRowY + row1MaxH
              : serviceY + serviceRowH;
          const railH = Math.max(128, railBottom - railTop);
          svg += renderEdgePortsRail(railX, railTop, railH, routeList);
        }
        svg += `<text x="${w - 34}" y="${height - 18}" text-anchor="end" font-family="Source Sans 3" font-size="9.5" fill="#898A8D">Port labels follow the ExtraHop default port specifications; direct/tunneled direction can vary by deployment.</text>`;
      }
    
      svg += `</svg>`;
      return svg;
    }

    return {
      colorForPlatform,
      renderTopologyDiagram,
      layoutTopology,
      renderTopologySvg,
    };
  }

  return { createTopologyView };
});
