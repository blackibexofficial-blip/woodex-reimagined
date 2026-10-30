<?php

declare(strict_types=1);

namespace Tests\Media;

use App\Domain\Commerce\Media\ImageRules;
use App\Domain\Commerce\Media\ImageVariant;
use App\Domain\Commerce\Media\MediaPath;
use InvalidArgumentException;
use Tests\Support\Assert;

/**
 * The path rules are the security boundary for a public image route, so they get tested like
 * one: what is accepted, what is refused, and what a hostile input turns into.
 */
final class MediaPathTest extends \Tests\TestCase
{
    public function testDirectoryComesFromTheSkuAndCannotEscape(): void
    {
        $paths = new MediaPath;

        Assert::same('commerce/products/wx-ch-001', $paths->directoryFor('WX-CH-001'), 'ordinary SKU');
        Assert::same('commerce/products/wx-ch-001', $paths->directoryFor('  wx ch 001  '), 'spaces and padding');
        Assert::same('commerce/products/a-b', $paths->directoryFor('../../a/b'), 'traversal collapses to a slug');
        Assert::same('commerce/products/a-b', $paths->directoryFor('A.B'), 'punctuation becomes a dash');

        // The property that matters: a directory segment never contains a separator.
        // An input with no usable characters is refused outright — which is also safe, and
        // better than inventing a folder name for it.
        foreach (['../../etc', 'a/b/c', './x', 'c:\\windows', '..'] as $hostile) {
            try {
                $directory = $paths->directoryFor($hostile);
            } catch (InvalidArgumentException) {
                Assert::true(true, "[{$hostile}] is refused outright");

                continue;
            }

            $segment = substr($directory, strlen('commerce/products/'));

            Assert::true(! str_contains($segment, '/'), "[{$hostile}] produces a single directory segment");
            Assert::true(! str_contains($segment, '..'), "[{$hostile}] leaves no traversal in the segment");
        }
    }

    public function testAnEmptySkuIsRejectedRatherThanSilentlyStoredSomewhereOdd(): void
    {
        Assert::throws(
            InvalidArgumentException::class,
            static fn () => (new MediaPath)->directoryFor('///'),
            'a SKU with no usable characters',
        );
    }

    public function testFileNamesAreHashAndVariantOnly(): void
    {
        $paths = new MediaPath;
        $hash = 'a1b2c3d4e5f60718';

        Assert::same(
            'commerce/products/wx-1/'.$hash.'-thumb.webp',
            $paths->filePath('WX-1', $hash, ImageVariant::Thumb),
            'thumb path',
        );
        Assert::same(
            'commerce/products/wx-1/'.$hash.'-hero.webp',
            $paths->filePath('WX-1', $hash, ImageVariant::Hero),
            'hero path',
        );
    }

    public function testUploadedFileNamesNeverReachTheStoredPath(): void
    {
        $paths = new MediaPath;
        $hash = 'deadbeefdeadbeef';

        $path = $paths->filePath('WX-1', $hash, ImageVariant::Card);

        foreach (['../../evil.php', 'shell.jpg', 'photo name (1).jpg'] as $original) {
            Assert::true(! str_contains($path, $original), "[{$original}] does not appear in the stored path");
        }
    }

    public function testValidRequestPathsAcceptOnlyWhatWeGenerate(): void
    {
        $paths = new MediaPath;

        Assert::true($paths->isValidRequestPath('wx-1/a1b2c3d4e5f60718-thumb.webp'), 'a generated path');
        Assert::true($paths->isValidRequestPath('wx-ch-001/0123456789abcdef0123456789abcdef-hero.webp'), 'full hash');

        foreach ([
            '../.env',
            'wx-1/../../.env',
            'wx-1/a1b2c3d4e5f60718-thumb.php',
            'wx-1/a1b2c3d4e5f60718-thumb.webp.php',
            'wx-1/a1b2c3d4e5f60718-giant.webp',
            'wx-1/SHORT-thumb.webp',
            'wx-1/a1b2c3d4e5f60718-thumb.webp/extra',
            '/etc/passwd',
            'wx-1/a1b2c3d4e5f60718-thumb.webp%00.jpg',
            'wx/sub/a1b2c3d4e5f60718-thumb.webp',
        ] as $hostile) {
            Assert::true(! $paths->isValidRequestPath($hostile), "refuses [{$hostile}]");
        }
    }

    public function testSrcsetListsEverySizeInAscendingWidth(): void
    {
        $paths = new MediaPath;
        $srcset = $paths->srcset('WX-1', 'abc12345');

        Assert::true(str_contains($srcset, '400w'), 'thumb width listed');
        Assert::true(str_contains($srcset, '800w'), 'card width listed');
        Assert::true(str_contains($srcset, '1600w'), 'hero width listed');

        $positions = [
            strpos($srcset, '400w'),
            strpos($srcset, '800w'),
            strpos($srcset, '1600w'),
        ];

        Assert::true($positions[0] < $positions[1] && $positions[1] < $positions[2], 'ascending order');
    }

    public function testHashIsStableAndShort(): void
    {
        $hash = MediaPath::hashFor('some image bytes');

        Assert::same($hash, MediaPath::hashFor('some image bytes'), 'same bytes, same hash');
        Assert::true($hash !== MediaPath::hashFor('other bytes'), 'different bytes, different hash');
        Assert::same(32, strlen($hash), '32 hex characters — short enough for a URL, long enough to collide rarely');
        Assert::true(preg_match('/^[a-f0-9]+$/', $hash) === 1, 'lowercase hex only');
    }

    public function testUploadRulesRejectWhatTheyShould(): void
    {
        Assert::same(true, ImageRules::check('chair.jpg', 'image/jpeg', 1000)['ok'], 'a real jpeg');
        Assert::same(true, ImageRules::check('chair.PNG', 'image/png', 1000)['ok'], 'uppercase extension');
        Assert::same(true, ImageRules::check('chair.webp', 'image/webp', 1000)['ok'], 'webp');

        Assert::same(false, ImageRules::check('shell.php', 'application/x-php', 100)['ok'], 'a php file');
        Assert::same(false, ImageRules::check('chair.jpg', 'image/png', 100)['ok'], 'mime disagrees with extension');
        Assert::same(false, ImageRules::check('chair.jpg', 'image/jpeg', 0)['ok'], 'an empty file');
        Assert::same(false, ImageRules::check('chair.jpg', 'image/jpeg', ImageRules::MAX_BYTES + 1)['ok'], 'too large');
        Assert::same(false, ImageRules::check('chair.gif', 'image/gif', 100)['ok'], 'gif is not accepted');
        Assert::same(false, ImageRules::check('no-extension', 'image/jpeg', 100)['ok'], 'no extension');
    }

    public function testTheReasonExplainsTheRefusal(): void
    {
        $result = ImageRules::check('shell.php', 'application/x-php', 100);

        Assert::true($result['reason'] !== null && $result['reason'] !== '', 'a reason is given');
        Assert::true(str_contains((string) $result['reason'], 'JPG'), 'the reason names what is accepted');
    }
}
