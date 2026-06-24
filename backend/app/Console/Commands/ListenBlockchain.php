<?php

namespace App\Console\Commands;

use App\Services\BlockchainEventListenerService;
use Illuminate\Console\Command;

class ListenBlockchain extends Command
{
    protected $signature   = 'edl:listen';
    protected $description = 'Listen for EDL smart contract events and sync to MySQL';

    public function handle(BlockchainEventListenerService $listener): void
    {
        $this->info('EDL Blockchain Event Listener started.');
        $this->info('Press Ctrl+C to stop.');
        $this->info('');
        $listener->listen();
    }
}
