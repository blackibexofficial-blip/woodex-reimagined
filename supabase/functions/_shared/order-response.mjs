// Only return the minimum checkout receipt, including on idempotent replays.
// Customer contact/address data already came from the caller and must not be
// disclosed merely because a caller knows or guesses an idempotency reference.
export function publicOrderReceipt(order) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) throw new TypeError('Invalid order response');
  const fields = ['id', 'ref', 'replay', 'subtotal', 'shipping', 'total', 'status', 'paymentMethod', 'placedAt', 'channelId'];
  const receipt = {};
  for (const key of fields) if (Object.hasOwn(order, key)) receipt[key] = order[key];
  if (Array.isArray(order.items)) {
    receipt.items = order.items.map((item) => {
      const line = {};
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const key of ['id', 'name', 'price', 'quantity', 'sku']) {
          if (Object.hasOwn(item, key)) line[key] = item[key];
        }
      }
      return line;
    });
  }
  return receipt;
}
