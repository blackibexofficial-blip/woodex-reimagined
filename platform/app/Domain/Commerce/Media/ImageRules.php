<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Media;

/**
 * What may be uploaded, decided before a single byte is written.
 *
 * Extension is not enough: a PHP file renamed to `.jpg` passes an extension check and then
 * sits in a folder. The MIME type is read from the file's own bytes, and the two must agree.
 * This is the check that matters most on shared hosting, where a writable directory next to
 * other tenants' sites is a standing invitation.
 */
final readonly class ImageRules
{
    public const int MAX_BYTES = 8 * 1024 * 1024; // 8 MB — a phone photo, not a print master

    /** @var array<string, string> extension => required mime type */
    public const array ALLOWED = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
    ];

    /**
     * @return array{ok: bool, reason: string|null}
     */
    public static function check(string $originalName, string $declaredMime, int $byteCount): array
    {
        if ($byteCount <= 0) {
            return ['ok' => false, 'reason' => 'The file is empty.'];
        }

        if ($byteCount > self::MAX_BYTES) {
            return ['ok' => false, 'reason' => 'Images must be 8 MB or smaller.'];
        }

        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        if (! array_key_exists($extension, self::ALLOWED)) {
            return ['ok' => false, 'reason' => 'Only JPG, PNG and WebP images are accepted.'];
        }

        if (! self::mimeAgreesWithExtension($declaredMime, $extension)) {
            return ['ok' => false, 'reason' => 'That file is not the image type its name claims.'];
        }

        return ['ok' => true, 'reason' => null];
    }

    /**
     * The extension and the sniffed MIME must describe the same format.
     *
     * Deliberately strict: a `.jpg` that is really a PNG is rejected rather than renamed,
     * because accepting it means the extension in the URL no longer describes the bytes —
     * and eventually someone will rely on that.
     */
    public static function mimeAgreesWithExtension(string $mime, string $extension): bool
    {
        $expected = self::ALLOWED[strtolower($extension)] ?? null;

        if ($expected === null) {
            return false;
        }

        $mime = strtolower(trim(explode(';', $mime)[0]));

        return $mime === $expected;
    }

    /** @return list<string> for the `accept` attribute on a file input */
    public static function acceptAttribute(): array
    {
        return array_map(static fn (string $ext): string => 'image/'.($ext === 'jpg' ? 'jpeg' : $ext), array_keys(self::ALLOWED));
    }
}
