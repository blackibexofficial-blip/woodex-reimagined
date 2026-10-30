<?php

declare(strict_types=1);

namespace Tests\Billing;

use App\Domain\Commerce\Billing\PaymentLedger;
use Tests\Support\Assert;

/**
 * Whether the money the shop recorded is the money it received.
 *
 * The order row carries `paid_minor`; the payment rows carry the attempts. They are written by
 * different code paths — the delivery step zeroes one, the bank check writes the other — and
 * nothing in the schema forces them to agree.
 */
final class PaymentLedgerTest
{
    /** @param array<string, mixed> $overrides */
    private function payment(array $overrides = []): array
    {
        return [
            'id' => $overrides['id'] ?? 1,
            'order' => $overrides['order'] ?? 'WDX-000042',
            'gateway' => $overrides['gateway'] ?? 'bank',
            'reference' => array_key_exists('reference', $overrides) ? $overrides['reference'] : 'TRX-88121',
            'amount' => $overrides['amount'] ?? 50_000,
            'status' => $overrides['status'] ?? 'paid',
            'paid_at' => $overrides['paid_at'] ?? '2026-10-30T10:00:00+00:00',
        ];
    }

    public function testAPaymentRowThatMatchesTheOrderIsSettled(): void
    {
        $ledger = new PaymentLedger(
            [$this->payment(['amount' => 50_000])],
            ['WDX-000042' => ['total' => 50_000, 'recorded' => 50_000]],
        );

        Assert::same(0, $ledger->differenceFor('WDX-000042'));
        Assert::same(PaymentLedger::SETTLED, $ledger->stateFor($this->payment()));
        Assert::same([], $ledger->warnings());
    }

    public function testABankTransferNobodyCheckedIsTheFirstWarning(): void
    {
        $ledger = new PaymentLedger(
            [$this->payment(['status' => 'pending', 'amount' => 82_500])],
            ['WDX-000042' => ['total' => 82_500, 'recorded' => 0]],
        );

        Assert::same(1, count($ledger->awaitingVerification()));
        Assert::same(82_500, $ledger->summary()['pending_amount']);
        Assert::same(PaymentLedger::AWAITING, $ledger->stateFor($this->payment(['status' => 'pending'])));

        // A pending payment is not money, so it does not create drift on its own.
        Assert::same(0, $ledger->differenceFor('WDX-000042'));
        Assert::true(str_contains($ledger->warnings()[0], 'waiting to be checked'));
    }

    public function testCashOnDeliveryIsNotAwaitingVerificationBecauseNobodyBanksIt(): void
    {
        $ledger = new PaymentLedger(
            [$this->payment(['gateway' => 'cod', 'status' => 'pending', 'reference' => null, 'amount' => 40_000])],
            ['WDX-000042' => ['total' => 40_000, 'recorded' => 0]],
        );

        Assert::same([], $ledger->awaitingVerification());
        Assert::same([], $ledger->warnings());
        Assert::same(40_000, $ledger->summary()['cod_pending']);
        Assert::same(0, $ledger->summary()['pending']);
    }

    public function testANewerPaymentRowThanTheOrderCounterIsDrift(): void
    {
        // Somebody confirmed the transfer on the payment row and the order was not updated.
        $ledger = new PaymentLedger(
            [$this->payment(['amount' => 50_000])],
            ['WDX-000042' => ['total' => 50_000, 'recorded' => 0]],
        );

        Assert::same(50_000, $ledger->differenceFor('WDX-000042'));
        Assert::same(PaymentLedger::DRIFT, $ledger->stateFor($this->payment()));
        Assert::true(str_contains($ledger->warnings()[0], 'do not agree'));
    }

    public function testAFailedAttemptIsNeitherMoneyNorADiscrepancy(): void
    {
        $ledger = new PaymentLedger(
            [
                $this->payment(['id' => 1, 'status' => 'failed', 'amount' => 50_000, 'reference' => 'TRX-1']),
                $this->payment(['id' => 2, 'status' => 'paid', 'amount' => 50_000, 'reference' => 'TRX-2']),
            ],
            ['WDX-000042' => ['total' => 50_000, 'recorded' => 50_000]],
        );

        Assert::same(0, $ledger->differenceFor('WDX-000042'), 'only paid rows count');
        Assert::same([], $ledger->warnings(), 'a declined card is not an open question');
    }

    public function testTheSameReferenceTwiceIsADuplicate(): void
    {
        $ledger = new PaymentLedger(
            [
                $this->payment(['id' => 1, 'reference' => 'TRX-88121']),
                $this->payment(['id' => 2, 'reference' => 'trx-88121 ']),
            ],
            ['WDX-000042' => ['total' => 100_000, 'recorded' => 100_000]],
        );

        Assert::same(1, count($ledger->duplicateReferences()), 'case and spaces do not make a new reference');
        Assert::same(PaymentLedger::DUPLICATE, $ledger->stateFor($this->payment(['id' => 1])));
    }

    public function testCashReferencesAreNotComparedBecauseTheyAreWrittenByHand(): void
    {
        $ledger = new PaymentLedger(
            [
                $this->payment(['id' => 1, 'gateway' => 'cod', 'reference' => '55']),
                $this->payment(['id' => 2, 'gateway' => 'cod', 'reference' => '55']),
            ],
            ['WDX-000042' => ['total' => 100_000, 'recorded' => 100_000]],
        );

        Assert::same([], $ledger->duplicateReferences());
    }

    public function testABlankReferenceIsNotADuplicateOfEveryOtherBlank(): void
    {
        $ledger = new PaymentLedger(
            [
                $this->payment(['id' => 1, 'reference' => null]),
                $this->payment(['id' => 2, 'reference' => '   ']),
            ],
            ['WDX-000042' => ['total' => 100_000, 'recorded' => 100_000]],
        );

        Assert::same([], $ledger->duplicateReferences());
    }

    public function testPayingMoreThanTheOrderIsWorthSeeing(): void
    {
        $ledger = new PaymentLedger(
            [$this->payment(['amount' => 60_000])],
            ['WDX-000042' => ['total' => 50_000, 'recorded' => 60_000]],
        );

        $over = $ledger->overpayments();

        Assert::same(1, count($over));
        Assert::same(10_000, $over[0]['over']);
        Assert::same(PaymentLedger::OVERPAID, $ledger->stateFor($this->payment(['amount' => 60_000])));
    }

    public function testAnOrderWithNoPaymentsRowsIsNotADrift(): void
    {
        $ledger = new PaymentLedger([], ['WDX-000042' => ['total' => 50_000, 'recorded' => 0]]);

        Assert::same([], $ledger->byOrder());
        Assert::same(0, $ledger->summary()['drift']);
    }

    public function testTwoOrdersAreCountedSeparately(): void
    {
        $ledger = new PaymentLedger(
            [
                $this->payment(['id' => 1, 'order' => 'WDX-1', 'amount' => 10_000, 'reference' => 'A']),
                $this->payment(['id' => 2, 'order' => 'WDX-2', 'amount' => 20_000, 'reference' => 'B']),
            ],
            [
                'WDX-1' => ['total' => 10_000, 'recorded' => 10_000],
                'WDX-2' => ['total' => 20_000, 'recorded' => 5_000],
            ],
        );

        Assert::same(0, $ledger->differenceFor('WDX-1'));
        Assert::same(15_000, $ledger->differenceFor('WDX-2'));
        Assert::same(1, $ledger->summary()['drift']);
    }

    public function testTheSummaryAddsUp(): void
    {
        $ledger = new PaymentLedger(
            [
                $this->payment(['id' => 1, 'status' => 'pending', 'amount' => 30_000, 'reference' => 'P1']),
                $this->payment(['id' => 2, 'status' => 'paid', 'amount' => 70_000, 'reference' => 'P2']),
                $this->payment(['id' => 3, 'gateway' => 'cod', 'status' => 'pending', 'amount' => 20_000, 'reference' => null]),
            ],
            ['WDX-000042' => ['total' => 70_000, 'recorded' => 70_000]],
        );

        $summary = $ledger->summary();

        Assert::same(1, $summary['pending']);
        Assert::same(30_000, $summary['pending_amount']);
        Assert::same(70_000, $summary['received']);
        Assert::same(20_000, $summary['cod_pending']);
        Assert::same(0, $summary['drift']);
        Assert::same(1, $summary['orders']);
    }

    public function testTheBulkStatesAgreeWithTheSingleLookup(): void
    {
        $payments = [
            $this->payment(['id' => 1, 'status' => 'pending', 'amount' => 30_000, 'reference' => 'A']),
            $this->payment(['id' => 2, 'status' => 'paid', 'amount' => 70_000, 'reference' => 'B']),
            $this->payment(['id' => 3, 'status' => 'paid', 'amount' => 70_000, 'reference' => 'B']),
            $this->payment(['id' => 4, 'gateway' => 'cod', 'status' => 'pending', 'amount' => 20_000, 'reference' => null]),
        ];

        $ledger = new PaymentLedger($payments, ['WDX-000042' => ['total' => 70_000, 'recorded' => 70_000]]);
        $states = $ledger->states();

        foreach ($payments as $payment) {
            Assert::same($ledger->stateFor($payment), $states[$payment['id']], "bulk and single agree for payment {$payment['id']}");
        }

        Assert::same(PaymentLedger::AWAITING, $states[1]);
        Assert::same(PaymentLedger::DUPLICATE, $states[2], 'the duplicate outranks the drift');
    }

    public function testEveryWarningIsASentenceSomebodyCanActOn(): void
    {
        $ledger = new PaymentLedger(
            [
                $this->payment(['id' => 1, 'status' => 'pending', 'amount' => 30_000, 'reference' => 'A']),
                $this->payment(['id' => 2, 'status' => 'paid', 'amount' => 70_000, 'reference' => 'B']),
                $this->payment(['id' => 3, 'status' => 'paid', 'amount' => 1_000, 'reference' => 'B']),
            ],
            ['WDX-000042' => ['total' => 70_000, 'recorded' => 0]],
        );

        $warnings = $ledger->warnings();

        Assert::same(3, count($warnings));
        Assert::true(str_contains($warnings[0], 'waiting'), 'pending first: it is the one with a deadline');
        Assert::true(str_contains($warnings[1], 'invoice screen'), 'drift says what the other screens see');
        Assert::true(str_contains($warnings[2], 'reference'), 'duplicates name the thing to look up');
    }
}
