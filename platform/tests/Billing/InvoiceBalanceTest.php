<?php

declare(strict_types=1);

namespace Tests\Billing;

use App\Domain\Commerce\Billing\InvoiceBalance;
use Tests\Support\Assert;

/**
 * What an invoice is owed.
 *
 * The stored status string is written once at issue and then never moves, so it is not the
 * truth — the money is. These are the cases where the two disagree, and where a refund quietly
 * turns a settled invoice back into a claim.
 */
final class InvoiceBalanceTest extends \Tests\TestCase
{
    public function testAnUntouchedInvoiceIsIssuedAndOwesEverything(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 6386000, paidMinor: 0);

        Assert::same('issued', $invoice->status(), 'nothing received yet');
        Assert::same(6386000, $invoice->outstandingMinor(), 'the whole amount is owed');
        Assert::same(0, $invoice->netPaidMinor(), 'and nothing is paid');
        Assert::same('Issued', $invoice->label(), 'in plain words');
        Assert::same('info', $invoice->tone(), 'and as information, not a problem');
        Assert::same(false, $invoice->isSettled(), 'not settled');
    }

    public function testFullPaymentSettlesItWhateverTheStoredStatusSays(): void
    {
        // The stored row still says "issued" — that is the whole point.
        $invoice = new InvoiceBalance(totalMinor: 6386000, paidMinor: 6386000);

        Assert::same('paid', $invoice->status(), 'the money decides');
        Assert::same(0, $invoice->outstandingMinor(), 'nothing owed');
        Assert::same(true, $invoice->isSettled(), 'settled');
        Assert::same('success', $invoice->tone(), 'and shown as done');
    }

    public function testAPartialPaymentIsPartPaidNotPaid(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 6386000, paidMinor: 2000000);

        Assert::same('part_paid', $invoice->status(), 'something, not everything');
        Assert::same(4386000, $invoice->outstandingMinor(), 'the balance is exact');
        Assert::same('Part paid', $invoice->label(), 'in plain words');
        Assert::same('warning', $invoice->tone(), 'as a warning');
    }

    public function testARefundTurnsASettledInvoiceBackIntoAClaim(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 50000, paidMinor: 50000, refundedMinor: 5000);

        Assert::same(45000, $invoice->netPaidMinor(), 'a refund is money going back out');
        Assert::same(5000, $invoice->outstandingMinor(), 'so the invoice is owed again');
        Assert::same('part_paid', $invoice->status(), 'and is no longer paid');
        Assert::same(false, $invoice->isSettled(), 'settled is not a permanent state');
    }

    public function testARefundLargerThanThePaymentNeverGoesNegative(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 50000, paidMinor: 50000, refundedMinor: 60000);

        Assert::same(0, $invoice->netPaidMinor(), 'clamped at zero');
        Assert::same(50000, $invoice->outstandingMinor(), 'the invoice is owed in full');
        Assert::same('issued', $invoice->status(), 'with nothing net received');
    }

    public function testAVoidInvoiceIsNotAClaimWhateverTheMoneySays(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 6386000, paidMinor: 0, isVoid: true);

        Assert::same('void', $invoice->status(), 'void wins over everything');
        Assert::same(false, $invoice->isSettled(), 'and is not a settled claim either');
        Assert::same(false, $invoice->isOverdue(), 'a void document cannot be late');
        Assert::same('Void', $invoice->label(), 'labelled as such');
        Assert::same('neutral', $invoice->tone(), 'and drawn quietly');
    }

    public function testARefundedVoidInvoiceIsStillVoid(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 100000, paidMinor: 100000, refundedMinor: 100000, isVoid: true);

        Assert::same('void', $invoice->status(), 'void outranks paid');
        Assert::same(false, $invoice->isSettled(), 'and never counts as settled');
    }

    public function testAZeroValueInvoiceIsPaidOnIssue(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 0, paidMinor: 0);

        Assert::same('paid', $invoice->status(), 'nothing to collect');
        Assert::same(0, $invoice->outstandingMinor(), 'nothing owed');
        Assert::same('success', $invoice->tone(), 'shown as done');
        Assert::same(false, $invoice->mayStampPaid(false), 'but nothing is stamped on the paperwork');
    }

    public function testOverdueIsAboutTheDeadlineNotTheStatus(): void
    {
        $onTime = new InvoiceBalance(totalMinor: 50000, paidMinor: 0, daysUntilDue: 5);
        $dueToday = new InvoiceBalance(totalMinor: 50000, paidMinor: 0, daysUntilDue: 0);
        $late = new InvoiceBalance(totalMinor: 50000, paidMinor: 0, daysUntilDue: -12);

        Assert::same(false, $onTime->isOverdue(), 'five days to go is not late');
        Assert::same(false, $dueToday->isOverdue(), 'due today is not late');
        Assert::same(true, $late->isOverdue(), 'twelve days past is late');
        Assert::same(12, $late->daysOverdue(), 'and says how late');
        Assert::same(0, $onTime->daysOverdue(), 'on time is zero');
    }

    public function testAPaidInvoiceCannotBeOverdue(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 50000, paidMinor: 50000, daysUntilDue: -40);

        Assert::same(false, $invoice->isOverdue(), 'nothing is outstanding, so nothing is late');
        Assert::same('Paid', $invoice->label(), 'it reads as paid, not overdue');
    }

    public function testOverdueOwesOnlyWhileMoneyIsOutstanding(): void
    {
        $invoice = new InvoiceBalance(totalMinor: 50000, paidMinor: 45000, daysUntilDue: -3);

        Assert::same(true, $invoice->isOverdue(), 'still owed, still late');
        Assert::same('Overdue', $invoice->label(), 'and the deadline is the louder fact');
        Assert::same('error', $invoice->tone(), 'shown as an error');
    }

    public function testAgingBucketsAreExactAtTheBoundaries(): void
    {
        Assert::same('current', (new InvoiceBalance(1000, 0, daysUntilDue: 3))->bucket(), 'not late');
        Assert::same('current', (new InvoiceBalance(1000, 1000, daysUntilDue: -80))->bucket(), 'paid is never aged');
        Assert::same('0-30', (new InvoiceBalance(1000, 0, daysUntilDue: -30))->bucket(), 'thirty days is the first bucket');
        Assert::same('31-60', (new InvoiceBalance(1000, 0, daysUntilDue: -31))->bucket(), 'thirty-one moves it');
        Assert::same('61-90', (new InvoiceBalance(1000, 0, daysUntilDue: -61))->bucket(), 'sixty-one moves it again');
        Assert::same('90+', (new InvoiceBalance(1000, 0, daysUntilDue: -91))->bucket(), 'and past ninety');
        Assert::same('current', (new InvoiceBalance(1000, 0, daysUntilDue: null))->bucket(), 'no deadline is not overdue');
    }

    public function testStampingPaidIsRefusedForCashOnDelivery(): void
    {
        $settled = new InvoiceBalance(totalMinor: 50000, paidMinor: 50000);

        Assert::same(true, $settled->mayStampPaid(false), 'a bank transfer is settled when the money lands');
        Assert::same(false, $settled->mayStampPaid(true), 'cash on delivery is not collected until the van has been');
        Assert::same(false, (new InvoiceBalance(50000, 25000))->mayStampPaid(false), 'and a balance is never stamped');
        Assert::same(false, (new InvoiceBalance(50000, 50000, isVoid: true))->mayStampPaid(false), 'nor is a void one');
    }
}
