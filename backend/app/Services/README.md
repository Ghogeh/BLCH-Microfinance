# Laravel Service Classes
Business logic that sits between controllers and models/blockchain.
- BlockchainService.php    Sends transactions to smart contracts via Web3.php
- KYCService.php           Generates SHA-256 hash, stores encrypted docs
- CreditScoreService.php   Mirrors on-chain reputation score to MySQL
- NotificationService.php  Queues notifications from blockchain events
- AuditService.php         Merkle root verification, forensic queries
