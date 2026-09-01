const assert = require('assert');
const guards = require('../inventory-guards.js');

const baseState = () => ({
  products: [{ productCode: 'P1' }, { productCode: 'P2' }],
  shelves: ['A1', 'B1'],
  machines: ['M1'],
  stock: [{ barcode: 'P1', location: 'A1', qty: 10 }]
});

assert.equal(guards.positiveQty(2).ok, true);
assert.equal(guards.positiveQty(0).ok, false);
assert.equal(guards.positiveQty(-1).ok, false);
assert.equal(guards.positiveQty('abc').ok, false);
assert.equal(guards.positiveQty(Infinity).ok, false);

assert.equal(guards.validateState(baseState()).ok, true);

const duplicateProduct = baseState();
duplicateProduct.products.push({ productCode: 'P1' });
assert.equal(guards.validateState(duplicateProduct).ok, false);

const unknownProductStock = baseState();
unknownProductStock.stock.push({ barcode: 'X', location: 'A1', qty: 1 });
assert.equal(guards.validateState(unknownProductStock).ok, false);

const unknownShelfStock = baseState();
unknownShelfStock.stock.push({ barcode: 'P2', location: 'X1', qty: 1 });
assert.equal(guards.validateState(unknownShelfStock).ok, false);

const negativeStock = baseState();
negativeStock.stock[0].qty = -2;
assert.equal(guards.validateState(negativeStock).ok, false);

assert.equal(guards.validateEntry({ code: 'P1', shelf: 'A1', qty: 3, state: baseState() }).ok, true);
assert.equal(guards.validateEntry({ code: 'P9', shelf: 'A1', qty: 3, state: baseState() }).ok, false);
assert.equal(guards.validateEntry({ code: 'P1', shelf: 'X1', qty: 3, state: baseState() }).ok, false);

assert.equal(guards.validateTransfer({ code: 'P1', from: 'A1', to: 'B1', qty: 4, state: baseState(), available: 10 }).ok, true);
assert.equal(guards.validateTransfer({ code: 'P1', from: 'A1', to: 'A1', qty: 4, state: baseState(), available: 10 }).ok, false);
assert.equal(guards.validateTransfer({ code: 'P1', from: 'A1', to: 'B1', qty: 11, state: baseState(), available: 10 }).ok, false);

assert.equal(guards.validateMachine({ code: 'P1', machine: 'M1', from: 'A1', qty: 5, state: baseState(), available: 10 }).ok, true);
assert.equal(guards.validateMachine({ code: 'P1', machine: 'X', from: 'A1', qty: 5, state: baseState(), available: 10 }).ok, false);
assert.equal(guards.validateMachine({ code: 'P1', machine: 'M1', from: 'A1', qty: 12, state: baseState(), available: 10 }).ok, false);

assert.equal(guards.totalFor(baseState(), 'P1'), 10);
console.log('Inventory guard tests passed');
