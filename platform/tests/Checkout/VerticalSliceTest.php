<?php

declare(strict_types=1);

namespace Tests\Checkout;

use App\Domain\Commerce\Checkout\OrderDraft;
use App\Domain\Commerce\Checkout\OrderNumber;
use App\Domain\Commerce\Checkout\OrderStatus;
use App\Domain\Commerce\Checkout\PricedCart;
use App\Domain\Commerce\Checkout\StockPlanner;
use App\Domain\Commerce\Checkout\StockRequest;
use App\Domain\Commerce\Checkout\StockRow;
use App\Domain\Commerce\Pricing\CartCalculator;
use App\Domain\Commerce\Pricing\DiscountRule;
use App\Domain\Commerce\Pricing\ShippingMethod;
use App\Domain\Commerce\Support\Money;
use LogicException;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * T11's acceptance test: a product becomes a cart, the cart becomes a COD order, and the order
 * becomes an invoice — with every number reconciling.
 *
 * What this proves is the part that is expensive to get wrong: the paisa. Prices, a coupon, an
 * 18% tax, a delivery charge and the stock decrement all meet here, and the invoice, the
 * payment and the order must agree to the last unit.
 *
 * What it does not prove is the transaction. Locking, rollback and "ten parallel orders for one
 * unit, exactly one succeeds" need a database and belong to T12's load probe. This suite is the
 * spec that probe will check against.
 */
final class VerticalSliceTest extends TestCase
{
    /** A sofa at ₨125,000 and two chairs at ₨34,500, 18% GST, 10% coupon, flat ₨2,500 delivery. */
    private function scenario(): array
    {
        $rows = [
            ['sku' => 'WX-1001', 'name' => 'HARIS — 3-seater', 'qty' => 1, 'unit_price_minor' => 12_500_000, 'tax_rate_bp' => 1800, 'product_id' => 1],
            ['sku' => 'WX-1002', 'name' => 'BALLMER — dining chair', 'qty' => 2, 'unit_price_minor' => 3_450_000, 'tax_rate_bp' => 1800, 'product_id' => 2],
        ];

        $cart = PricedCart::fromRows(
            rows: $rows,
            shipping: new ShippingMethod(
                code: 'cod',
                label: 'Cash on delivery',
                baseRate: new Money(250_000),
                freeOver: new Money(20_000_000),
                etaDays: 4,
            ),
            rules: [new DiscountRule(DiscountRule::COUPON, DiscountRule::PERCENT, 1000, 'Eid sale', 'EID10')],
        );

        return [$cart, (new CartCalculator)->calculate($cart)];
    }

    public function testTheCartIsPricedToThePaisa(): void
    {
        [, $totals] = $this->scenario();

        Assert::same(19_400_000, $totals->subtotal->minor, '1 × 125,000 + 2 × 34,500 = 194,000 rupees');
        Assert::same(1_940_000, $totals->discountTotal->minor, 'the coupon takes exactly 10%');
        Assert::same(17_460_000, $totals->netTotal->minor, 'what is left before tax');
        Assert::same(3_142_800, $totals->taxTotal->minor, '18% of 174,600 = 31,428');
        Assert::same(250_000, $totals->shippingTotal->minor, 'delivery is charged: 194,000 is under the free threshold');
        Assert::same(20_852_800, $totals->grandTotal->minor, '208,528 rupees');
    }

    public function testTheStockIsAllocatedBeforeTheOrderExists(): void
    {
        $plan = (new StockPlanner)->plan(
            [new StockRequest('1', 'WX-1001', 1), new StockRequest('2', 'WX-1002', 2)],
            [
                new StockRow('1', '1', 'Lahore', onHand: 10, priority: 1),
                new StockRow('2', '1', 'Lahore', onHand: 5, priority: 1),
            ],
        );

        Assert::true($plan->isComplete(), 'both lines can be filled from Lahore');
        Assert::same(1, $plan->allocatedQty('1'), 'one sofa');
        Assert::same(2, $plan->allocatedQty('2'), 'two chairs');
        Assert::same([9, 3], [10 - $plan->allocatedQty('1'), 5 - $plan->allocatedQty('2')], 'what is left on the shelf afterwards');
    }

    public function testAnOrderThatCannotBeFilledFromStockNeverBecomesADraft(): void
    {
        $plan = (new StockPlanner)->plan(
            [new StockRequest('2', 'WX-1002', 2)],
            [new StockRow('2', '1', 'Lahore', onHand: 1)],
        );

        Assert::same(false, $plan->isComplete(), 'one chair short');
        Assert::same('WX-1002: 1 available, 2 requested', $plan->summary(), 'and the customer is told why');
    }

    public function testTheCodOrderInvoiceAndPaymentAllCarryTheSameTotal(): void
    {
        [, $totals] = $this->scenario();

        $draft = OrderDraft::assemble(
            totals: $totals,
            number: OrderNumber::order(127),
            invoiceNumber: OrderNumber::invoice(127),
            gateway: 'cod',
            addresses: [self::address()],
            source: 'web',
            couponCode: 'EID10',
        );

        $order = $draft->toOrderRow();
        $invoice = $draft->toInvoiceRow();
        $payment = $draft->toPaymentRow();

        Assert::same('WDX-000127', $order['number'], 'the order number a customer reads out');
        Assert::same(20_852_800, $order['grand_total_minor'], 'the order total');
        Assert::same(20_852_800, $invoice['total_minor'], 'the invoice says the same');
        Assert::same(20_852_800, $payment['amount_minor'], 'and the payment is for the same money');
        Assert::same('INV-000127', $invoice['number'], 'invoices keep pace with orders');
        Assert::same('issued', $invoice['status'], 'the invoice is issued on placement');
    }

    public function testACodOrderStartsUnpaidAndUnfulfilled(): void
    {
        [, $totals] = $this->scenario();

        $order = OrderDraft::assemble(
            totals: $totals,
            number: OrderNumber::order(1),
            invoiceNumber: OrderNumber::invoice(1),
            gateway: 'cod',
            addresses: [self::address()],
        )->toOrderRow();

        Assert::same(OrderStatus::PLACED, $order['status'], 'placed');
        Assert::same(OrderStatus::PAYMENT_PENDING, $order['payment_status'], 'the courier has not been paid yet');
        Assert::same(0, $order['paid_minor'], 'nothing has been collected');
        Assert::same('unfulfilled', $order['fulfilment_status'], 'nothing has been shipped');
        Assert::same(['EID10 · Eid sale'], $order['applied_rules'], 'the customer can see what was applied');
    }

    public function testTheOrderItemsAddUpToTheOrderAndTheInvoiceItemsAddUpToTheInvoice(): void
    {
        [, $totals] = $this->scenario();

        $draft = OrderDraft::assemble(
            totals: $totals,
            number: OrderNumber::order(2),
            invoiceNumber: OrderNumber::invoice(2),
            gateway: 'cod',
            addresses: [self::address()],
        );

        $items = $draft->toItemRows([
            'WX-1001' => ['variant_id' => 11, 'product_id' => 1, 'meta' => ['finish' => 'natural-oak']],
            'WX-1002' => ['variant_id' => 12, 'product_id' => 2],
        ]);

        Assert::same(2, count($items), 'two order lines');
        Assert::same(['WX-1001', 'WX-1002'], array_column($items, 'sku'), 'in cart order');
        Assert::same(11, $items[0]['variant_id'], 'the variant travels with the line');
        Assert::same(['finish' => 'natural-oak'], $items[0]['meta'], 'and so does the choice that was made');
        Assert::same(13_275_000, $items[0]['line_total_minor'], '125,000 less 10% plus 18%');
        Assert::same(7_327_800, $items[1]['line_total_minor'], '2 × 34,500 less 10% plus 18%');
        Assert::same(
            20_852_800,
            array_sum(array_column($items, 'line_total_minor')) + 250_000,
            'lines + delivery = the order total',
        );

        $invoiceItems = $draft->toInvoiceItemRows($items);

        Assert::same(3, count($invoiceItems), 'two lines and the delivery charge');
        Assert::same('Delivery', $invoiceItems[2]['description'], 'delivery is itemised, not hidden in a line');
        Assert::same(
            20_852_800,
            array_sum(array_column($invoiceItems, 'amount_minor')),
            'the invoice items add up to the invoice',
        );
    }

    public function testTheAddressIsCopiedOntoTheOrderAtPlacement(): void
    {
        [, $totals] = $this->scenario();

        $draft = OrderDraft::assemble(
            totals: $totals,
            number: OrderNumber::order(3),
            invoiceNumber: OrderNumber::invoice(3),
            gateway: 'cod',
            addresses: [self::address(), self::address('billing', '35202-1234567-1')],
        );

        $rows = $draft->toAddressRows();

        Assert::same(['shipping', 'billing'], array_column($rows, 'type'), 'both addresses');
        Assert::same('DHA Phase 5', $rows[0]['city'], 'the city the courier needs');
        Assert::same('PK', $rows[0]['country'], 'and a default country');
    }

    public function testAnOrderWithNoAddressIsRefusedBeforeItIsSaved(): void
    {
        [, $totals] = $this->scenario();

        Assert::throws(
            LogicException::class,
            static fn () => OrderDraft::assemble(
                totals: $totals,
                number: OrderNumber::order(4),
                invoiceNumber: OrderNumber::invoice(4),
                gateway: 'cod',
                addresses: [],
            ),
            'a COD order with no address cannot be delivered or collected',
        );
    }

    public function testTheHistoryStartsWithPlacement(): void
    {
        [, $totals] = $this->scenario();

        $history = OrderDraft::assemble(
            totals: $totals,
            number: OrderNumber::order(5),
            invoiceNumber: OrderNumber::invoice(5),
            gateway: 'cod',
            addresses: [self::address()],
        )->toHistoryRow();

        Assert::same(null, $history['from_status'], 'there was nothing before');
        Assert::same(OrderStatus::PLACED, $history['to_status'], 'placed');
        Assert::same('Order placed via web', $history['note'], 'and where it came from');
    }

    public function testDeliveringTheOrderIsWhatMarksItPaid(): void
    {
        [, $totals] = $this->scenario();

        $order = OrderDraft::assemble(
            totals: $totals,
            number: OrderNumber::order(6),
            invoiceNumber: OrderNumber::invoice(6),
            gateway: 'cod',
            addresses: [self::address()],
        )->toOrderRow();

        Assert::same(OrderStatus::PAYMENT_PENDING, $order['payment_status'], 'pending at placement');

        // Walk the order forward, one legal step at a time, checking that nothing along the way
        // touches the money. A COD order is unpaid until the courier hands over the goods.
        $path = [OrderStatus::CONFIRMED, OrderStatus::PACKED, OrderStatus::SHIPPED, OrderStatus::DELIVERED];

        foreach ($path as $step) {
            Assert::true(OrderStatus::canMoveTo($order['status'], $step), "{$order['status']} → {$step} is legal");

            $settled = OrderStatus::paymentStatusAfter($step, 'cod');

            Assert::same(
                $step === OrderStatus::DELIVERED ? OrderStatus::PAYMENT_PAID : null,
                $settled,
                "{$step} settles the payment only if it is delivery",
            );

            $order['status'] = $step;
        }

        Assert::same(20_852_800, $order['grand_total_minor'], 'the amount is what the order said, not the catalog today');
    }

    /** @return array<string, string> */
    private static function address(string $type = 'shipping', string $phone = '0300-1234567'): array
    {
        return [
            'type' => $type,
            'name' => 'Ayesha Khan',
            'phone' => $phone,
            'line1' => 'House 42, Street 7',
            'city' => 'DHA Phase 5',
            'province' => 'Punjab',
        ];
    }
}
