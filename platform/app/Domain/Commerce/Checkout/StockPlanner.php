<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

/**
 * Decides which warehouse ships what.
 *
 * The algorithm is deliberately boring: for each request, walk that variant's stock rows in
 * priority order and take what fits. Boring is the requirement — this runs inside the checkout
 * transaction, under a row lock, and anything clever here (bundle logic, cross-variant swaps,
 * backorder forecasting) is a place where two concurrent customers can be told they bought the
 * same chair.
 *
 * It is pure: given the same rows and requests it produces the same plan, in the same order,
 * on any machine. The database work — locking, decrementing, writing reservations — belongs to
 * the caller, which is the only place a race can actually happen.
 */
final class StockPlanner
{
    /**
     * @param  list<StockRequest>  $requests
     * @param  list<StockRow>  $rows
     */
    public function plan(array $requests, array $rows): StockPlan
    {
        // Group once. Sorting per request would re-sort the same rows for every variant and
        // makes the tie-break order harder to reason about.
        $byVariant = [];

        foreach ($rows as $row) {
            $byVariant[$row->variantId][] = $row;
        }

        foreach ($byVariant as $variantId => $variantRows) {
            usort($variantRows, static function (StockRow $a, StockRow $b): int {
                return [$a->priority, (int) $a->sourceId] <=> [$b->priority, (int) $b->sourceId];
            });

            $byVariant[$variantId] = $variantRows;
        }

        $allocations = [];
        $shortfalls = [];

        foreach ($requests as $request) {
            $wanted = $request->qty;

            foreach ($byVariant[$request->variantId] ?? [] as $row) {
                if ($wanted === 0) {
                    break;
                }

                $take = min($wanted, $row->available());

                if ($take <= 0) {
                    continue;
                }

                $allocations[] = [
                    'variantId' => $row->variantId,
                    'sku' => $request->sku,
                    'sourceId' => $row->sourceId,
                    'sourceName' => $row->sourceName,
                    'qty' => $take,
                ];

                $wanted -= $take;
            }

            if ($wanted > 0) {
                $shortfalls[] = [
                    'variantId' => $request->variantId,
                    'sku' => $request->sku,
                    'requested' => $request->qty,
                    'available' => $request->qty - $wanted,
                ];
            }
        }

        return new StockPlan($allocations, $shortfalls);
    }
}
