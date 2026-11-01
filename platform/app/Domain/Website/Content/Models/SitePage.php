<?php

declare(strict_types=1);

namespace App\Domain\Website\Content\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One URL of the reimagined site (docs/08 INTEGRATION-MASTER-PLAN §4.2).
 *
 * `kind` says who owns the body:
 *   route — the SPA has a component for this URL; the row carries its title, meta and editable sections
 *   puck  — a page built in Puck, rendered by the SPA's catch-all route
 *   html  — a hand-written document; the HTML builder writes `canvas_html` and the file is served as-is
 *
 * `seo` is a plain array, not a column per field, because the fields grow: title, description, canonical,
 * og_image, og_type, schema, noindex, priority.
 *
 * @property int $id
 * @property string $key
 * @property string $path
 * @property string $title
 * @property string $kind
 * @property string $status
 * @property array<string, mixed>|null $puck_data
 * @property string|null $canvas_html
 * @property array<string, mixed>|null $seo
 * @property string|null $template
 * @property int $sort
 * @property \Illuminate\Support\Carbon|null $published_at
 * @property int|null $updated_by
 */
class SitePage extends Model
{
    public const string KIND_ROUTE = 'route';

    public const string KIND_PUCK = 'puck';

    public const string KIND_HTML = 'html';

    public const string STATUS_DRAFT = 'draft';

    public const string STATUS_PUBLISHED = 'published';

    protected $fillable = [
        'key', 'path', 'title', 'kind', 'status', 'puck_data', 'canvas_html', 'seo', 'template',
        'sort', 'published_at', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'puck_data' => 'array',
            'seo' => 'array',
            'sort' => 'integer',
            'published_at' => 'datetime',
            'updated_by' => 'integer',
        ];
    }

    /** @param  Builder<SitePage>  $query */
    public function scopePublished(Builder $query): void
    {
        $query->where('status', self::STATUS_PUBLISHED);
    }

    /** @param  Builder<SitePage>  $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('sort')->orderBy('id');
    }

    public function isPublished(): bool
    {
        return $this->status === self::STATUS_PUBLISHED;
    }

    /** The title a visitor sees in the tab: the SEO title when it is set, the page title otherwise. */
    public function metaTitle(): string
    {
        $seo = (array) ($this->seo ?? []);

        return trim((string) ($seo['title'] ?? '')) !== '' ? (string) $seo['title'] : $this->title;
    }

    public function metaDescription(): string
    {
        $seo = (array) ($this->seo ?? []);

        return (string) ($seo['description'] ?? '');
    }

    /** The canonical address: root is `/`, everything else is `/path` with no trailing slash. */
    public function url(): string
    {
        return $this->path === '/' ? '/' : rtrim($this->path, '/');
    }
}
