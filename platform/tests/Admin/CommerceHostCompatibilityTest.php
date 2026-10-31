<?php

declare(strict_types=1);

namespace Tests\Admin;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * Rules the Commerce screens must satisfy to run inside the WOODEX OS admin host.
 *
 * Every one of these was a real 500 when the screens were first mounted in the OS, and every one
 * passed the rest of this suite, because the suite reads source text rather than booting
 * Livewire. They are exactly the failures a text test *can* catch — so they belong here.
 *
 * They also encode three facts about the host that a developer writing a new screen cannot see
 * from `platform/` alone:
 *
 *   1. `Model::preventLazyLoading()` is on outside production. A relation read without
 *      `with(...)` throws instead of quietly issuing a query.
 *   2. The host is validated against SQLite in the sandbox and MySQL on Hostinger, so a
 *      MySQL-only function is a test failure waiting to happen.
 *   3. `commerce_orders` and `commerce_invoices` both have `status`. Any query that joins them
 *      must say which one it means.
 */
final class CommerceHostCompatibilityTest extends TestCase
{
    /** @return list<string> absolute paths of the Commerce Livewire components */
    private function components(): array
    {
        $dir = dirname(__DIR__, 2).'/app/Livewire/Admin/Commerce';
        $files = glob($dir.'/*.php') ?: [];
        sort($files);

        return $files;
    }

    /** @return list<string> */
    private function commercePhpFiles(): array
    {
        $root = dirname(__DIR__, 2);
        $files = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root.'/app/Domain/Commerce', \FilesystemIterator::SKIP_DOTS),
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }

        foreach (glob($root.'/app/Livewire/Admin/Commerce/*.php') ?: [] as $file) {
            $files[] = $file;
        }

        sort($files);

        return $files;
    }

    public function testTheComponentsWereFound(): void
    {
        // A glob that silently returns nothing would make every test below vacuous.
        Assert::same(true, count($this->components()) >= 15, 'expected at least fifteen Commerce components');
    }

    public function testEveryComponentThatCallsUserHasTheAdminTrait(): void
    {
        $broken = [];

        foreach ($this->components() as $file) {
            $source = (string) file_get_contents($file);

            if (! str_contains($source, '$this->user()')) {
                continue;
            }

            if (preg_match('/^\s*use\s+[A-Za-z, ]*InteractsWithAdmin/m', $source) !== 1) {
                $broken[] = basename($file);
            }
        }

        Assert::same([], $broken, 'these screens call $this->user() without the trait that provides it');
    }

    public function testNoMySqlOnlySqlFunctions(): void
    {
        $offenders = [];

        foreach ($this->commercePhpFiles() as $file) {
            $source = (string) file_get_contents($file);

            // Only SQL strings matter: a comment explaining WHY the functions are avoided
            // must not fail the build.
            foreach (['LEAST(', 'GREATEST(', 'NOW()'] as $function) {
                foreach (preg_split('/\R/', $source) ?: [] as $line) {
                    if (str_contains($line, $function) && ! str_contains(ltrim($line), '//') && ! str_contains(ltrim($line), '*')) {
                        $offenders[] = basename($file).': '.trim($function, '(');
                    }
                }
            }
        }

        Assert::same([], $offenders, 'SQLite is the sandbox database and MySQL is production; use portable SQL');
    }

    public function testQueriesThatJoinOrdersQualifyStatus(): void
    {
        foreach ($this->commercePhpFiles() as $file) {
            $source = (string) file_get_contents($file);

            if (! str_contains($source, "join('commerce_orders'")) {
                continue;
            }

            // Unqualified `status`, `issued_at` and `due_at` are ambiguous once commerce_orders
            // is in the FROM clause, and both tables carry a `status`.
            foreach (["->where('status'", "->whereNotNull('status'", "->whereDate('issued_at'", "->where('due_at'"] as $bare) {
                Assert::same(
                    false,
                    str_contains($source, $bare),
                    basename($file)." joins commerce_orders but uses an unqualified column: {$bare}",
                );
            }
        }
    }

    /**
     * The invoice screen joins `commerce_orders` and sums the ledger's own balance.
     *
     * It used to do the arithmetic inline — `LEAST(paid, total) - refunded` — which is MySQL
     * only, so the same screen had to be written twice. Now the ledger keeps `balance_minor` and
     * the screen reads it; what is left to keep portable is the void exclusion and today's date.
     */
    public function testTheInvoiceScreenStaysPortableOnceItJoinsOrders(): void
    {
        $source = (string) file_get_contents(
            dirname(__DIR__, 2).'/app/Livewire/Admin/Commerce/InvoicesIndex.php',
        );

        Assert::same(true, str_contains($source, 'CASE WHEN invoices.status <>'), 'void rows are excluded with a CASE');
        Assert::same(true, str_contains($source, 'CURRENT_DATE'), 'overdue compares against a portable date');
        Assert::same(false, str_contains($source, 'NOW()'), 'not MySQL NOW()');
        Assert::same(false, str_contains($source, 'LEAST('), 'and not MySQL LEAST');
        Assert::same(true, str_contains($source, 'balance_minor'), 'the balance is the ledger\'s, not re-derived here');
    }
}
