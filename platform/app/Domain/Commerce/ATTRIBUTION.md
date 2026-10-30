# Attribution — Bagisto (MIT)

This domain re-implements functionality whose reference implementation is
[Bagisto](https://github.com/bagisto/bagisto), released under the MIT licence.

Bagisto is **not** run, vendored or required at runtime. What is borrowed is the
*pipeline semantics* — the order in which a cart is priced — which were read from the upstream
source and restated here in our own code so the behaviour could be reviewed line by line.

## Ported behaviour

| File | What was taken | Upstream area (Bagisto 2.5, MIT) |
|---|---|---|
| `Pricing/CartCalculator.php` | order of operations: catalog discounts → cart rules → tax → shipping; discount distribution across lines; capping at what is owed; free-shipping threshold evaluation | `Webkul\Checkout\Cart`, `Webkul\CartRule`, `Webkul\CatalogRule` |
| `Pricing/CartCalculator.php` | tax applied to the discounted net, inclusive rates extracted rather than added | `Webkul\Tax\...\Calculator` |
| `Support/Money.php` | half-up rounding at the point of conversion; proportional split that never loses a minor unit | `Webkul\Core\Helpers\ExchangeRate`, price rounding helpers |
| `Pricing/DiscountRule.php` | percentage / fixed shapes, minimum-spend qualification, stacking order | `Webkul\CartRule\Helpers\CartRule` |

## What was deliberately **not** taken

Controllers, Blade/admin views, route files, migrations, service providers, the Vue admin,
the Elasticsearch search stack, the multi-vendor marketplace package.

## Consequence for maintainers

- If a calculation changes, the change must be justified against the 14 golden fixtures in
  `tests/fixtures/commerce/totals/` — those numbers are the contract.
- The upstream project may be consulted for a specific rule, but code is copied into *our*
  classes with a comment pointing at what it mirrors. We never `require` Bagisto.
- The MIT notice below must travel with any substantial verbatim portion of upstream code.

---

The MIT License (MIT)

Copyright (c) Bagisto

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
