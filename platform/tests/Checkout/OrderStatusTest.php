<?php

declare(strict_types=1);

namespace Tests\Checkout;

use App\Domain\Commerce\Checkout\OrderStatus;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The order graph. Every illegal transition here is money lost quietly: an order shipped after
 * it was cancelled, a refund on something never delivered, a COD order marked paid at checkout.
 */
final class OrderStatusTest extends TestCase
{
    public function testTheHappyPathMovesForwardOneStepAtATime(): void
    {
        $path = [
            OrderStatus::PLACED,
            OrderStatus::CONFIRMED,
            OrderStatus::PACKED,
            OrderStatus::SHIPPED,
            OrderStatus::DELIVERED,
        ];

        for ($i = 0; $i < count($path) - 1; $i++) {
            Assert::true(OrderStatus::canMoveTo($path[$i], $path[$i + 1]), "{$path[$i]} → {$path[$i + 1]}");
        }
    }

    public function testAnOrderCannotSkipTheWarehouse(): void
    {
        Assert::same(false, OrderStatus::canMoveTo(OrderStatus::PLACED, OrderStatus::SHIPPED), 'placed → shipped');
        Assert::same(false, OrderStatus::canMoveTo(OrderStatus::CONFIRMED, OrderStatus::DELIVERED), 'confirmed → delivered');
        Assert::same(false, OrderStatus::canMoveTo(OrderStatus::PLACED, OrderStatus::REFUNDED), 'nothing is refunded before it is delivered');
    }

    public function testAnOrderCannotGoBackwards(): void
    {
        Assert::same(false, OrderStatus::canMoveTo(OrderStatus::SHIPPED, OrderStatus::PACKED), 'shipped → packed');
        Assert::same(false, OrderStatus::canMoveTo(OrderStatus::DELIVERED, OrderStatus::SHIPPED), 'delivered → shipped');
    }

    public function testTheEndStatesAreTerminal(): void
    {
        Assert::true(OrderStatus::isTerminal(OrderStatus::CANCELLED), 'a cancelled order stays cancelled');
        Assert::true(OrderStatus::isTerminal(OrderStatus::REFUNDED), 'a refunded order stays refunded');
        Assert::same(false, OrderStatus::isTerminal(OrderStatus::DELIVERED), 'delivery can still be refunded');
        Assert::same([], OrderStatus::nextFrom(OrderStatus::CANCELLED), 'nothing follows');
    }

    public function testCancellingIsPossibleUntilItIsShipped(): void
    {
        Assert::true(OrderStatus::canMoveTo(OrderStatus::PLACED, OrderStatus::CANCELLED), 'before confirmation');
        Assert::true(OrderStatus::canMoveTo(OrderStatus::CONFIRMED, OrderStatus::CANCELLED), 'after confirmation');
        Assert::true(OrderStatus::canMoveTo(OrderStatus::PACKED, OrderStatus::CANCELLED), 'even once packed');
        Assert::same(false, OrderStatus::canMoveTo(OrderStatus::SHIPPED, OrderStatus::CANCELLED), 'not once the courier has it');
    }

    public function testOnlyCancellationRestocks(): void
    {
        Assert::true(OrderStatus::restocksOn(OrderStatus::CANCELLED), 'cancelled units go back on the shelf');
        Assert::same(false, OrderStatus::restocksOn(OrderStatus::DELIVERED), 'delivered units are gone');
        Assert::same(false, OrderStatus::restocksOn(OrderStatus::REFUNDED), 'a refund returns money, not furniture');
    }

    public function testCodIsSettledByTheCourierAndBankTransferIsNot(): void
    {
        Assert::true(OrderStatus::isCashOnDelivery('cod'), 'cod');
        Assert::same(false, OrderStatus::isCashOnDelivery('bank'), 'a transfer is not cash');
        Assert::true(OrderStatus::settlesOnDelivery('cod'), 'cod settles at the door');
        Assert::same(false, OrderStatus::settlesOnDelivery('safepay'), 'a gateway settles through its callback');
    }

    public function testDeliveringACodOrderMarksItPaid(): void
    {
        Assert::same(
            OrderStatus::PAYMENT_PAID,
            OrderStatus::paymentStatusAfter(OrderStatus::DELIVERED, 'cod'),
            'the courier collected the cash',
        );

        Assert::same(
            null,
            OrderStatus::paymentStatusAfter(OrderStatus::DELIVERED, 'bank'),
            'a bank transfer was already paid before shipping; delivery changes nothing',
        );
    }

    public function testCancellationAndRefundSettleThePayment(): void
    {
        Assert::same(OrderStatus::PAYMENT_FAILED, OrderStatus::paymentStatusAfter(OrderStatus::CANCELLED, 'cod'), 'nothing was collected');
        Assert::same(OrderStatus::PAYMENT_REFUNDED, OrderStatus::paymentStatusAfter(OrderStatus::REFUNDED, 'bank'), 'money goes back');
        Assert::same(null, OrderStatus::paymentStatusAfter(OrderStatus::PACKED, 'cod'), 'packing touches no money');
    }

    public function testTheFulfilmentAxisFollowsTheOrderAxis(): void
    {
        Assert::same('unfulfilled', OrderStatus::fulfilmentAfter(OrderStatus::PLACED), 'placed');
        Assert::same('shipped', OrderStatus::fulfilmentAfter(OrderStatus::SHIPPED), 'shipped');
        Assert::same('fulfilled', OrderStatus::fulfilmentAfter(OrderStatus::DELIVERED), 'delivered');
        Assert::same('cancelled', OrderStatus::fulfilmentAfter(OrderStatus::CANCELLED), 'cancelled');
    }

    public function testEveryStatusHasALabelAndIsKnown(): void
    {
        foreach (array_keys(OrderStatus::TRANSITIONS) as $status) {
            Assert::true(OrderStatus::isKnown($status), "{$status} is known");
            Assert::true(isset(OrderStatus::labels()[$status]), "{$status} has a label");
            Assert::same(false, OrderStatus::canMoveTo($status, $status), "{$status} cannot move to itself");
        }

        Assert::same(false, OrderStatus::isKnown('shipping'), 'a typo is not a status');
        Assert::same(false, OrderStatus::canMoveTo('shipping', OrderStatus::SHIPPED), 'and it cannot move anywhere');
        Assert::same([], OrderStatus::nextFrom('shipping'), 'unknown statuses have no exits');
    }
}
