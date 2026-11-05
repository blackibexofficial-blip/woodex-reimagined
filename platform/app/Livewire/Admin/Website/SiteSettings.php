<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Website;

use App\Livewire\Concerns\InteractsWithAdmin;
use App\Settings\SiteShellSettings;
use Closure;
use Illuminate\Validation\ValidationException;
use Illuminate\Contracts\View\View;
use Livewire\Component;

/**
 * The storefront shell: top bar, footer headings, contact block, newsletter, payment logos, social
 * links, copyright and legal links.
 *
 * These 25 values already exist as rows in `settings` (group `shell`) and the storefront reads them
 * through ShellComposer — but until now only the seeder wrote them, so changing a phone number meant
 * editing SiteShellSeeder and re-seeding, which also overwrote anything else that had changed. This
 * is the screen that owns them.
 *
 * Shape, the same as the menu builder: sections on the left, fields in the middle, and the real
 * storefront on the right. The right pane is an iframe of the live page rather than a mock — a
 * hand-built preview drifts from the footer template the first time either changes, and it would
 * need the storefront's CSS inside the admin to look like anything. It reloads on save, which is the
 * honest version of "live": what you see is the page, not an approximation of it.
 */
final class SiteSettings extends Component
{
    use InteractsWithAdmin;

    /** @var array<string, mixed> */
    public array $form = [];

    public string $section = 'topbar';

    /** Bumped on save: the iframe URL changes, so the frame reloads. */
    public int $previewKey = 0;

    public bool $saved = false;

    public function mount(): void
    {
        $settings = $this->settings();

        $this->form = [
            'topbar_is_active' => (bool) $settings->topbar_is_active,
            'topbar_text' => (string) $settings->topbar_text,
            'topbar_url' => (string) $settings->topbar_url,
            'about_title' => (string) $settings->about_title,
            'about_tagline' => (string) $settings->about_tagline,
            'about_text' => (string) $settings->about_text,
            'shop_title' => (string) $settings->shop_title,
            'quick_links_title' => (string) $settings->quick_links_title,
            'learn_more_title' => (string) $settings->learn_more_title,
            'contact_title' => (string) $settings->contact_title,
            'address_text' => (string) $settings->address_text,
            'email_text' => (string) $settings->email_text,
            'hours_text' => (string) $settings->hours_text,
            'phone_label' => (string) $settings->phone_label,
            'phone_number' => (string) $settings->phone_number,
            'newsletter_title' => (string) $settings->newsletter_title,
            'newsletter_placeholder' => (string) $settings->newsletter_placeholder,
            'newsletter_button_text' => (string) $settings->newsletter_button_text,
            'payment_label' => (string) $settings->payment_label,
            'payment_logos' => $this->normaliseRows($settings->payment_logos, ['src', 'alt']),
            'social_label' => (string) $settings->social_label,
            'social_links' => $this->normaliseRows($settings->social_links, ['icon', 'url', 'label']),
            'copyright_text' => (string) $settings->copyright_text,
            'legal_links' => $this->normaliseRows($settings->legal_links, ['title', 'url']),
        ];
    }

    public function selectSection(string $section): void
    {
        $this->section = array_key_exists($section, $this->schema()) ? $section : 'topbar';
        $this->saved = false;
        $this->resetValidation();
    }

    /** Any edit makes the "Saved" badge a lie, so it goes. */
    public function markDirty(): void
    {
        $this->saved = false;
    }

    public function addRow(string $key): void
    {
        $field = $this->field($key);

        if ($field === null || ($field['type'] ?? '') !== 'rows') {
            return;
        }

        $this->form[$key][] = array_fill_keys(array_column($field['sub'], 'key'), '');
        $this->saved = false;
    }

    public function removeRow(string $key, int $index): void
    {
        if (! isset($this->form[$key][$index])) {
            return;
        }

        unset($this->form[$key][$index]);
        // array_values, not unset alone: a gap in the indexes makes the next wire:model target a key
        // that no longer exists, and the input silently stops binding.
        $this->form[$key] = array_values($this->form[$key]);
        $this->saved = false;
    }

    /** @param -1|1 $direction */
    public function moveRow(string $key, int $index, int $direction): void
    {
        $rows = $this->form[$key] ?? [];
        $target = $index + $direction;

        if (! isset($rows[$index]) || ! isset($rows[$target])) {
            return;
        }

        [$rows[$index], $rows[$target]] = [$rows[$target], $rows[$index]];
        $this->form[$key] = $rows;
        $this->saved = false;
    }

    public function save(): void
    {
        try {
            $this->validate();
        } catch (ValidationException $e) {
            // The invalid field may be in a section that is not open. Jumping to it turns a save that
            // appears to do nothing into a save that shows you the problem — the first version of this
            // screen failed silently on a payment logo three sections away.
            $this->section = $this->sectionOwning(array_keys($e->errors()));

            throw $e;
        }

        $settings = $this->settings();

        foreach ($this->form as $key => $value) {
            if (! property_exists($settings, $key)) {
                continue;
            }

            $settings->{$key} = $value;
        }

        $settings->save();

        $this->saved = true;
        $this->previewKey++;
    }

    /**
     * The section holding the first error, so the form can open it.
     *
     * @param  list<string>  $keys  error keys such as "form.payment_logos.0.src"
     */
    private function sectionOwning(array $keys): string
    {
        foreach ($keys as $key) {
            $field = str_replace('form.', '', $key);
            $field = explode('.', $field)[0];

            foreach ($this->schema() as $section => $definition) {
                foreach ($definition['fields'] as $candidate) {
                    if ($candidate['key'] === $field) {
                        return $section;
                    }
                }
            }
        }

        return $this->section;
    }

    /** @return array<string, mixed> */
    protected function rules(): array
    {
        $rules = [
            'form.topbar_is_active' => ['boolean'],
            'form.topbar_url' => ['nullable', 'string', 'max:255', $this->pathOrUrl()],
            'form.topbar_text' => ['nullable', 'string', 'max:120', 'required_if:form.topbar_is_active,true'],
            'form.about_title' => ['required', 'string', 'max:80'],
            'form.about_tagline' => ['nullable', 'string', 'max:120'],
            'form.about_text' => ['nullable', 'string', 'max:2000'],
            'form.shop_title' => ['nullable', 'string', 'max:60'],
            'form.quick_links_title' => ['nullable', 'string', 'max:60'],
            'form.learn_more_title' => ['nullable', 'string', 'max:60'],
            'form.contact_title' => ['required', 'string', 'max:60'],
            'form.address_text' => ['nullable', 'string', 'max:200'],
            'form.email_text' => ['nullable', 'email', 'max:190'],
            'form.hours_text' => ['nullable', 'string', 'max:120'],
            'form.phone_label' => ['nullable', 'string', 'max:40'],
            'form.phone_number' => ['nullable', 'string', 'max:40'],
            'form.newsletter_title' => ['nullable', 'string', 'max:60'],
            'form.newsletter_placeholder' => ['nullable', 'string', 'max:60'],
            'form.newsletter_button_text' => ['nullable', 'string', 'max:40'],
            'form.payment_label' => ['nullable', 'string', 'max:60'],
            'form.social_label' => ['nullable', 'string', 'max:60'],
            'form.copyright_text' => ['nullable', 'string', 'max:200'],
        ];

        foreach (['payment_logos' => 'src', 'social_links' => 'url', 'legal_links' => 'url'] as $key => $urlField) {
            $rules['form.'.$key] = ['array', 'max:12'];
            // Two different rules, because two different things are stored: links are addresses a
            // visitor follows, image paths are resolved against the site root by the template itself
            // (`/<src>`), and the seeded logos are relative — "assets/images/misc/meezan-bank-logo.png".
            $rules['form.'.$key.'.*.'.$urlField] = [
                'required', 'string', 'max:255',
                $key === 'payment_logos' ? $this->imagePath() : $this->pathOrUrl(),
            ];
        }

        $rules['form.payment_logos.*.alt'] = ['nullable', 'string', 'max:80'];
        $rules['form.social_links.*.icon'] = ['nullable', 'string', 'max:40'];
        $rules['form.social_links.*.label'] = ['nullable', 'string', 'max:60'];
        $rules['form.legal_links.*.title'] = ['required', 'string', 'max:60'];

        return $rules;
    }

    /** @return array<string, string> */
    protected function messages(): array
    {
        return [
            'form.topbar_text.required_if' => 'A visible top bar needs text — otherwise it is an empty strip above the header.',
            'form.email_text.email' => 'That is not an email address, so the footer link would not open a mail window.',
            'form.payment_logos.*.src.required' => 'A logo row needs an image path or URL.',
            'form.social_links.*.url.required' => 'A social row needs a link.',
            'form.social_links.*.url.max' => 'That link is longer than 255 characters.',
            'form.legal_links.*.title.required' => 'A footer legal link needs its text.',
            'form.legal_links.*.url.required' => 'A footer legal link needs a URL.',
        ];
    }

    /**
     * A path (`/sale`) or a full URL (`https://…`), which is what the footer actually renders into an
     * href. A bare `facebook.com` is the case this exists for: it is a *relative* link, so the browser
     * resolves it to /shop/facebook.com and the visitor gets a 404 instead of the page.
     */
    private function pathOrUrl(): Closure
    {
        return static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_string($value) || $value === '') {
                return;
            }

            if (str_starts_with($value, '/')) {
                if (str_starts_with($value, '//')) {
                    $fail('A link cannot start with // — write /path for this site or https://… for another.');

                    return;
                }

                return;
            }

            if (filter_var($value, FILTER_VALIDATE_URL) === false) {
                $fail('Write a path starting with / (for this site) or a full URL starting with https://.');

                return;
            }

            $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));

            if (! in_array($scheme, ['http', 'https', 'mailto', 'tel'], true)) {
                $fail('Only http, https, mailto and tel links are allowed.');
            }
        };
    }

    /**
     * An image path: full URL, root-relative, or relative to the site root — which is what the footer
     * template expects, because it prints `/<src>` and trims a leading slash if there is one.
     */
    private function imagePath(): Closure
    {
        return static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_string($value) || trim($value) === '') {
                return;
            }

            $value = trim($value);

            if (str_starts_with($value, '//')) {
                $fail('Write a path (assets/images/logo.png) or a full URL — not a protocol-relative //path.');

                return;
            }

            if (preg_match('~^[a-z][a-z0-9+.-]*:~i', $value) === 1
                && ! in_array(strtolower((string) parse_url($value, PHP_URL_SCHEME)), ['http', 'https'], true)) {
                $fail('Only http and https images can be shown.');

                return;
            }

            if (str_contains($value, ' ')) {
                $fail('An image path cannot contain spaces — rename the file or URL-encode it as %20.');
            }
        };
    }

    /** @return array<string, array{label: string, hint?: string, fields: list<array<string, mixed>>}> */
    private function schema(): array
    {
        return [
            'topbar' => [
                'label' => 'Top bar',
                'hint' => 'The strip above the header. It is off by default, because an empty sale banner is worse than none.',
                'fields' => [
                    ['key' => 'topbar_is_active', 'type' => 'toggle', 'label' => 'Show the top bar'],
                    ['key' => 'topbar_text', 'type' => 'text', 'label' => 'Text', 'max' => 120, 'placeholder' => 'Free delivery on orders over Rs 50,000'],
                    ['key' => 'topbar_url', 'type' => 'text', 'label' => 'Links to', 'hint' => 'A path like /sale, or a full URL. Leave empty for text that is not a link.'],
                ],
            ],
            'about' => [
                'label' => 'About block',
                'hint' => 'The first footer column: the brand paragraph under the logo.',
                'fields' => [
                    ['key' => 'about_title', 'type' => 'text', 'label' => 'Heading', 'max' => 80],
                    ['key' => 'about_tagline', 'type' => 'text', 'label' => 'Tagline', 'max' => 120],
                    ['key' => 'about_text', 'type' => 'textarea', 'label' => 'Paragraph', 'max' => 2000, 'rows' => 5],
                ],
            ],
            'columns' => [
                'label' => 'Column headings',
                'hint' => 'The three headings above the footer link lists. The links themselves are on the Menus screen.',
                'fields' => [
                    ['key' => 'shop_title', 'type' => 'text', 'label' => 'Shop column', 'max' => 60],
                    ['key' => 'quick_links_title', 'type' => 'text', 'label' => 'Quick links column', 'max' => 60],
                    ['key' => 'learn_more_title', 'type' => 'text', 'label' => 'Learn more column', 'max' => 60],
                ],
            ],
            'contact' => [
                'label' => 'Contact block',
                'hint' => 'Address, email and hours in the footer — and the phone number in the header.',
                'fields' => [
                    ['key' => 'contact_title', 'type' => 'text', 'label' => 'Heading', 'max' => 60],
                    ['key' => 'address_text', 'type' => 'text', 'label' => 'Address', 'max' => 200],
                    ['key' => 'email_text', 'type' => 'text', 'label' => 'Email', 'max' => 190, 'input' => 'email'],
                    ['key' => 'phone_label', 'type' => 'text', 'label' => 'Phone label', 'max' => 40],
                    ['key' => 'phone_number', 'type' => 'text', 'label' => 'Phone number', 'max' => 40],
                    ['key' => 'hours_text', 'type' => 'text', 'label' => 'Opening hours', 'max' => 120],
                ],
            ],
            'newsletter' => [
                'label' => 'Newsletter',
                'hint' => 'The subscribe block in the footer.',
                'fields' => [
                    ['key' => 'newsletter_title', 'type' => 'text', 'label' => 'Heading', 'max' => 60],
                    ['key' => 'newsletter_placeholder', 'type' => 'text', 'label' => 'Placeholder', 'max' => 60],
                    ['key' => 'newsletter_button_text', 'type' => 'text', 'label' => 'Button text', 'max' => 40],
                ],
            ],
            'payment' => [
                'label' => 'Payment logos',
                'hint' => 'Shown beside the copyright line. Empty is fine — the row is skipped.',
                'fields' => [
                    ['key' => 'payment_label', 'type' => 'text', 'label' => 'Label', 'max' => 60],
                    ['key' => 'payment_logos', 'type' => 'rows', 'label' => 'Logos', 'add' => 'Add a logo', 'sub' => [
                        ['key' => 'src', 'label' => 'Image path or URL', 'max' => 255],
                        ['key' => 'alt', 'label' => 'Alt text', 'max' => 80],
                    ]],
                ],
            ],
            'social' => [
                'label' => 'Social links',
                'hint' => 'Icons beside the footer copyright. The icon name is the one the icon component uses.',
                'fields' => [
                    ['key' => 'social_label', 'type' => 'text', 'label' => 'Label', 'max' => 60],
                    ['key' => 'social_links', 'type' => 'rows', 'label' => 'Links', 'add' => 'Add a link', 'sub' => [
                        ['key' => 'icon', 'label' => 'Icon', 'max' => 40, 'hint' => 'facebook, instagram, linkedin'],
                        ['key' => 'url', 'label' => 'URL', 'max' => 255],
                        ['key' => 'label', 'label' => 'Accessible name', 'max' => 60],
                    ]],
                ],
            ],
            'legal' => [
                'label' => 'Copyright and legal',
                'hint' => 'The bottom row of the footer.',
                'fields' => [
                    ['key' => 'copyright_text', 'type' => 'text', 'label' => 'Copyright line', 'max' => 200],
                    ['key' => 'legal_links', 'type' => 'rows', 'label' => 'Legal links', 'add' => 'Add a link', 'sub' => [
                        ['key' => 'title', 'label' => 'Text', 'max' => 60],
                        ['key' => 'url', 'label' => 'URL', 'max' => 255],
                    ]],
                ],
            ],
        ];
    }

    /** @return array<string, mixed>|null */
    private function field(string $key): ?array
    {
        foreach ($this->schema() as $section) {
            foreach ($section['fields'] as $field) {
                if ($field['key'] === $key) {
                    return $field;
                }
            }
        }

        return null;
    }

    /**
     * Rows keep the shape the template reads, even when the stored value is missing a key or is not a
     * list at all — a hand-edited row in the database should render as empty inputs, not as an error
     * page in the admin.
     *
     * @param  list<string>  $keys
     * @return list<array<string, string>>
     */
    private function normaliseRows(mixed $rows, array $keys): array
    {
        if (! is_array($rows)) {
            return [];
        }

        $out = [];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $out[] = array_map(static fn (string $k): string => (string) ($row[$k] ?? ''), array_combine($keys, $keys));
        }

        return $out;
    }

    private function settings(): SiteShellSettings
    {
        return app(SiteShellSettings::class);
    }

    public function render(): View
    {
        $schema = $this->schema();
        $section = $schema[$this->section];

        return view('livewire.admin.website.site-settings', [
            'sections' => array_map(
                static fn (array $s, string $key): array => [
                    'key' => $key,
                    'label' => $s['label'],
                    'count' => count($s['fields']),
                ],
                $schema,
                array_keys($schema),
            ),
            'sectionLabel' => $section['label'],
            'sectionHint' => $section['hint'] ?? '',
            'fields' => $section['fields'],
            'previewUrl' => url('/page-preview/home').'?shell='.$this->previewKey,
            'storefrontUrl' => url('/'),
        ])->layout('layouts::admin');
    }
}
