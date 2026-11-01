<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\System\Actions\CreateOwnerAccount;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Make sure the owner account exists — and that its password is the one printed on the sign-in screen.
 *
 * `woodex:install` does this too, but it also imports the bundled website, which is the wrong thing to do on
 * this deployment: the interior site it would bring back was replaced by the furniture storefront. When a
 * database is restored, copied or rebuilt, the staff accounts come back empty and nobody can sign in — the
 * sign-in screen shows a demo password that no longer matches any row.
 *
 *   php artisan woodex:owner                  # create the owner if absent, leave an existing one alone
 *   php artisan woodex:owner --force          # also reset its password to OWNER_PASSWORD
 *   php artisan woodex:owner --password=...   # set a specific password
 *
 * Safe to run at any time: it touches one row, never the website, and never deletes anything.
 */
final class OwnerAccountCommand extends Command
{
    protected $signature = 'woodex:owner
                            {--force : Reset the password of an existing owner to OWNER_PASSWORD}
                            {--password= : Set this password instead of OWNER_PASSWORD}';

    protected $description = 'Create the owner account (or repair its password) from OWNER_EMAIL / OWNER_PASSWORD';

    public function handle(CreateOwnerAccount $createOwner): int
    {
        $name = (string) config('woodex.owner.name');
        $email = (string) config('woodex.owner.email');
        $secret = (string) ($this->option('password') ?: config('woodex.owner.password'));

        if ($email === '') {
            $this->components->error('OWNER_EMAIL is not set in .env, so there is no account to create.');

            return self::FAILURE;
        }

        $existing = User::query()->where('email', $email)->first();

        if ($existing === null) {
            if ($secret === '') {
                $this->components->error('OWNER_PASSWORD is not set, so the owner cannot be created.');

                return self::FAILURE;
            }

            $validator = Validator::make(
                ['owner_name' => $name !== '' ? $name : 'Owner', 'owner_email' => $email, 'owner_password' => $secret],
                CreateOwnerAccount::rules(),
            );

            if ($validator->fails()) {
                foreach ($validator->errors()->all() as $error) {
                    $this->components->error($error);
                }

                return self::FAILURE;
            }

            $user = $createOwner->handle($name !== '' ? $name : 'Owner', $email, $secret);

            $this->components->twoColumnDetail('Owner created', '#'.$user->id.' '.$user->email);
            $this->components->twoColumnDetail('Sign in with', $email.' / '.(string) config('woodex.owner.password'));

            return self::SUCCESS;
        }

        // An account exists. Repair what a restored database usually loses: the flag and the role.
        $repairs = [];

        if (! $existing->is_active) {
            $existing->forceFill(['is_active' => true])->save();
            $repairs[] = 'reactivated';
        }

        if (! $existing->hasRole('owner')) {
            $existing->assignRole('owner');
            $repairs[] = 'given the owner role';
        }

        if ($this->option('force') || $this->option('password')) {
            if ($secret === '') {
                $this->components->error('No password to set: pass --password or set OWNER_PASSWORD.');

                return self::FAILURE;
            }

            $check = Validator::make(['password' => $secret], ['password' => ['required', Password::default()]]);

            if ($check->fails()) {
                foreach ($check->errors()->all() as $error) {
                    $this->components->error($error);
                }

                return self::FAILURE;
            }

            $existing->forceFill(['password' => Hash::make($secret), 'is_active' => true])->save();
            $repairs[] = 'password reset';
        }

        $this->components->twoColumnDetail('Owner', '#'.$existing->id.' '.$existing->email);

        if ($repairs === []) {
            $this->components->info('The owner account already exists and needs no repair. Use --force to reset its password.');

            return self::SUCCESS;
        }

        $this->components->info('Repaired: '.implode(', ', $repairs).'.');

        return self::SUCCESS;
    }
}
