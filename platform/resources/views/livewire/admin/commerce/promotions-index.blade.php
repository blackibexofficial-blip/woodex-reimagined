<div>
    <x-admin.page-header
        title="Promotions"
        description="What discounting actually cost, by code. There is no coupon catalogue yet, so this reads the discounts that landed on real orders — which are the only ones that cost anything."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Promotions' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat
            label="Given away"
            :value="number_format(intdiv($summary['discount'], 100))"
            icon="percent"
            hint="PKR of discount across orders"
        />
        <x-admin.stat
            label="Of gross"
            :value="number_format($summary['rate_bp'] / 100, 2).'%'"
            icon="trending-up"
            hint="measured before the discount"
        />
        <x-admin.stat
            label="Codes used"
            :value="$summary['codes']"
            icon="tag"
            :hint="$summary['uses'].' orders carried a code'"
        />
        <x-admin.stat
            label="Unattributed"
            :value="number_format(intdiv($summary['unattributed_amount'], 100))"
            icon="alert"
            :hint="$summary['unattributed'].' orders discounted without a code'"
            :tone="$summary['unattributed'] > 0 ? 'warning' : 'success'"
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

    <div class="mb-4 mt-6">
        <div class="relative max-w-md">
            <x-icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
                type="search"
                wire:model.live.debounce.300ms="search"
                placeholder="Coupon code…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search coupon codes"
            >
        </div>
    </div>

    <x-admin.card :padding="false">
        @if ($codes === [])
            <x-admin.empty
                icon="megaphone"
                title="No codes used"
                description="No order in this window carried a coupon. Discounts given without a code would appear above instead — they are counted separately because nobody can switch them off."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Code</th>
                            <th class="px-3 py-3 text-right font-medium">Uses</th>
                            <th class="px-3 py-3 text-right font-medium">Given away</th>
                            <th class="px-3 py-3 text-right font-medium">Average</th>
                            <th class="px-3 py-3 text-right font-medium">Largest</th>
                            <th class="px-5 py-3 text-right font-medium">Of goods</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($codes as $code)
                            <tr wire:key="code-{{ $code['code'] }}">
                                <td class="px-5 py-3">
                                    <span class="font-mono text-theme-xs text-gray-800 dark:text-white/90">{{ $code['code'] }}</span>
                                    @if ($code['discount'] === 0)
                                        <div class="mt-0.5 text-theme-xs text-warning-600">Discounted nothing</div>
                                    @endif
                                </td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{{ $code['uses'] }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-800 dark:text-white/90">{{ $this->money($code['discount']) }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-500">{{ $this->money($code['average']) }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-500">{{ $this->money($code['largest']) }}</td>
                                <td class="px-5 py-3 text-right tabular-nums text-gray-500">
                                    {{ $code['subtotal'] > 0 ? number_format($code['discount'] * 100 / $code['subtotal'], 1).'%' : '—' }}
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-admin.card>

    @if ($unattributed !== [] || $inert !== [])
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
            @if ($unattributed !== [])
                <x-admin.card :padding="false">
                    <div class="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                        <h2 class="text-theme-sm font-semibold text-gray-800 dark:text-white/90">Discounted with no code</h2>
                        <p class="mt-0.5 text-theme-xs text-gray-500">Money off that nobody can reproduce or switch off.</p>
                    </div>
                    <ul class="divide-y divide-gray-100 text-theme-sm dark:divide-gray-800">
                        @foreach (array_slice($unattributed, 0, 8) as $order)
                            <li class="flex items-center justify-between px-5 py-2.5">
                                <span class="font-mono text-theme-xs text-gray-600 dark:text-gray-300">{{ $order['order'] }}</span>
                                <span class="tabular-nums text-warning-600">−{{ $this->money((int) $order['discount']) }}</span>
                            </li>
                        @endforeach
                    </ul>
                </x-admin.card>
            @endif

            @if ($inert !== [])
                <x-admin.card :padding="false">
                    <div class="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                        <h2 class="text-theme-sm font-semibold text-gray-800 dark:text-white/90">Codes that did nothing</h2>
                        <p class="mt-0.5 text-theme-xs text-gray-500">The customer was told their coupon worked. It did not.</p>
                    </div>
                    <ul class="divide-y divide-gray-100 text-theme-sm dark:divide-gray-800">
                        @foreach (array_slice($inert, 0, 8) as $order)
                            <li class="flex items-center justify-between px-5 py-2.5">
                                <span class="font-mono text-theme-xs text-gray-600 dark:text-gray-300">{{ $order['order'] }}</span>
                                <span class="font-mono text-theme-xs text-warning-600">{{ $order['code'] }}</span>
                            </li>
                        @endforeach
                    </ul>
                </x-admin.card>
            @endif
        </div>
    @endif

    <p class="mt-3 text-theme-xs text-gray-500">
        Discounts are applied by the pricing calculator at the moment of the order and stored on
        it. Creating or editing a promotion is not on this page — a screen that recounts what
        happened should not also be able to change it.
    </p>
</div>
