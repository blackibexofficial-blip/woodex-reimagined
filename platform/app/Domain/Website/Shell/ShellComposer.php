<?php

declare(strict_types=1);

namespace App\Domain\Website\Shell;

use App\Domain\Website\Models\NavigationItem;
use App\Settings\SiteShellSettings;
use Illuminate\Support\Facades\View;
use Throwable;

/**
 * Builds the shared storefront shell: top bar, header menu (three levels) and footer.
 *
 * Every page the builder publishes renders inside this shell, so the chrome is defined once instead
 * of being pasted into each page's blocks. The values come from `settings` (group `shell`) and the
 * menu rows from `navigation_items` — both seeded from the IBPanel dump — which is what lets the
 * owner change the phone number or a footer link without touching a template.
 *
 * Failure policy: chrome is decoration. If settings or the menu table are unavailable (a fresh
 * install mid-migration, say), the page still renders with an empty shell rather than a 500.
 */
final class ShellComposer
{
    /** Footer columns, in display order: section key => settings key holding its heading. */
    private const array FOOTER_COLUMNS = [
        'shop' => 'shop_title',
        'quick_links' => 'quick_links_title',
        'learn_more' => 'learn_more_title',
    ];

    public function compose(object $view): void
    {
        $view->with('shell', $this->shell());
    }

    /** @return array{topbar: array, header: list<array>, footer: array} */
    public function shell(): array
    {
        $settings = $this->settings();

        return [
            'topbar' => [
                'is_active' => (bool) ($settings?->topbar_is_active ?? false),
                'text' => (string) ($settings?->topbar_text ?? ''),
                'url' => (string) ($settings?->topbar_url ?? '/shop'),
            ],
            'header' => $this->menu(NavigationItem::HEADER),
            'footer' => [
                'about_title' => (string) ($settings?->about_title ?? 'About Us'),
                'about_tagline' => (string) ($settings?->about_tagline ?? ''),
                'about_text' => (string) ($settings?->about_text ?? ''),
                'contact_title' => (string) ($settings?->contact_title ?? 'Contact'),
                'address' => (string) ($settings?->address_text ?? ''),
                'email' => (string) ($settings?->email_text ?? ''),
                'phone_label' => (string) ($settings?->phone_label ?? 'Phone'),
                'phone' => (string) ($settings?->phone_number ?? ''),
                'hours' => (string) ($settings?->hours_text ?? ''),
                'newsletter_title' => (string) ($settings?->newsletter_title ?? 'Newsletter'),
                'newsletter_placeholder' => (string) ($settings?->newsletter_placeholder ?? 'Your email'),
                'newsletter_button' => (string) ($settings?->newsletter_button_text ?? 'Subscribe'),
                'payment_label' => (string) ($settings?->payment_label ?? 'Payment Method'),
                'payment_logos' => $settings?->payment_logos ?? [],
                'social_label' => (string) ($settings?->social_label ?? ''),
                'social_links' => $settings?->social_links ?? [],
                'copyright' => (string) ($settings?->copyright_text ?? ''),
                'legal_links' => $settings?->legal_links ?? [],
                'columns' => $this->footerColumns($settings),
            ],
        ];
    }

    private function settings(): ?SiteShellSettings
    {
        try {
            return app(SiteShellSettings::class);
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }

    /**
     * @return list<array{title: string, items: list<array{label: string, url: string, target: string}>}>
     */
    private function footerColumns(?SiteShellSettings $settings): array
    {
        $rows = $this->rows();

        $columns = [];

        foreach (self::FOOTER_COLUMNS as $section => $headingKey) {
            $items = [];

            foreach ($rows['footer:'.$section] ?? [] as $row) {
                $items[] = [
                    'label' => (string) $row->label,
                    'url' => (string) $row->url,
                    'target' => (string) $row->target,
                ];
            }

            if ($items === []) {
                continue;
            }

            $columns[] = [
                'title' => (string) ($settings?->{$headingKey} ?? ucfirst(str_replace('_', ' ', $section))),
                'items' => $items,
            ];
        }

        return $columns;
    }

    /** @return list<array{label: string, url: string, target: string, is_mega: bool, children: list<array>}> */
    private function menu(string $name): array
    {
        $rows = $this->rows()[$name] ?? [];

        if ($rows === []) {
            return [];
        }

        $byParent = [];

        foreach ($rows as $row) {
            $byParent[$row->parent_id ?? 0][] = $row;
        }

        return $this->nest($byParent, 0, 3);
    }

    /**
     * @param  array<int, list<NavigationItem>>  $byParent
     * @return list<array{label: string, url: string, target: string, is_mega: bool, children: list<array>}>
     */
    private function nest(array $byParent, int $parentId, int $depth): array
    {
        $nodes = [];

        foreach ($byParent[$parentId] ?? [] as $row) {
            $nodes[] = [
                'label' => (string) $row->label,
                'url' => (string) $row->url,
                'target' => (string) $row->target,
                'is_mega' => (bool) $row->is_mega,
                // The header is three levels at most: Shop → column → link. Deeper rows are dropped
                // rather than rendered off the side of the panel.
                'children' => $depth > 1 ? $this->nest($byParent, (int) $row->id, $depth - 1) : [],
            ];
        }

        return $nodes;
    }

    /**
     * Every menu row, grouped by menu name, fetched once per request.
     *
     * @return array<string, list<NavigationItem>>
     */
    private function rows(): array
    {
        if ($this->rows !== null) {
            return $this->rows;
        }

        try {
            /** @var list<NavigationItem> $all */
            $all = NavigationItem::query()->orderBy('position')->orderBy('id')->get()->all();
        } catch (Throwable $e) {
            report($e);

            return $this->rows = [];
        }

        $grouped = [];

        foreach ($all as $row) {
            $grouped[(string) $row->menu][] = $row;
        }

        return $this->rows = $grouped;
    }

    /** @var array<string, list<NavigationItem>>|null */
    private ?array $rows = null;
}
