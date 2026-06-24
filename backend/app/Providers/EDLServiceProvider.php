<?php

namespace App\Providers;

use App\Services\BlockchainService;
use App\Services\BlockchainEventListenerService;
use App\Services\IdentityRegistryService;
use App\Services\KYCService;
use App\Services\LoanFactoryService;
use Illuminate\Support\ServiceProvider;

class EDLServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(BlockchainService::class);
        $this->app->singleton(IdentityRegistryService::class);
        $this->app->singleton(KYCService::class);
        $this->app->singleton(LoanFactoryService::class);
        $this->app->singleton(BlockchainEventListenerService::class);
    }
}
