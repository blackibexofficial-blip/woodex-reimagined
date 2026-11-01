<?php

declare(strict_types=1);

namespace Tests\Site;

use App\Domain\Website\Content\LegacyRedirects;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The 301 map for the archived interior site.
 *
 * 142 addresses were indexed. Fourteen survive as pages; the rest must land somewhere purposeful, because the
 * alternative is not a 404 — the storefront's fallback answers every one of them with **200**, which teaches a
 * crawler that 120 URLs are the same page.
 *
 * These tests exercise the decision (`LegacyRedirects::plan()`) rather than the command, so they need neither a
 * database nor a server. What they cannot prove — that Apache/Laravel then answers 301 — is checked against the
 * running app and written down in the plan doc.
 */
final class LegacyRedirectTest extends TestCase
{
    /** @return list<array{type: string, slug: string}> */
    private function archived(): array
    {
        return [
            ['type' => 'home', 'slug' => '/'],
            ['type' => 'about', 'slug' => '/about/'],
            ['type' => 'contact', 'slug' => '/contact/'],
            ['type' => 'insight', 'slug' => '/insights/1-kanal-house-interior-cost-lahore/'],
            ['type' => 'listing', 'slug' => '/insights/'],
            ['type' => 'listing', 'slug' => '/services/'],
            ['type' => 'city', 'slug' => '/lahore/'],
            ['type' => 'area', 'slug' => '/lahore/dha/'],
            ['type' => 'project', 'slug' => '/projects/cafe-corner/'],
            ['type' => 'service', 'slug' => '/kitchen-renovation/'],
            ['type' => 'service', 'slug' => '/3d-visualization/'],
            ['type' => 'service', 'slug' => '/office-fit-out/'],
            ['type' => 'service', 'slug' => '/wardrobe-design/'],
            ['type' => 'estimator', 'slug' => '/estimator/'],
            ['type' => 'booking', 'slug' => '/book-a-visit/'],
        ];
    }

    /** @return array<string, string> from => to */
    private function mapped(): array
    {
        return array_column(
            LegacyRedirects::plan($this->archived(), ['/', '/about', '/contact', '/services', '/projects', '/blog']),
            'to',
            'from',
        );
    }

    public function testAnAddressThatStillAnswersIsNotRedirected(): void
    {
        $plan = $this->mapped();

        foreach (['/', '/about/', '/contact/', '/services/'] as $path) {
            Assert::true(! isset($plan[$path]), $path.' still has a page, so a redirect from it could never fire');
        }
    }

    public function testEveryArchivedAddressLandsSomewhere(): void
    {
        $plan = $this->mapped();

        // 15 fixtures, 4 of which still answer.
        Assert::same(11, count($plan), 'every other archived URL needs a target');
        Assert::same(count($plan), count(array_unique(array_keys($plan))), 'no address may be redirected twice');

        foreach ($plan as $from => $to) {
            Assert::true($to !== $from, $from.' must not redirect to itself');
            Assert::true(str_starts_with($to, '/'), $from.' needs an absolute path as its target');
        }
    }

    public function testAnInsightGoesToTheBlogAndACityToTheShowrooms(): void
    {
        $plan = $this->mapped();

        Assert::same('/blog/', $plan['/insights/1-kanal-house-interior-cost-lahore/'] ?? null, 'a post belongs on the blog');
        Assert::same('/blog/', $plan['/insights/'] ?? null, 'the old blog index belongs on the new one');
        Assert::same('/showrooms/', $plan['/lahore/'] ?? null, 'a city page belongs with the showrooms');
        Assert::same('/showrooms/', $plan['/lahore/dha/'] ?? null, 'an area page belongs with the showrooms');
        Assert::same('/projects/', $plan['/projects/cafe-corner/'] ?? null, 'an interior case study belongs on the projects index');
        Assert::same('/quotation/', $plan['/estimator/'] ?? null, 'the estimator is the quotation');
        Assert::same('/virtual-showroom/', $plan['/book-a-visit/'] ?? null, 'booking a visit is the virtual showroom');
    }

    public function testTheServicesThatHaveABetterHomeAreSingledOut(): void
    {
        $plan = $this->mapped();

        Assert::same('/services/', $plan['/kitchen-renovation/'] ?? null, 'a kitchen is not an office service');
        Assert::same('/services/space-planning-design/', $plan['/3d-visualization/'] ?? null, '3D work is space planning');
        Assert::same('/services/b2b-office-solutions/', $plan['/office-fit-out/'] ?? null, 'an office fit-out is the B2B service');
        Assert::same('/services/custom-design/', $plan['/wardrobe-design/'] ?? null, 'bespoke joinery is custom design');
    }

    public function testPathsAreNormalisedToTheCanonicalForm(): void
    {
        Assert::same('/about/', LegacyRedirects::path('/about'));
        Assert::same('/about/', LegacyRedirects::path('about/'));
        Assert::same('/a/b/', LegacyRedirects::path('/a/b/'));
        Assert::same('/', LegacyRedirects::path('/'));
        Assert::same('/', LegacyRedirects::path(''));

        // The table's own normaliser is the router's, or a row and a request never meet.
        Assert::same(
            \App\Domain\Website\Models\Redirect::normalize('/services/kitchen-renovation'),
            LegacyRedirects::path('/services/kitchen-renovation'),
        );
    }

    public function testTheHomePageIsNeverRedirected(): void
    {
        Assert::same(null, LegacyRedirects::target('home', ''), 'the storefront is the home page');

        $plan = array_column(LegacyRedirects::plan([['type' => 'home', 'slug' => '/']], []), 'from');

        Assert::same([], $plan, 'a redirect from / would be a loop');
    }

    public function testTheCommandExistsAndIsSafeToReRun(): void
    {
        $path = self::sitePath('app/Console/Commands/ImportLegacyRedirectsCommand.php');

        Assert::true($path !== null, 'the importer must exist');

        $source = (string) file_get_contents((string) $path);

        Assert::true(str_contains($source, 'website:import-redirects'), 'the command needs its name');
        Assert::true(str_contains($source, '--dry-run'), 'a plan must be inspectable before it is written');
        Assert::true(str_contains($source, '->exists()'), 'a row that exists must be left alone');
        Assert::true(! str_contains($source, '->delete('), 'importing must never remove a redirect the owner set');
        Assert::true(! str_contains($source, '->update('), 'importing must not overwrite a target the owner edited');
    }
}
