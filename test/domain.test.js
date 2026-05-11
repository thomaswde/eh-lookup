const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const catalog = require('../catalog.eh.json');
const domain = require('../src/domain.js');
const state = require('../src/state.js');
const catalogView = require('../src/catalog-view.js');
const exportViewModule = require('../src/export-view.js');

function stack(...entries) {
  return entries.map(([id, qty = 1]) => ({ id, qty }));
}

function hostTypes(plan, esuName) {
  return plan.esuAssignments
    .filter(x => x.esu.name === esuName)
    .map(x => x.host.type);
}

describe('stack domain rules', () => {
  test('normalizes saved stack entries and drops unknown catalog items', () => {
    const normalized = domain.normalizeStackEntries([
      { id: 'ETA9350', qty: '2.9' },
      { id: 'ETA9350', qty: 1 },
      { id: 'EDA10300', qty: 2 },
      { id: 'EDA9300', qty: 1 },
      { id: 'removed-model', qty: 3 },
      { id: '96TB ESU', qty: -4 },
      { id: 'ECA', qty: Number.NaN },
      { id: 123, qty: 2 },
    ], catalog);

    assert.deepEqual(normalized, [
      { id: 'ETA9350', qty: 3 },
      { id: 'EDA10300', qty: 1 },
    ]);
  });

  test('clamps odd quantities in stack mutations and totals', () => {
    const addedFractional = domain.addStackItem([], 'ETA9350', catalog, 2.8);
    const addedString = domain.addStackItem([], 'ETA9350', catalog, '3');
    const addedNegative = domain.addStackItem(stack(['ETA9350']), '240TB ESU', catalog, -4);
    const changedNan = domain.changeStackItemQty(stack(['ETA9350', '4']), 'ETA9350', Number.NaN, catalog);
    const totals = domain.computeStackTotals([
      { id: 'ETA9350', qty: '2.9' },
      { id: 'missing', qty: 100 },
      { id: 'ECA', qty: 0 },
    ], catalog);

    assert.equal(addedFractional.ok, true);
    assert.deepEqual(addedFractional.stack, [{ id: 'ETA9350', qty: 2 }]);
    assert.deepEqual(addedString.stack, [{ id: 'ETA9350', qty: 3 }]);
    assert.deepEqual(addedNegative.stack, [{ id: 'ETA9350', qty: 1 }]);
    assert.deepEqual(changedNan.stack, [{ id: 'ETA9350', qty: 4 }]);
    assert.equal(totals.storeCount, 2);
  });

  test('computes totals for one EDA only', () => {
    const totals = domain.computeStackTotals(stack(['EDA10300']), catalog);

    assert.equal(totals.throughput, 100);
    assert.equal(totals.ids, 50);
    assert.equal(totals.advanced, 16000);
    assert.equal(totals.standard, 84000);
    assert.equal(totals.sensorCount, 1);
    assert.equal(totals.rackU, 2);
    assert.equal(totals.power, 800);
  });

  test('computes totals for EDA plus ECA, EXA, ETA, and ESU', () => {
    const totals = domain.computeStackTotals(stack(
      ['EDA10300'],
      ['ECA'],
      ['EXA5300'],
      ['ETA9350'],
      ['240TB ESU'],
    ), catalog);

    assert.equal(totals.throughput, 100);
    assert.equal(totals.consoleCount, 1);
    assert.equal(totals.recordCount, 1);
    assert.equal(totals.storeCount, 2);
    assert.equal(totals.ingestRps, 1000000);
    assert.equal(totals.pcapTb, 240);
    assert.equal(totals.rackU, 7);
    assert.equal(totals.power, 3200);
  });

  test('rejects a second EDA and a second ECA role', () => {
    const secondEda = domain.addStackItem(stack(['EDA10300']), 'EDA9300', catalog);
    const secondEca = domain.addStackItem(stack(['ECA']), 'ECA', catalog);

    assert.equal(secondEda.ok, false);
    assert.match(secondEda.message, /one EDA/);
    assert.equal(secondEca.ok, false);
    assert.match(secondEca.message, /one ECA/);
  });

  test('rejects Enterprise-only and Reveal(x) 360-only track conflicts', () => {
    const result = domain.addStackItem(stack(['ECA']), 'EFC1290v', catalog);

    assert.equal(result.ok, false);
    assert.match(result.message, /licensing track/);
  });

  test('changes quantity and removes an item at zero', () => {
    const initial = stack(['ETA9350']);
    const increased = domain.changeStackItemQty(initial, 'ETA9350', 1, catalog);
    const decreased = domain.changeStackItemQty(increased.stack, 'ETA9350', -2, catalog);

    assert.equal(increased.ok, true);
    assert.deepEqual(increased.stack, [{ id: 'ETA9350', qty: 2 }]);
    assert.equal(decreased.ok, true);
    assert.deepEqual(decreased.stack, []);
    assert.deepEqual(initial, [{ id: 'ETA9350', qty: 1 }]);
  });
});

describe('topology planning', () => {
  test('assigns ESUs to ETA capacity', () => {
    const items = domain.getStackItems(stack(
      ['EDA10300'],
      ['ETA9350'],
      ['240TB ESU', 2],
    ), catalog);
    const plan = domain.planTopology(items);

    assert.deepEqual(hostTypes(plan, '240TB ESU'), ['eta', 'eta']);
    assert.equal(plan.esuAssignments[0].host.ref.name, 'ETA9350');
  });

  test('assigns ESUs to AIO capacity', () => {
    const items = domain.getStackItems(stack(
      ['EDA6370'],
      ['240TB ESU'],
    ), catalog);
    const plan = domain.planTopology(items);

    assert.deepEqual(hostTypes(plan, '240TB ESU'), ['aio']);
  });

  test('reports orphaned ESUs without compatible host capacity', () => {
    const items = domain.getStackItems(stack(['240TB ESU']), catalog);
    const plan = domain.planTopology(items);
    const warnings = domain.computeCompatibilityWarnings(stack(['240TB ESU']), catalog);

    assert.deepEqual(hostTypes(plan, '240TB ESU'), ['orphan']);
    assert.match(warnings.join('\n'), /unattached unit/);
  });

  test('keeps duplicate ESU types within host capacity across multiple hosts', () => {
    const items = domain.getStackItems(stack(
      ['ETA9350', 2],
      ['240TB ESU', 6],
    ), catalog);
    const plan = domain.planTopology(items);

    assert.deepEqual(hostTypes(plan, '240TB ESU'), ['eta', 'eta', 'eta', 'eta', 'eta', 'eta']);
    assert.equal(plan.esuAssignments.filter(x => x.host.ref.idx === 0).length, 3);
    assert.equal(plan.esuAssignments.filter(x => x.host.ref.idx === 1).length, 3);
  });
});

describe('view helper boundaries', () => {
  test('normalizes persisted state entries against the catalog', () => {
    const normalized = state.normalizeStack([
      { id: 'EDA10300', qty: '1.2' },
      { id: 'missing', qty: 9 },
      { id: 'ETA9350', qty: 0 },
    ], catalog);

    assert.deepEqual(normalized, [{ id: 'EDA10300', qty: 1 }]);
  });

  test('returns fallback metadata for unknown modules', () => {
    const meta = catalogView.moduleMeta('future_module');

    assert.equal(meta.label, 'Future Module');
    assert.equal(meta.color, 'var(--eh-gray)');
    assert.match(meta.description, /Unrecognized/);
  });

  test('renders empty topology output without catalog items', () => {
    const view = exportViewModule.createExportView({
      state: { stack: [], stackName: '', stackNotes: '', exportShowConnections: false },
      getCatalog: () => catalog,
      getStackItems: domain.getStackItems,
      planTopology: domain.planTopology,
      computeStackTotals: () => domain.computeStackTotals([], catalog),
      computeStorageCapacityTb: domain.computeStorageCapacityTb,
      formatTopologyInstanceName: domain.formatTopologyInstanceName,
      platformMeta: catalogView.platformMeta,
      moduleMeta: catalogView.moduleMeta,
      moduleKeys: catalogView.moduleKeys,
      deploymentKind: catalogView.deploymentKind,
      fmtNum: catalogView.fmtNum,
      escapeHtml: value => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
      escapeAttr: value => String(value ?? ''),
    });

    assert.match(view.renderTopologyDiagram([]), /No components in stack/);
    assert.match(view.buildExportDocument('<main></main>', 'A < B'), /A &lt; B/);
  });
});
