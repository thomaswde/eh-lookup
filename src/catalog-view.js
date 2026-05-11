(function initCatalogView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EHCatalogView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildCatalogView() {
  const PLATFORM_META = {
    command:              { label: 'Console',            accent: 'var(--plt-command)',            group: 'Console',              order: 0, short: 'ECA' },
    packet_sensor:        { label: 'Packet Sensor',      accent: 'var(--plt-packet_sensor)',      group: 'Sensors',              order: 1, short: 'EDA' },
    multifunction_sensor: { label: 'Multifunction Sensor',accent: 'var(--plt-multifunction_sensor)',group: 'Sensors',             order: 1, short: 'EDA' },
    all_in_one:           { label: 'All-in-One',         accent: 'var(--plt-all_in_one)',         group: 'Sensors',              order: 1, short: 'AIO' },
    ids_standalone:       { label: 'IDS Standalone',     accent: 'var(--plt-ids_standalone)',     group: 'IDS',                  order: 2, short: 'IDS' },
    packetstore:          { label: 'Packet Store',       accent: 'var(--plt-packetstore)',        group: 'Packet Stores',        order: 3, short: 'ETA' },
    extended_storage:     { label: 'Extended Storage',   accent: 'var(--plt-extended_storage)',   group: 'Extended Storage',     order: 4, short: 'ESU' },
    recordstore:          { label: 'Record Store',       accent: 'var(--plt-recordstore)',        group: 'Record Stores',        order: 5, short: 'EXA' },
    flow_collector:       { label: 'Flow Collector',     accent: 'var(--plt-flow_collector)',     group: 'Flow Collectors',      order: 6, short: 'EFC' },
  };

  const MODULE_META = {
    ndr:              { label: 'NDR',              color: 'var(--eh-sapphire)',  description: 'Network Detection & Response' },
    npm:              { label: 'NPM',              color: 'var(--eh-cyan)',      description: 'Network Performance Monitoring' },
    ids:              { label: 'IDS',              color: 'var(--eh-tangerine)', description: 'Intrusion Detection'          },
    network_forensics:{ label: 'Forensics',        color: 'var(--eh-plum)',      description: 'Network Forensics / PCAP'     },
    investigation:    { label: 'Investigation',    color: 'var(--eh-magenta)',   description: 'Records / Investigation'      },
    flow_analysis:    { label: 'Flow Analysis',    color: '#7FA800',             description: 'NetFlow / sFlow / IPFIX'      },
  };

  const DEPLOY_META = {
    physical: { label: 'Physical',   icon: '◼', color: 'var(--eh-sapphire)' },
    vmware:   { label: 'VMware',     icon: 'V', color: '#607078' },
    'hyper-v':{ label: 'Hyper-V',    icon: 'H', color: '#0078D4' },
    kvm:      { label: 'KVM',        icon: 'K', color: '#D8353B' },
    aws:      { label: 'AWS',        icon: 'a', color: '#FF9900' },
    azure:    { label: 'Azure',      icon: '⌁', color: '#0078D4' },
    gcp:      { label: 'GCP',        icon: 'g', color: '#4285F4' },
  };

  function titleizeKey(key) {
    return String(key || 'unknown')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function platformMeta(platform) {
    return PLATFORM_META[platform] || {
      label: titleizeKey(platform),
      accent: 'var(--eh-sapphire)',
      group: 'Other',
      order: 99,
      short: String(platform || 'Other').toUpperCase(),
    };
  }

  function moduleMeta(key) {
    return MODULE_META[key] || {
      label: titleizeKey(key),
      color: 'var(--eh-gray)',
      description: 'Unrecognized catalog module',
    };
  }

  function accentForPlatform(platform) {
    return platformMeta(platform).accent;
  }

  function moduleKeys(item) {
    return Object.keys(item?.modules || {}).filter(k => item.modules[k]);
  }

  function catalogModuleKeys(catalog) {
    const keys = new Set();
    for (const item of Array.isArray(catalog) ? catalog : []) {
      moduleKeys(item).forEach(key => keys.add(key));
    }
    return [...keys].sort((a, b) => {
      const aKnown = Object.prototype.hasOwnProperty.call(MODULE_META, a);
      const bKnown = Object.prototype.hasOwnProperty.call(MODULE_META, b);
      if (aKnown && bKnown) {
        return Object.keys(MODULE_META).indexOf(a) - Object.keys(MODULE_META).indexOf(b);
      }
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return moduleMeta(a).label.localeCompare(moduleMeta(b).label);
    });
  }

  function prettyStatus(status) {
    return (status || '').replace('_', ' ');
  }

  function deploymentKind(item) {
    if (item?.form_factor) return 'Physical';
    if (item?.deployments?.hypervisors?.length) return 'Virtual';
    if (item?.deployments?.clouds?.length) return 'Cloud';
    return 'Virtual';
  }

  function isPhysical(item) {
    return deploymentKind(item) === 'Physical';
  }

  function deploymentCategories(item) {
    const out = new Set();
    const kind = deploymentKind(item);
    out.add(kind);
    if (kind === 'Virtual' && item?.deployments?.clouds?.length) out.add('Cloud');
    return out;
  }

  function fmtNum(value) {
    if (value == null) return '—';
    return value.toLocaleString();
  }

  return {
    PLATFORM_META,
    MODULE_META,
    DEPLOY_META,
    platformMeta,
    moduleMeta,
    accentForPlatform,
    moduleKeys,
    catalogModuleKeys,
    prettyStatus,
    deploymentKind,
    deploymentCategories,
    isPhysical,
    fmtNum,
  };
});
