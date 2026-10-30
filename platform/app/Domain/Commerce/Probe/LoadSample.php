<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Probe;

/**
 * One request, as measured.
 *
 * `milliseconds` is a float because a wall clock is not an integer — this is the one place in
 * the commerce domain where that is true, and it deliberately never touches money. Everything
 * a customer is charged stays in paisa.
 */
final readonly class LoadSample
{
    public function __construct(
        public string $label,
        public int $status,
        public float $milliseconds,
        public ?string $error = null,
    ) {}

    /** A network failure — DNS, timeout, connection reset — has status 0 and an error. */
    public static function failed(string $label, float $milliseconds, string $error): self
    {
        return new self($label, 0, $milliseconds, $error);
    }

    public function isSuccess(): bool
    {
        return $this->error === null && $this->status >= 200 && $this->status < 400;
    }

    public function isServerError(): bool
    {
        return $this->status >= 500;
    }

    public function isClientError(): bool
    {
        return $this->status >= 400 && $this->status < 500;
    }

    public function isNetworkError(): bool
    {
        return $this->error !== null;
    }
}
