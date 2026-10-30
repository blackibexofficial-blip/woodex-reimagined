# Commerce Domain — WITHDRAWN

> **This document described a native `app/Domain/Commerce` inside WOODEX OS — carts, checkouts, payments, orders.
> The owner rejected that approach: the commerce engine is Bagisto.**
>
> Kept only as a record of the rejected option and why it lost.

## What it proposed

Hand-built commerce inside the OS: `products`, `product_variants`, `prices`, `carts`, `cart_lines`, `checkouts`,
`orders`, `order_lines`, `payments`, `shipments`, `refunds` — roughly 11 tables and 30 endpoints, all under
`App\Domain\Commerce`.

## Why it was rejected

| Reason | Detail |
|---|---|
| **Reinventing a mature product** | Bagisto already ships catalog, variants, promotions, tax, shipping, refunds and a back office — MIT licensed, same Laravel version |
| **Scope** | Writing it well is 12–16 weeks for one developer, before payments, before the back office |
| **Maintenance** | Every rule (tax, promo, partial refund, RMA) becomes ours forever |
| **Risk** | A hand-rolled checkout is where money is lost — silent bugs, no battle-tested edge cases |
| **The owner's instruction** | Bagisto is the commerce system. Full stop |

## What replaced it

`BAGISTO-INTEGRATION.md` — Bagisto as a separate site on the same account, WOODEX OS as the master backend holding
an **interface** (`CommerceGateway`) and **mirrors** (orders/catalog cache), never the engine.

The only part of this document that survives is the mirror-table idea, now six tables:
`commerce_products`, `commerce_orders`, `commerce_order_lines`, `commerce_customers`, `commerce_events`,
`commerce_sync_runs`.
