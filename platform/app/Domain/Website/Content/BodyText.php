<?php

declare(strict_types=1);

namespace App\Domain\Website\Content;

/**
 * The prose half of a record's body, as text an author can edit in a textarea.
 *
 * A record's `sections` is more than prose: a post opens with a `hero` (heading + standfirst), a service lists
 * `process` steps, an article ends in an `faq`. The Content screen edits the paragraphs, and only the
 * paragraphs — `merge()` writes the edited text back *over the text blocks it came from* and leaves every other
 * block exactly where it was. Saving a post therefore cannot quietly delete its hero or its steps, which is what
 * a naive "sections = parse(textarea)" round-trip would do the first time an owner pressed Save.
 *
 * The grammar is two things, deliberately: a blank line starts a block, and a block that begins with
 * `heading:` names the paragraph that follows it. That is enough to write an article and small enough to
 * explain in one line under the field — the page builder is where structure belongs.
 */
final class BodyText
{
    /**
     * The editable prose of a record, rendered for the textarea.
     *
     * Only `text` blocks appear: a hero's standfirst, a process step and a FAQ answer have fields of their own
     * and would be mangled as paragraphs.
     *
     * @param  array<int, mixed>|null  $sections
     */
    public static function from(?array $sections): string
    {
        $blocks = [];

        foreach ((array) $sections as $section) {
            if (! is_array($section) || ($section['type'] ?? '') !== 'text') {
                continue;
            }

            $heading = trim((string) ($section['heading'] ?? ''));
            $text = trim((string) ($section['text'] ?? $section['body'] ?? ''));

            if ($heading !== '') {
                $blocks[] = 'heading: '.$heading;
            }

            if ($text !== '') {
                $blocks[] = $text;
            }
        }

        return implode("\n\n", $blocks);
    }

    /**
     * Write edited prose back into a record's sections, replacing the text blocks and nothing else.
     *
     * Blocks are replaced in order, so an author can rewrite paragraph two without disturbing one; a text block
     * with no replacement left in the field is removed, which is how a paragraph is deleted. Blocks the screen
     * does not show — hero, process, faq — keep their place in the list, and any paragraph the author adds is
     * appended after them.
     *
     * @param  array<int, mixed>|null  $sections
     * @return list<array<string, mixed>>
     */
    public static function merge(string $text, ?array $sections): array
    {
        $parsed = self::parse($text);
        $next = 0;
        $merged = [];

        foreach ((array) $sections as $section) {
            if (! is_array($section)) {
                continue;
            }

            if (($section['type'] ?? '') !== 'text') {
                $merged[] = $section;

                continue;
            }

            if (isset($parsed[$next])) {
                $merged[] = self::compose($parsed[$next]);
                $next++;
            }
        }

        for ($count = count($parsed); $next < $count; $next++) {
            $merged[] = self::compose($parsed[$next]);
        }

        return $merged;
    }

    /**
     * Split the field into blocks: `[['heading' => ?string, 'text' => string], …]`.
     *
     * @return list<array{heading: ?string, text: string}>
     */
    public static function parse(string $text): array
    {
        $blocks = preg_split('/\n\s*\n/', trim($text)) ?: [];
        $parsed = [];
        $heading = null;

        foreach ($blocks as $block) {
            $block = trim($block);

            if ($block === '') {
                continue;
            }

            if (str_starts_with($block, 'heading:')) {
                // Two headings in a row: the first names a paragraph that never came. It is kept rather than
                // dropped, because losing a line the author typed is the one thing an editor must never do.
                if ($heading !== null) {
                    $parsed[] = ['heading' => $heading, 'text' => ''];
                }

                $heading = trim(substr($block, strlen('heading:')));

                continue;
            }

            $parsed[] = ['heading' => $heading, 'text' => $block];
            $heading = null;
        }

        if ($heading !== null) {
            $parsed[] = ['heading' => $heading, 'text' => ''];
        }

        return $parsed;
    }

    /**
     * @param  array{heading: ?string, text: string}  $block
     * @return array<string, string>
     */
    private static function compose(array $block): array
    {
        $section = ['type' => 'text'];

        if (($block['heading'] ?? '') !== '') {
            $section['heading'] = (string) $block['heading'];
        }

        if ($block['text'] !== '') {
            $section['text'] = $block['text'];
        }

        return $section;
    }
}
