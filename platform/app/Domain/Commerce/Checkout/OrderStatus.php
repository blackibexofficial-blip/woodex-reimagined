<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

/**
 * The order's life, as a set of allowed moves.
 *
 * Statuses are a graph, not a checklist, and every illegal move is a bug that costs money:
 * shipping a cancelled order, refunding one that was never placed, marking a bank transfer
 * paid before the money arrived. So the graph lives here, in one class, and the admin screens
 * ask it rather than comparing strings.
 *
 * There is no `paid` order status. Payment is a *separate* axis (`payment_status`) because an
 * order can be delivered and unpaid (COD, cash on the doorstep) or paid and not shipped (a
 * transfer that cleared overnight). Collapsing the two axes is how "where is my order" becomes
 * unanswerable.
 */
final class OrderStatus
{
    public const string PLACED = 'placed';

    public const string CONFIRMED = 'confirmed';

    public const string PACKED = 'packed';

    public const string SHIPPED = 'shipped';

    public const string DELIVERED = 'delivered';

    public const string CANCELLED = 'cancelled';

    public const string REFUNDED = 'refunded';

    public const string PAYMENT_PENDING = 'pending';

    public const string PAYMENT_PAID = 'paid';

    public const string PAYMENT_FAILED = 'failed';

    public const string PAYMENT_REFUNDED = 'refunded';

    /** Payment methods that collect the money at the door, not at checkout. */
    public const array COD_GATEWAYS = ['cod'];

    /** @var array<string, list<string>> */
    public const array TRANSITIONS = [
        self::PLACED => [self::CONFIRMED, self::CANCELLED],
        self::CONFIRMED => [self::PACKED, self::CANCELLED],
        self::PACKED => [self::SHIPPED, self::CANCELLED],
        self::SHIPPED => [self::DELIVERED],
        self::DELIVERED => [self::REFUNDED],
        self::CANCELLED => [],
        self::REFUNDED => [],
    ];

    /** @return array<string, string> */
    public static function labels(): array
    {
        return [
            self::PLACED => 'Placed',
            self::CONFIRMED => 'Confirmed',
            self::PACKED => 'Packed',
            self::SHIPPED => 'Shipped',
            self::DELIVERED => 'Delivered',
            self::CANCELLED => 'Cancelled',
            self::REFUNDED => 'Refunded',
        ];
    }

    public static function isKnown(string $status): bool
    {
        return array_key_exists($status, self::TRANSITIONS);
    }

    public static function canMoveTo(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    /** @return list<string> the statuses this one may become */
    public static function nextFrom(string $from): array
    {
        return self::TRANSITIONS[$from] ?? [];
    }

    public static function isTerminal(string $status): bool
    {
        return (self::TRANSITIONS[$status] ?? null) === [];
    }

    /** Cancelling restores stock; nothing else does. */
    public static function restocksOn(string $status): bool
    {
        return $status === self::CANCELLED;
    }

    public static function isCashOnDelivery(string $gateway): bool
    {
        return in_array($gateway, self::COD_GATEWAYS, true);
    }

    /**
     * A COD order is paid when it is delivered — that is the moment the courier hands over the
     * cash. Every other gateway settles before shipping, through its own callback.
     */
    public static function settlesOnDelivery(string $gateway): bool
    {
        return self::isCashOnDelivery($gateway);
    }

    /** What the payment status becomes when the order reaches this status, if anything. */
    public static function paymentStatusAfter(string $orderStatus, string $gateway): ?string
    {
        return match (true) {
            $orderStatus === self::DELIVERED && self::settlesOnDelivery($gateway) => self::PAYMENT_PAID,
            $orderStatus === self::CANCELLED => self::PAYMENT_FAILED,
            $orderStatus === self::REFUNDED => self::PAYMENT_REFUNDED,
            default => null,
        };
    }

    /** Which fulfilment axis value an order status implies. */
    public static function fulfilmentAfter(string $orderStatus): string
    {
        return match ($orderStatus) {
            self::DELIVERED => 'fulfilled',
            self::SHIPPED => 'shipped',
            self::CANCELLED, self::REFUNDED => 'cancelled',
            default => 'unfulfilled',
        };
    }
}
