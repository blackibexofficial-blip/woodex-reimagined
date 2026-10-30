<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Customers;

/**
 * What the shop knows about one customer, derived entirely from their orders.
 *
 * There is no customer row to read, so every field here is an aggregate: how many orders, what
 * they were worth, when the first and last one were placed. Two derived facts are worth more
 * than the sums:
 *
 * **Repeat.** One order is a trial; the second is the only honest measure of whether the
 * furniture, the price and the delivery were acceptable. A shop that counts customers without
 * counting repeat customers is counting the same person many times and calling it growth.
 *
 * **Name conflict.** The identity is the phone number, so the same number can arrive under
 * different names — a wife ordering for her husband, a shopkeeper, a typo at checkout. That is
 * not an error to correct automatically; it is a thing to show somebody, because it is also
 * what a shared phone at a business looks like.
 */
final readonly class CustomerRecord
{
    /**
     * @param  list<string>  $aliases  other names typed against this number
     */
    public function __construct(
        public string $phone,
        public string $name,
        public array $aliases = [],
        public int $orders = 0,
        public int $lifetimeMinor = 0,
        public int $paidMinor = 0,
        public ?string $city = null,
        public ?string $firstAt = null,
        public ?string $lastAt = null,
    ) {}

    /** More than one order means they came back, which is the only proof that matters. */
    public function isRepeat(): bool
    {
        return $this->orders > 1;
    }

    /** Money owed on their orders — the same arithmetic the invoices screen uses, per person. */
    public function outstandingMinor(): int
    {
        return max(0, $this->lifetimeMinor - $this->paidMinor);
    }

    public function averageOrderMinor(): int
    {
        return $this->orders === 0 ? 0 : intdiv($this->lifetimeMinor, $this->orders);
    }

    /**
     * One number, two names.
     *
     * The canonical name is the one used most often, so the aliases are the minority spellings.
     * They are kept rather than dropped: the rider may need to ask for the other one.
     */
    public function hasNameConflict(): bool
    {
        return $this->aliases !== [];
    }

    public function displayPhone(): string
    {
        return PhoneNumber::format($this->phone);
    }

    /** Whether this number is worth calling at all. */
    public function isReachable(): bool
    {
        return PhoneNumber::isPlausible($this->phone);
    }

    /** The value label a salesperson reads: "3 orders · PKR 216,000". */
    public function summaryLine(): string
    {
        return $this->orders.' '.($this->orders === 1 ? 'order' : 'orders');
    }
}
