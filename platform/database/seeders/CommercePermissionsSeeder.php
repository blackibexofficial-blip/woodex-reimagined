<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Commerce\Access\CommercePermissions;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Adds the commerce permissions to the existing permission set and grants them to the roles
 * that already exist.
 *
 * Idempotent and additive: it never removes a permission, never creates a role, and never
 * touches a role that is not named here. Running it twice changes nothing.
 *
 * Call it from ProductionSeeder *after* RolesAndPermissionsSeeder, because the roles must
 * exist before they can be granted anything.
 */
class CommercePermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (CommercePermissions::ALL as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        foreach (CommercePermissions::roleGrants() as $roleName => $permissions) {
            $role = Role::query()->where('name', $roleName)->where('guard_name', 'web')->first();

            if ($role === null) {
                continue;
            }

            $role->givePermissionTo($permissions);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
