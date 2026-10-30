<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce\Concerns;

use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Livewire\Component;

/**
 * A commerce screen that is routed, permissioned and navigable, but whose working parts land
 * in a later slice.
 *
 * These exist now rather than later for one reason: the sidebar, the permissions and the
 * route table are what break when they are added last. Building the shell first means each
 * later slice fills a screen that already sits where it belongs — and nobody is tempted to
 * invent a fifteenth navigation scheme to avoid touching the other fourteen.
 *
 * The page is honest about status: it names the slice that completes it and lists what
 * already exists underneath, so nobody mistakes a placeholder for an empty database.
 */
abstract class CommerceScreen extends Component
{
    use InteractsWithAdmin;

    abstract protected function heading(): string;

    abstract protected function summary(): string;

    /** @return list<string> the capabilities this screen will carry, in order */
    abstract protected function planned(): array;

    /** @return list<string> what is already built and working beneath it */
    protected function ready(): array
    {
        return [];
    }

    /** @return list<string> permissions a user needs to open this screen */
    abstract protected function needs(): array;

    /** The phase label shown in the header, e.g. "P2 — Sell". */
    protected function phase(): string
    {
        return 'P2';
    }

    public function mount(): void
    {
        foreach ($this->needs() as $permission) {
            abort_unless($this->user()->can($permission), 403);
        }
    }

    public function render(): View
    {
        return view('livewire.admin.commerce.coming-soon', [
            'heading' => $this->heading(),
            'summary' => $this->summary(),
            'planned' => $this->planned(),
            'ready' => $this->ready(),
            'phase' => $this->phase(),
        ]);
    }
}
