const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const catalog = require('../catalog.eh.json');
const domain = require('../src/domain.js');

function stack(...entries) {
  return entries.map(([id, qty = 1]) => ({ id, qty }));
}

function hostTypes(plan, esuName) {
  return plan.esuAssignments
    .filter(x => x.esu.name === esuName)
    .map(x => x.host.type);
}

describe('stack domain rules', () => {
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
});
