<div>
    <x-admin.page-header
        :title="$heading"
        :description="$summary"
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), $heading => null]"
    >
        <x-slot:actions>
            <x-admin.badge color="wood">{{ $phase }}</x-admin.badge>
        </x-slot:actions>
    </x-admin.page-header>

    <div class="grid gap-4 lg:grid-cols-2">
        <x-admin.card title="What this screen will do" :description="'Arriving in ' . $phase . '. Listed here so the scope is agreed before the code is written.'">
            <ol class="space-y-3">
                @foreach ($planned as $index => $item)
                    <li class="flex gap-3 text-theme-sm text-gray-700 dark:text-gray-300">
                        <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-sand-100 text-theme-xs font-medium text-wood-700 dark:bg-wood-500/10 dark:text-wood-300">
                            {{ $index + 1 }}
                        </span>
                        <span>{{ $item }}</span>
                    </li>
                @endforeach
            </ol>
        </x-admin.card>

        <x-admin.card title="Already built underneath" description="The data and the arithmetic exist; this screen is the way in.">
            @if ($ready === [])
                <p class="text-theme-sm text-gray-500">Nothing yet — this screen is the first piece.</p>
            @else
                <ul class="space-y-2">
                    @foreach ($ready as $item)
                        <li class="flex items-start gap-2 text-theme-sm text-gray-700 dark:text-gray-300">
                            <x-icon name="check-circle" class="mt-0.5 size-4 shrink-0 text-success-600" />
                            <span>{{ $item }}</span>
                        </li>
                    @endforeach
                </ul>
            @endif

            <div class="mt-5 rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-700">
                <p class="text-theme-xs text-gray-500">
                    This page is routed, permissioned and in the sidebar. Building the shell before the
                    working parts means every later slice drops into a screen that already sits where it
                    belongs — and the navigation never has to be reorganised twice.
                </p>
            </div>
        </x-admin.card>
    </div>
</div>
