import test from 'node:test';
import assert from 'node:assert/strict';
import { publicOrderReceipt } from './order-response.mjs';

test('receipt preserves checkout fields but strips customer and unknown data, including nested lines', () => {
  const result = publicOrderReceipt({
    id: 'WDX-1', ref: 'WDX-1', replay: true, total: 100, subtotal: 100, shipping: 0,
    customerName: 'Synthetic', customerEmail: 'private@example.test', customerPhone: '123',
    address: 'Private', city: 'Private', trackingToken: 'secret',
    items: [{ id: 'chair', name: 'Chair', price: 100, quantity: 1, sku: 'C', privateNote: 'secret' }],
  });
  assert.deepEqual(result, { id: 'WDX-1', ref: 'WDX-1', replay: true, total: 100, subtotal: 100, shipping: 0,
    items: [{ id: 'chair', name: 'Chair', price: 100, quantity: 1, sku: 'C' }] });
});

test('invalid RPC result is rejected rather than exposed', () => {
  assert.throws(() => publicOrderReceipt(null), TypeError);
  assert.throws(() => publicOrderReceipt([]), TypeError);
});
