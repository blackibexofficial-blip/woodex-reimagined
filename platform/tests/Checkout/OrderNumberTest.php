<?php

declare(strict_types=1);

namespace Tests\Checkout;

use App\Domain\Commerce\Checkout\OrderNumber;
use InvalidArgumentException;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * Numbers are read aloud on the phone and written on boxes by a courier. The format is a
 * promise to both of them, so it is pinned here and never derived at read time.
 */
final class OrderNumberTest extends TestCase
{
    public function testAnOrderNumberIsPadded(): void
    {
        Assert::same('WDX-000127', OrderNumber::order(127)->value(), 'six digits, zero-filled');
        Assert::same('WDX-000001', OrderNumber::order(1)->value(), 'the first order of the year');
        Assert::same('INV-000127', OrderNumber::invoice(127)->value(), 'invoices share the counter format');
    }

    public function testASequenceThatOutgrowsItsPaddingKeepsCounting(): void
    {
        Assert::same('WDX-1000000', OrderNumber::order(1000000)->value(), 'seven digits rather than a duplicate');

        $wide = new OrderNumber('WDX', 7, 8);

        Assert::same('WDX-00000007', $wide->value(), 'padding is configurable, per series');
    }

    public function testTheNumberCastsToAStringSoItCanBeConcatenated(): void
    {
        Assert::same('Order WDX-000005', 'Order '.(string) OrderNumber::order(5), 'no accidental "Object"');
    }

    public function testTheNextNumberIsOneMore(): void
    {
        $next = OrderNumber::order(9)->next();

        Assert::same('WDX-000010', $next->value(), 'and the padding carries');
        Assert::same(10, $next->number, 'the value travels with it');
    }

    public function testALowercaseOrTooLongPrefixIsRefused(): void
    {
        Assert::throws(InvalidArgumentException::class, static fn () => new OrderNumber('wdx', 1), 'lowercase');
        Assert::throws(InvalidArgumentException::class, static fn () => new OrderNumber('TOOLONGPREFIX', 1), 'too long');
        Assert::throws(InvalidArgumentException::class, static fn () => new OrderNumber('W1', 1), 'digits');
    }

    public function testASequenceHelperAlsoRefusesZeroAndFoolishPadding(): void
    {
        Assert::throws(InvalidArgumentException::class, static fn () => OrderNumber::order(0), 'zero');
        Assert::throws(InvalidArgumentException::class, static fn () => new OrderNumber('WDX', 1, 2), 'padding too small');
        Assert::throws(InvalidArgumentException::class, static fn () => new OrderNumber('WDX', 1, 20), 'padding too large');
    }
}
