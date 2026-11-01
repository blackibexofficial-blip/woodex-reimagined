<?php

declare(strict_types=1);

namespace App\Domain\Website\Content\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A record that has many instances and one template (docs/08 INTEGRATION-MASTER-PLAN §4.1).
 *
 * A service, a blog post, a project, a showroom, a series. `sections` is the body in the same block
 * vocabulary the rest of the CMS uses, so the same editor and the same Puck components draw all of them.
 *
 * `payload` is the type's own fields — a post's author and date, a project's client and square footage,
 * a showroom's phone and coordinates. Keeping them here means adding a field never adds a column.
 *
 * @property int $id
 * @property string $type
 * @property string $slug
 * @property string $path
 * @property string $title
 * @property string|null $excerpt
 * @property array<int, mixed>|null $sections
 * @property array<string, mixed>|null $payload
 * @property array<string, mixed>|null $seo
 * @property string $status
 * @property int|null $featured_media_id
 * @property int $sort
 * @property \Illuminate\Support\Carbon|null $published_at
 */
class ContentItem extends Model
{
    public const array TYPES = ['service', 'post', 'project', 'showroom', 'series'];

    public const string STATUS_DRAFT = 'draft';

    public const string STATUS_PUBLISHED = 'published';

    protected $fillable = [
        'type', 'slug', 'path', 'title', 'excerpt', 'sections', 'payload', 'seo', 'status',
        'featured_media_id', 'sort', 'published_at',
    ];

    protected function casts(): array
    {
        return [
            'sections' => 'array',
            'payload' => 'array',
            'seo' => 'array',
            'sort' => 'integer',
            'published_at' => 'datetime',
            'featured_media_id' => 'integer',
        ];
    }

    /** @param  Builder<ContentItem>  $query */
    public function scopeOfType(Builder $query, string $type): void
    {
        $query->where('type', $type);
    }

    /** @param  Builder<ContentItem>  $query */
    public function scopePublished(Builder $query): void
    {
        $query->where('status', self::STATUS_PUBLISHED);
    }

    /** @param  Builder<ContentItem>  $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('sort')->orderBy('id');
    }

    public function isPublished(): bool
    {
        return $this->status === self::STATUS_PUBLISHED;
    }

    public function metaTitle(): string
    {
        $seo = (array) ($this->seo ?? []);

        return trim((string) ($seo['title'] ?? '')) !== '' ? (string) $seo['title'] : $this->title;
    }

    public function metaDescription(): string
    {
        $seo = (array) ($this->seo ?? []);

        return (string) ($seo['description'] ?? $this->excerpt ?? '');
    }
}
