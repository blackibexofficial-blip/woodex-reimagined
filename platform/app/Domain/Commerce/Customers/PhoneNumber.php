<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Customers;

/**
 * A phone number, as the shop actually receives it.
 *
 * There is no customer table in this schema, and that is deliberate: a cash-on-delivery shop
 * has no accounts, so the only identity a customer has is the number the rider calls. The same
 * person types it as `+92 300 1234567`, `0300-1234567` and `03001234567` on three different
 * orders, and any screen that groups on the raw string shows three people who each bought one
 * chair.
 *
 * So the number is normalised to one shape — local, digits only, leading zero — and everything
 * else (grouping, search, dedupe) compares that shape. `format()` puts it back into the shape a
 * human reads.
 *
 * This is a heuristic, not a validator. Pakistan mobile numbers are eleven digits from 03;
 * landlines are ten or eleven from 0. Anything else is kept, counted, and marked implausible
 * rather than thrown away — a blank phone is still an order somebody has to deliver.
 */
final readonly class PhoneNumber
{
    /** Strip everything that is not a digit, then fold the country code into a leading zero. */
    public static function normalise(?string $raw): string
    {
        $digits = preg_replace('/\D+/', '', (string) $raw) ?? '';

        if ($digits === '') {
            return '';
        }

        // 0092… and +92… both arrive as 92… after strip, so one rule covers both.
        //
        // The length guard is 11, not 12: a Karachi landline is `92 21 …`, which leaves eleven
        // digits — the same length as a local mobile, and the reason a `> 11` test silently
        // fails to merge the country code for exactly the numbers businesses use.
        if (str_starts_with($digits, '0092')) {
            $digits = '0'.substr($digits, 4);
        } elseif (str_starts_with($digits, '92') && strlen($digits) >= 11) {
            $digits = '0'.substr($digits, 2);
        }

        // A number entered with the trunk zero already present stays as it is.
        return $digits;
    }

    /** `03001234567` → `0300 1234567`. Unknown shapes are returned untouched. */
    public static function format(?string $raw): string
    {
        $digits = self::normalise($raw);

        if ($digits === '') {
            return '—';
        }

        if (self::isMobile($digits)) {
            return substr($digits, 0, 4).' '.substr($digits, 4);
        }

        if (str_starts_with($digits, '0') && strlen($digits) >= 10) {
            // Karachi and Lahore landlines are 0 + 2-digit area + 8; Islamabad 0 + 3 + 7.
            return substr($digits, 0, 3).' '.substr($digits, 3);
        }

        return $digits;
    }

    public static function isMobile(?string $digits): bool
    {
        $digits = (string) $digits;

        return strlen($digits) === 11 && str_starts_with($digits, '03');
    }

    /**
     * Whether the number looks like something a rider could dial.
     *
     * A typo of one digit still passes; a number entered as `0300` or `+92` does not. The
     * point is to surface the handful that will fail on delivery, not to police the format.
     */
    public static function isPlausible(?string $raw): bool
    {
        $digits = self::normalise($raw);
        $length = strlen($digits);

        return str_starts_with($digits, '0') && $length >= 10 && $length <= 12;
    }

    public static function same(?string $a, ?string $b): bool
    {
        $left = self::normalise($a);
        $right = self::normalise($b);

        return $left !== '' && $left === $right;
    }
}
