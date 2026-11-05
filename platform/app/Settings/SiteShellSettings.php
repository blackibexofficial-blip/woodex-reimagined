<?php

declare(strict_types=1);

namespace App\Settings;

use Spatie\LaravelSettings\Settings;

/**
 * The storefront shell: top bar, footer columns and the footer's contact/newsletter/social blocks.
 *
 * Every value here was hard-coded in the legacy theme (footer_settings, footer_links and
 * topbar_settings in IBPanel). Moving them into settings is what makes the shell editable without a
 * deploy: the owner changes a phone number in System → Settings and the footer follows.
 *
 * The menu itself is not here — it is rows in `navigation_items`, because menus are lists and lists
 * grow. Only the *headings* above those lists live in settings.
 *
 * Note: never use @var on properties — spatie/laravel-settings parses @var to infer casts and
 * rejects generic types such as list<array{...}>. use @phpstan-var for those (spatie ignores it).
 */
class SiteShellSettings extends Settings
{
    /** The strip above the header. Off by default: an empty sale banner is worse than none. */
    public bool $topbar_is_active = false;

    public string $topbar_text = '';

    public string $topbar_url = '/shop';

    public string $about_title = 'About Us';

    public string $about_tagline = '';

    /** Paragraph markup, rendered raw — the owner writes it in a rich-text field. */
    public string $about_text = '';

    public string $shop_title = 'Shop';

    public string $quick_links_title = 'Quick Links';

    public string $learn_more_title = 'Learn More';

    public string $contact_title = 'Contact';

    public string $address_text = '';

    public string $email_text = '';

    public string $hours_text = '';

    public string $phone_label = 'Phone';

    public string $phone_number = '';

    public string $newsletter_title = 'Newsletter';

    public string $newsletter_placeholder = 'Your email';

    public string $newsletter_button_text = 'Subscribe';

    public string $payment_label = 'Payment Method';

    /** @phpstan-var list<array{src: string, alt: string}> */
    public array $payment_logos = [];

    public string $social_label = 'Follow Us:';

    /** @phpstan-var list<array{icon: string, url: string, label: string}> */
    public array $social_links = [];

    public string $copyright_text = '';

    /** @phpstan-var list<array{title: string, url: string}> */
    public array $legal_links = [];

    public static function group(): string
    {
        return 'shell';
    }
}
