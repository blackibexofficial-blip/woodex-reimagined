<?php

use App\Providers\AppServiceProvider;
use App\Providers\CommerceServiceProvider;
use App\Providers\FortifyServiceProvider;
use App\Providers\WebsiteServiceProvider;

return [
    AppServiceProvider::class,
    CommerceServiceProvider::class,
    FortifyServiceProvider::class,
    WebsiteServiceProvider::class,
];
