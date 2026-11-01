<?php

declare(strict_types=1);

namespace Tests\Site;

use App\Domain\Website\Content\BodyText;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The Content screen's one piece of real logic: turning a record's body into a textarea and back.
 *
 * The screen edits prose in a plain field, which is only safe if saving it is *not* the same as replacing the
 * body. A post's body is more than paragraphs — it opens with a hero, a service lists process steps, an article
 * ends in a FAQ — and none of those survive a round-trip through a textarea. `BodyText::merge()` writes the
 * edited paragraphs back over the paragraphs they came from and leaves every other block alone; these tests hold
 * that to the seeded content, because the day it stops being true an owner loses copy by pressing Save.
 */
final class ContentEditingTest extends TestCase
{
    /** @return array<int, array<string, mixed>> */
    private function seededSections(): array
    {
        $path = self::sitePath('database/seeders/data/site-content.json');

        Assert::true($path !== null, 'the seed file must exist');

        $data = (array) json_decode((string) file_get_contents((string) $path), true);

        foreach ((array) ($data['content'] ?? []) as $item) {
            if (($item['type'] ?? '') === 'service') {
                return (array) $item['sections'];
            }
        }

        return [];
    }

    public function testEditingNothingKeepsEveryBlock(): void
    {
        $sections = $this->seededSections();

        Assert::true($sections !== [], 'the seed must carry a service to test with');

        // Open the record, change nothing, press Save.
        $saved = BodyText::merge(BodyText::from($sections), $sections);

        Assert::same($this->canonical($sections), $this->canonical($saved), 'an untouched save must not change the body');
        Assert::same(count($sections), count($saved), 'no block may be created or dropped');
    }

    public function testTheStructuredBlocksSurviveAnEdit(): void
    {
        $sections = $this->seededSections();

        $types = array_column($sections, 'type');

        Assert::true(in_array('hero', $types, true), 'the fixture must have a hero to protect');
        Assert::true(in_array('process', $types, true), 'the fixture must have process steps to protect');

        // Rewrite the first paragraph the way an author would — edit one block, leave the rest of the field alone.
        $blocks = preg_split('/\n\s*\n/', BodyText::from($sections)) ?: [];

        foreach ($blocks as $index => $block) {
            if (! str_starts_with(trim($block), 'heading:')) {
                $blocks[$index] = trim($block).' (edited)';

                break;
            }
        }

        $saved = BodyText::merge(implode("\n\n", $blocks), $sections);

        Assert::same($types, array_column($saved, 'type'), 'the block order and kinds must be unchanged');

        $hero = array_values(array_filter($saved, fn (array $s): bool => $s['type'] === 'hero'))[0];
        Assert::true(trim((string) $hero['heading']) !== '', 'the hero must still have its heading');

        $texts = array_values(array_filter($saved, fn (array $s): bool => $s['type'] === 'text'));
        Assert::true(str_ends_with((string) $texts[0]['text'], ' (edited)'), 'the edited paragraph must be the one saved');
    }

    public function testADeletedParagraphIsDeletedAndTheOthersStay(): void
    {
        $sections = [
            ['type' => 'text', 'heading' => 'One', 'text' => 'First.'],
            ['type' => 'faq', 'items' => [['q' => 'Why?', 'a' => 'Because.']]],
            ['type' => 'text', 'heading' => 'Two', 'text' => 'Second.'],
        ];

        $saved = BodyText::merge("heading: One\n\nFirst.", $sections);

        Assert::same(['text', 'faq'], array_column($saved, 'type'), 'the second paragraph goes, the FAQ stays');
        Assert::same('First.', $saved[0]['text'], 'the surviving paragraph is the one still in the field');
    }

    public function testAParagraphWithNoHeadingRoundTrips(): void
    {
        $sections = [['type' => 'text', 'text' => "A line.\nAnd a second line in the same block."]];

        Assert::same("A line.\nAnd a second line in the same block.", BodyText::from($sections));
        Assert::same(
            [['type' => 'text', 'text' => "A line.\nAnd a second line in the same block."]],
            BodyText::merge(BodyText::from($sections), $sections),
            'a paragraph without a heading is still one paragraph',
        );
    }

    public function testABodyThatIsOnlyWhitespaceRemovesTheParagraphsButKeepsTheRest(): void
    {
        $sections = [
            ['type' => 'hero', 'heading' => 'Title', 'sub' => 'Standfirst.'],
            ['type' => 'text', 'text' => 'Only paragraph.'],
        ];

        Assert::same('', BodyText::from([$sections[0]]), 'a hero is not prose and must not appear in the field');
        Assert::same([$sections[0]], BodyText::merge("  \n\n ", $sections), 'an emptied field deletes only the prose');
    }

    public function testTheScreenUsesTheSharedGrammar(): void
    {
        $path = self::sitePath('app/Livewire/Admin/Website/ContentIndex.php');

        Assert::true($path !== null, 'the content screen must exist');

        $source = (string) file_get_contents((string) $path);

        // One implementation: a second parser inside the component is how the field and the save drift apart.
        Assert::true(str_contains($source, 'BodyText::from('), 'edit() must render the body with BodyText');
        Assert::true(str_contains($source, 'BodyText::merge('), 'save() must merge with BodyText');
        Assert::true(! str_contains($source, 'preg_split'), 'the component must not parse the body itself');
    }

    public function testTheScreenIsReachableAndGuarded(): void
    {
        $routes = self::sitePath('routes/admin.php');
        $nav = self::sitePath('app/Support/AdminNavigation.php');

        Assert::true($routes !== null && $nav !== null, 'routes and navigation must both exist');

        $routeSource = (string) file_get_contents((string) $routes);

        Assert::true(
            str_contains($routeSource, "Route::livewire('/website/content', ContentIndex::class)->name('website.content')->middleware('can:website.edit')"),
            'the screen needs a route, a name and the website.edit gate',
        );
        Assert::true(str_contains($routeSource, 'use App\\Livewire\\Admin\\Website\\ContentIndex;'), 'the import must exist');
        Assert::true(str_contains((string) file_get_contents((string) $nav), "'admin.website.content'"), 'the sidebar must link to it');
    }

    public function testAnAddressCannotCollideWithAnotherRecord(): void
    {
        $path = self::sitePath('app/Livewire/Admin/Website/ContentIndex.php');

        Assert::true($path !== null, 'the content screen must exist');

        $source = (string) file_get_contents((string) $path);

        // Two records on one URL means one of them is unreachable and the sitemap lists it twice.
        Assert::true(str_contains($source, "Rule::unique('content_items', 'path')"), 'the address must be unique');
        Assert::true(str_contains($source, '->ignore($item->id)'), 'a record must be allowed to keep its own address');
        Assert::true(str_contains($source, "starts_with:/"), 'an address must start with a slash');
    }

    /**
     * @param  array<int, array<string, mixed>>  $sections
     * @return array<int, array<string, mixed>>
     */
    private function canonical(array $sections): array
    {
        return array_map(function (array $section): array {
            ksort($section);

            return $section;
        }, $sections);
    }
}
