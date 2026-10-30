<?php

declare(strict_types=1);

namespace Tests\Media;

use App\Domain\Commerce\Media\ImageStore;
use App\Domain\Commerce\Media\MediaPath;
use App\Domain\Commerce\Media\Transformer;
use RuntimeException;
use Tests\Support\Assert;

/**
 * The store's job is to plan and to fail cleanly. A fake transformer stands in for GD so the
 * planning — what gets written, what gets rolled back, what is refused — is tested without an
 * imaging extension, and so a failure can be injected at exactly the third size.
 */
final class ImageStoreTest extends \Tests\TestCase
{
    private string $root;

    public function setUp(): void
    {
        $this->root = sys_get_temp_dir().'/commerce-media-test-'.bin2hex(random_bytes(4));

        if (! is_dir($this->root)) {
            mkdir($this->root, 0755, true);
        }
    }

    public function tearDown(): void
    {
        foreach (glob($this->root.'/*/*') ?: [] as $file) {
            @unlink($file);
        }

        foreach (glob($this->root.'/*') ?: [] as $dir) {
            if (is_dir($dir)) {
                @rmdir($dir);
            }
        }

        @rmdir($this->root);
    }

    public function testItWritesThreeSizes(): void
    {
        $store = new ImageStore($this->root, new MediaPath, new FakeTransformer);
        $result = $store->store('WX-1', 'chair.jpg', 'image/jpeg', 'fake-jpeg-bytes');

        Assert::same(true, $result['ok'], 'stored');
        Assert::same(3, count($result['files']), 'three files written');
        Assert::true($result['hash'] !== null && strlen((string) $result['hash']) === 32, 'a hash is returned');

        foreach ($result['files'] as $file) {
            Assert::true(is_file($file), "wrote {$file}");
            Assert::true(str_ends_with($file, '.webp'), 'every size is webp');
        }
    }

    public function testTheSameBytesAreNotReEncoded(): void
    {
        $transformer = new FakeTransformer;
        $store = new ImageStore($this->root, new MediaPath, $transformer);

        $first = $store->store('WX-1', 'chair.jpg', 'image/jpeg', 'identical-bytes');
        $second = $store->store('WX-1', 'chair-copy.jpg', 'image/jpeg', 'identical-bytes');

        Assert::same($first['hash'], $second['hash'], 'same content, same hash');
        Assert::same(3, $transformer->calls, 'encoded once, not twice');
    }

    public function testARefusedUploadWritesNothing(): void
    {
        $transformer = new FakeTransformer;
        $store = new ImageStore($this->root, new MediaPath, $transformer);

        $result = $store->store('WX-1', 'shell.php', 'application/x-php', '<?php evil();');

        Assert::same(false, $result['ok'], 'refused');
        Assert::same(0, $transformer->calls, 'nothing was encoded');
        Assert::same([], $result['files'], 'no files listed');
        Assert::true(! is_dir($this->root.'/commerce/products/wx-1'), 'no directory created for a refused upload');
    }

    public function testAFailureHalfwayRollsBackEverySizeItWrote(): void
    {
        $transformer = new FakeTransformer(failOnCall: 3);
        $store = new ImageStore($this->root, new MediaPath, $transformer);

        $threw = false;

        try {
            $store->store('WX-2', 'chair.jpg', 'image/jpeg', 'bytes-for-rollback');
        } catch (RuntimeException) {
            $threw = true;
        }

        Assert::same(true, $threw, 'the failure is surfaced, not swallowed');

        $leftovers = glob($this->root.'/commerce/products/wx-2/*') ?: [];
        Assert::same([], $leftovers, 'no partial image set was left behind');
    }

    public function testDeletingRemovesEverySizeAndIsSafeToRepeat(): void
    {
        $store = new ImageStore($this->root, new MediaPath, new FakeTransformer);
        $result = $store->store('WX-3', 'chair.jpg', 'image/jpeg', 'delete-me');

        Assert::same(3, $store->delete('WX-3', (string) $result['hash']), 'three files removed');
        Assert::same(0, $store->delete('WX-3', (string) $result['hash']), 'a second delete removes nothing and does not throw');
    }

    public function testItNeverWritesAboveTheRoot(): void
    {
        $store = new ImageStore($this->root, new MediaPath, new FakeTransformer);

        // A hostile SKU is slugged, so this lands inside the root rather than beside it.
        $result = $store->store('../../escape', 'chair.jpg', 'image/jpeg', 'contained');

        Assert::same(true, $result['ok'], 'stored');

        foreach ($result['files'] as $file) {
            Assert::true(str_starts_with($file, $this->root), "{$file} is inside the media root");
        }
    }
}

/**
 * Records calls and can be told to fail on the nth one.
 */
final class FakeTransformer implements Transformer
{
    public int $calls = 0;

    public function __construct(private readonly int $failOnCall = 0) {}

    public function toWebp(string $contents, int $maxWidth, int $quality, string $destination): void
    {
        $this->calls++;

        if ($this->failOnCall > 0 && $this->calls === $this->failOnCall) {
            throw new RuntimeException('Injected encoder failure.');
        }

        file_put_contents($destination, 'webp:'.$maxWidth);
    }
}
