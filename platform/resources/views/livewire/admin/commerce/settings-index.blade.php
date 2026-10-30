<div>
    <x-admin.page-header
        title="Settings"
        description="The settings that decide what a number looks like and what money is charged. Almost everything here is read-only, because changing it rewrites the meaning of documents customers already hold."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Settings' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat label="Currency" :value="$currency['code']" icon="wallet" :hint="'integer '.$currency['code'].' minor units, never float'" />
        <x-admin.stat label="Tax rate" :value="number_format($taxBp / 100, 2).'%'" icon="percent" hint="on goods at checkout" />
        <x-admin.stat
            label="Delivery"
            :value="number_format(intdiv($delivery->baseRate->minor, 100))"
            icon="globe"
            :hint="'free over '.number_format(intdiv($delivery->freeOver?->minor ?? 0, 100))"
        />
        <x-admin.stat
            label="Sequences"
            :value="$summary['series']"
            icon="database"
            :hint="$summary['issued'].' numbers issued'"
            :tone="$summary['colliding'] > 0 ? 'error' : 'success'"
        />
    </div>

    @if ($warnings !== [])
        <div class="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-5 py-4 dark:border-warning-500/30 dark:bg-warning-500/10">
            <div class="flex gap-3">
                <x-icon name="alert" class="mt-0.5 size-5 shrink-0 text-warning-600" />
                <div class="space-y-1">
                    @foreach ($warnings as $warning)
                        <p class="text-theme-sm text-warning-700 dark:text-warning-300">{{ $warning }}</p>
                    @endforeach
                </div>
            </div>
        </div>
    @endif

    <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <x-admin.card :padding="false">
            <div class="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-800 dark:text-white/90">Number sequences</h2>
                <p class="mt-0.5 text-theme-xs text-gray-500">
                    Checked against the highest number actually issued, so a restored backup cannot
                    hand out a duplicate.
                </p>
            </div>

            <table class="w-full text-left text-theme-sm">
                <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                    <tr>
                        <th class="px-5 py-2.5 font-medium">Series</th>
                        <th class="px-3 py-2.5 font-medium">Next number</th>
                        <th class="px-3 py-2.5 text-right font-medium">Highest issued</th>
                        <th class="px-5 py-2.5 font-medium">State</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    @foreach ($sequences as $sequence)
                        <tr>
                            <td class="px-5 py-3">
                                <div class="text-gray-800 dark:text-white/90">{{ ucfirst($sequence['key']) }}</div>
                                <div class="font-mono text-theme-xs text-gray-400">{{ $sequence['prefix'] }}</div>
                            </td>
                            <td class="px-3 py-3 font-mono text-theme-xs text-gray-700 dark:text-gray-200">
                                {{ \App\Domain\Commerce\Billing\SequenceHealth::format($sequence['prefix'], $sequence['next']) }}
                            </td>
                            <td class="px-3 py-3 text-right tabular-nums text-gray-500">
                                {{ $sequence['highest'] === 0 ? '—' : $sequence['highest'] }}
                            </td>
                            <td class="px-5 py-3">
                                @switch($sequence['state'])
                                    @case('colliding')
                                        <x-admin.badge tone="error">Would collide</x-admin.badge>
                                        @break
                                    @case('ahead')
                                        <x-admin.badge tone="warning">{{ $sequence['gap'] }} ahead</x-admin.badge>
                                        @break
                                    @case('empty')
                                        <x-admin.badge tone="neutral">Not used yet</x-admin.badge>
                                        @break
                                    @default
                                        <x-admin.badge tone="success">Healthy</x-admin.badge>
                                @endswitch
                            </td>
                        </tr>
                    @endforeach

                    @if ($sequences === [])
                        <tr>
                            <td colspan="4" class="px-5 py-8 text-center text-theme-sm text-gray-500">
                                No sequences are seeded. Checkout cannot allocate an order number until one exists.
                            </td>
                        </tr>
                    @endif
                </tbody>
            </table>
        </x-admin.card>

        <div class="space-y-4">
            <x-admin.card :padding="false">
                <div class="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                    <h2 class="text-theme-sm font-semibold text-gray-800 dark:text-white/90">Money</h2>
                    <p class="mt-0.5 text-theme-xs text-gray-500">The rules the calculator applies, as they stand today.</p>
                </div>
                <dl class="divide-y divide-gray-100 text-theme-sm dark:divide-gray-800">
                    <div class="flex items-center justify-between px-5 py-2.5">
                        <dt class="text-gray-500">Currency</dt>
                        <dd class="text-gray-800 dark:text-white/90">{{ $currency['code'] }} · {{ $currency['symbol'] }}</dd>
                    </div>
                    <div class="flex items-center justify-between px-5 py-2.5">
                        <dt class="text-gray-500">Tax on goods</dt>
                        <dd class="tabular-nums text-gray-800 dark:text-white/90">{{ number_format($taxBp / 100, 2) }}%</dd>
                    </div>
                    <div class="flex items-center justify-between px-5 py-2.5">
                        <dt class="text-gray-500">Delivery</dt>
                        <dd class="tabular-nums text-gray-800 dark:text-white/90">{{ $this->money($delivery->baseRate->minor) }}</dd>
                    </div>
                    <div class="flex items-center justify-between px-5 py-2.5">
                        <dt class="text-gray-500">Free delivery over</dt>
                        <dd class="tabular-nums text-gray-800 dark:text-white/90">{{ $this->money($delivery->freeOver?->minor ?? 0) }}</dd>
                    </div>
                    <div class="flex items-center justify-between px-5 py-2.5">
                        <dt class="text-gray-500">Delivery estimate</dt>
                        <dd class="text-gray-800 dark:text-white/90">{{ $delivery->etaDays }} days</dd>
                    </div>
                </dl>
            </x-admin.card>

            <x-admin.card :padding="false">
                <div class="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                    <h2 class="text-theme-sm font-semibold text-gray-800 dark:text-white/90">Stock sources</h2>
                    <p class="mt-0.5 text-theme-xs text-gray-500">Allocation walks these in priority order.</p>
                </div>
                <ul class="divide-y divide-gray-100 text-theme-sm dark:divide-gray-800">
                    @forelse ($sources as $source)
                        <li class="flex items-center justify-between px-5 py-2.5">
                            <span class="text-gray-700 dark:text-gray-200">
                                {{ $source->name }}
                                <span class="ml-1 font-mono text-theme-xs text-gray-400">{{ $source->code }}</span>
                            </span>
                            <span class="text-theme-xs text-gray-500">{{ $source->city ?? '—' }}</span>
                        </li>
                    @empty
                        <li class="px-5 py-6 text-center text-theme-xs text-gray-500">No sources seeded — stock has nowhere to live.</li>
                    @endforelse
                </ul>
            </x-admin.card>
        </div>
    </div>

    <p class="mt-3 text-theme-xs text-gray-500">
        {{ $currency['note'] }} Rates and thresholds live in configuration and change with a deploy,
        not from a form — an edit here would silently reinterpret every order placed before it.
    </p>
</div>
