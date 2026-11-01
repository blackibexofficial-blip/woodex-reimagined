<?php

declare(strict_types=1);

namespace App\Domain\Website\Content;

/**
 * Where each URL of the archived interior site lands on the storefront.
 *
 * The interior site answered 142 addresses. Fourteen of them still exist — `/about`, `/contact`, `/services`,
 * `/projects` and the pages the storefront kept — and everything else is a URL Google has indexed and a visitor
 * may still have bookmarked: 59 service pages, 48 insights, 12 cities, 8 areas, 6 projects, the estimator and the
 * booking page. With the interior site archived those URLs answer the storefront's shell, which is worse than a
 * 404: a crawler sees **200** on all of them and indexes the same page 120 times.
 *
 * This class is the decision, on its own, with no database in it — `plan()` takes what is archived and what
 * already answers, and returns the rows a redirect table should hold. The command writes them; the tests read
 * them. Keeping the judgement here is the point: "why does `/kitchen-renovation/` go to `/services`?" should be
 * answerable by reading one `match`, not by querying a table.
 *
 * A URL that already answers is never redirected. A redirect from a page that exists is the kind of row that
 * looks fine in the admin and can never fire.
 */
final class LegacyRedirects
{
    /**
     * The new address for one archived page, or null when the page is the storefront's own.
     *
     * Types are the interior site's: `insight` is a blog post, `city` and `area` were location landing pages,
     * `listing` is an index. Anything unrecognised falls back to the services index, because that is the one
     * page that answers "we do interiors" without claiming more than it can prove.
     */
    public static function target(string $type, string $slug): ?string
    {
        return match ($type) {
            'home' => null,
            'insight' => '/blog',
            // `/insights/` is the old listing; `/projects/` and `/services/` keep their address and never reach
            // here, because `plan()` drops anything that still answers.
            'listing' => '/blog',
            'project' => '/projects',
            'city', 'area' => '/showrooms',
            'service' => self::serviceTarget($slug),
            'booking' => '/virtual-showroom',
            'estimator' => '/quotation',
            'about', 'contact', 'legal' => '/about',
            default => '/services',
        };
    }

    /**
     * The redirect rows that should exist, given every archived address and every address that still answers.
     *
     * Both inputs are paths; trailing slashes and a missing leading slash are normalised here, so a caller may
     * pass rows straight from the database or a list typed into a test.
     *
     * @param  iterable<array{type: string, slug: string}>  $archived
     * @param  iterable<string>  $published  addresses a file or route already answers
     * @return list<array{from: string, to: string, type: string, note: string}>
     */
    public static function plan(iterable $archived, iterable $published): array
    {
        $answered = [];

        foreach ($published as $path) {
            $answered[self::path($path)] = true;
        }

        $plan = [];
        $seen = [];

        foreach ($archived as $page) {
            $from = self::path((string) ($page['slug'] ?? ''));

            // The home page is the storefront; a redirect from `/` would loop.
            if ($from === '/' || isset($answered[$from]) || isset($seen[$from])) {
                continue;
            }

            $type = (string) ($page['type'] ?? '');
            $to = self::target($type, trim($from, '/'));

            if ($to === null) {
                continue;
            }

            $seen[$from] = true;
            $plan[] = [
                'from' => $from,
                'to' => self::path($to),
                'type' => $type,
                'note' => 'Archived interior page (' . $type . '); the storefront answers it here.',
            ];
        }

        return $plan;
    }

    /**
     * One canonical form, matching `Page::normalizeSlug()`: a leading and a trailing slash, `/` for the root.
     *
     * The redirect table and the router both compare this form, so a row written as `/about` and a request for
     * `/about/` are the same URL here or they are two URLs that never meet.
     */
    public static function path(string $path): string
    {
        $path = '/'.trim($path, '/');

        return $path === '/' ? '/' : $path.'/';
    }

    /**
     * Which of the storefront's seven services a legacy interior service belongs under.
     *
     * The interior site sold interiors (kitchens, wardrobes, false ceilings); the storefront sells office
     * furniture and fit-out. Only three of the 59 have a genuinely better home than the services index — the 3D
     * work, the office/commercial work and the bespoke build work — so only those are singled out. Sending a
     * kitchen-renovation URL to "Custom Design" would be a promise the page cannot keep.
     */
    private static function serviceTarget(string $slug): string
    {
        return match (true) {
            str_contains($slug, '3d'), str_contains($slug, 'visual') => '/services/space-planning-design',
            str_contains($slug, 'office'),
            str_contains($slug, 'commercial'),
            str_contains($slug, 'corporate'),
            str_contains($slug, 'coworking') => '/services/b2b-office-solutions',
            str_contains($slug, 'furniture'),
            str_contains($slug, 'custom'),
            str_contains($slug, 'wardrobe') => '/services/custom-design',
            default => '/services',
        };
    }
}
