/**
 * Storefront flat delivery-fee policy (single source of truth in code):
 * Rs 2,500 flat, FREE at Rs 50,000+ of cart subtotal.
 *
 * MIRRORED BY `public.order_submit` IN supabase/migrations/20261107000005_*.sql —
 * change these constants and the migration TOGETHER or checkout and orders will disagree.
 * The server always re-applies this rule at intake; client math is display-only.
 */
export const FLAT_DELIVERY_FEE_PKR = 2500 as const;
export const FREE_DELIVERY_AT_PKR = 50000 as const;
export const deliveryFeeFor = (subtotal: number): number =>
  subtotal >= FREE_DELIVERY_AT_PKR ? 0 : FLAT_DELIVERY_FEE_PKR;
