# EDL Project — Engineering Journal: Phase 5
## Database Design, Migrations, Models & Seeders

**Phase:** 5 — Complete Database Layer
**Author:** Carl Ghogeh Vezhugho (UBA25EP054)
**Journal written by:** AI Pair Programmer (Claude Sonnet 4.6)
**Audience:** Yourself, future collaborators, dissertation examiners
**Date:** June 2026
**Prerequisite reading:** ENGINEERING_JOURNAL.md, ENGINEERING_JOURNAL_PHASE4.md

---

> This document explains every database design decision made in Phase 5 —
> from the first migration to the seeded test data. If you are reading this
> months from now and wondering "why is this column a CHAR(64) and not a
> VARCHAR?", or "why does this trigger exist?", the answer is here.

---

## PART 1 — THE PHILOSOPHY BEHIND THE DATABASE DESIGN

### 1.1 Two Sources of Truth, One System

The EDL system has two data stores that must stay in sync:

1. **The blockchain** — immutable, decentralised, tamper-evident. Stores the
   _facts_: loan states, repayment amounts, KYC hashes, blacklist entries.

2. **MySQL (off-chain)** — fast, queryable, relational. Stores the _context_:
   user names, phone numbers, loan metadata, notification history.

The critical engineering decision is: **which data lives where?**

```
ON-CHAIN (IdentityRegistry.sol, LoanContract.sol)    OFF-CHAIN (MySQL edl_db)
─────────────────────────────────────────────────    ──────────────────────────
SHA-256 hash of KYC document                    ←→   The actual KYC PDF file
Wallet address → KYC status (verified/pending)  ←→   User name, phone, email
Loan state (OPEN/FUNDING/ACTIVE/REPAID/DEFAULT)  ←→   Loan description, dates
Repayment amount in Wei                         ←→   Repayment amount in CFA
Reputation score (0–100)                        ←→   Score history, timestamps
Blacklist mapping (address → bool)              ←→   Days overdue, COBAC notes
```

The MySQL database is a **mirror** of the blockchain state, enriched with
human-readable data. When the blockchain and MySQL disagree, the blockchain
wins — it is the source of truth. The `hash_integrity_log` table exists
precisely to detect such disagreements.

### 1.2 Why MySQL Instead of a NoSQL Database

Some blockchain projects use MongoDB (document store) or Redis (key-value) for
off-chain data. We chose MySQL 8.0 because:

1. **Relational integrity** — foreign keys prevent orphaned records. A
   `Repayment` row can never point to a non-existent `Loan`. This constraint
   is enforced at the database level, not just in application code.

2. **ACID transactions** — when a loan transitions from FUNDING to ACTIVE, we
   need to update the `loans` table AND create a `loan_notifications` row AND
   write to `audit_log`, all atomically. If one fails, all fail. MySQL's
   transaction system guarantees this.

3. **Dissertation specification** — §3.3.2 explicitly specifies MySQL 8.0.

4. **SQL for audit queries** — the regulator needs queries like "show all loans
   from all MFIs where state = DEFAULTED and days_overdue > 90". This is
   trivially one SQL statement. It would be cumbersome in a document store.

---

## PART 2 — THE MIGRATION SYSTEM

### 2.1 What Laravel Migrations Are

A migration is a PHP file that describes a database change. Laravel tracks
which migrations have run in a `migrations` table. This means:

- Every developer who clones the project runs `php artisan migrate` and gets
  an identical database
- You can roll back (`migrate:rollback`) to undo changes
- The schema history is version-controlled alongside the code

**The Golden Rule of migrations:** Never modify a migration that has already
been run in production. Add a new migration instead.

We violated this rule deliberately in Phase 5 — but only because we are still
in development with no production data. In real production, you would add
ALTER TABLE migrations instead.

### 2.2 Migration Ordering and the Dependency Problem

Migrations must run in the correct order because of **foreign key constraints**.
A foreign key says "this column references a row in another table." If you try
to create a foreign key to a table that does not exist yet, the migration fails.

The dependency order for our tables:

```
users                          ← no dependencies
    └── kyc_documents          ← needs users
    └── loans                  ← needs users
            └── loan_guarantors ← needs loans AND users
            └── loan_funders    ← needs loans AND users
            └── repayments      ← needs loans AND users
                    └── credit_scores ← needs users AND repayments
            └── loan_notifications ← needs loans AND users
            └── blacklist       ← needs loans AND users
    └── audit_log              ← needs users (nullable)
NFR tables                     ← some need users (nullable FKs)
```

We encoded this order in the migration filenames:
```
2024_01_02_000001  kyc_documents
2024_01_02_000002  loans
2024_01_02_000003  loan_guarantors
2024_01_02_000004  loan_funders
2024_01_02_000005  repayments
2024_01_02_000006  credit_scores
2024_01_02_000007  audit_log
...
```

The `2024_01_02_00000N` prefix is not the real date — it is a sequence
number embedded in a date format. Laravel sorts migrations alphabetically by
filename, so `000002` always runs before `000003`.

**Why use a fake 2024 date?** The default Laravel migrations use
`0001_01_01_000000` (a mythical date). Our EDL migrations use `2024_01_02`
to group them together and sort them after Laravel's defaults but before our
timestamp-based future migrations.

### 2.3 `migrate:fresh` vs `migrate:rollback` vs `migrate`

| Command | What it does | When to use |
|---|---|---|
| `php artisan migrate` | Runs only NEW migrations | Normal development |
| `php artisan migrate --step` | Runs each migration as a separate batch | Debugging — isolates which migration fails |
| `php artisan migrate:rollback` | Undoes the LAST batch | Fixing a recent migration |
| `php artisan migrate:reset` | Undoes ALL migrations | Complete schema reset |
| `php artisan migrate:fresh` | Drops ALL tables then reruns everything | When you need a clean slate |
| `php artisan migrate:fresh --seed` | Fresh + runs DatabaseSeeder | Most common dev workflow |

We used `migrate:fresh --seed` repeatedly during Phase 5 because we were
still designing the schema. In Phase 6 onwards, the schema is stable — use
`migrate` for new changes and `migrate:rollback` for mistakes.

---

## PART 3 — EVERY TABLE EXPLAINED

### 3.1 The Users Table — The Foundation

```sql
wallet_address  VARCHAR(42)  UNIQUE NOT NULL
role            ENUM(entrepreneur, lender, officer, regulator, admin)
kyc_status      ENUM(pending, verified, rejected)
kyc_hash        CHAR(64)  -- SHA-256 hex of KYC document
blacklisted     BOOLEAN   -- mirrors IdentityRegistry.sol
```

**Why `wallet_address` is the primary identity (not email):**

In a traditional system, `email` is the unique identifier. In EDL, the primary
identity is the **Ethereum wallet address**. Here is why:

1. A wallet address is cryptographically unique — it is derived from a private
   key using elliptic curve mathematics. No two wallets can have the same address.
2. The blockchain knows nothing about email — it only knows addresses.
3. A borrower can change their email; they cannot change their wallet address
   (or rather, doing so breaks their on-chain identity).

Email is optional (`nullable`) and used only for notifications. The wallet
address is required and unique.

**Why `CHAR(64)` for `kyc_hash`, not `VARCHAR(64)`:**

`CHAR(N)` stores exactly N characters, always. `VARCHAR(N)` stores up to N
characters, with variable length.

A SHA-256 hash is **always exactly 64 hexadecimal characters**. It never varies.
Using `CHAR(64)` is more storage-efficient (no length prefix) and signals to
future developers: this column is always full. `VARCHAR(64)` would imply the
hash could be shorter, which is misleading.

**Why `ENUM` for role, not a separate `roles` table:**

A separate roles table (with a pivot table) is the normalised approach and is
correct for systems with dynamic, user-configurable roles. But EDL's roles are
**fixed by the dissertation and the smart contract** — they are `bytes32`
constants in `Roles.sol`. They cannot change without redeploying the contracts.
An `ENUM` is the precise tool for a fixed set of known values.

**The `softDeletes()` — why not just DELETE?**

`softDeletes()` adds a `deleted_at` column. When you call `$user->delete()`,
Laravel sets `deleted_at = now()` instead of physically removing the row.
Queries automatically filter out soft-deleted records.

Why? Regulatory compliance. COBAC may require user records to be retained even
after an account is closed. Physically deleting a borrower who defaulted would
destroy the evidence. Soft deletes preserve the record while hiding it from
normal application queries.

### 3.2 The Loans Table — The State Machine Mirror

The most important design decision in this table:

```sql
state  ENUM('OPEN','FUNDING','ACTIVE','REPAID','DEFAULTED')  DEFAULT 'OPEN'
```

**Why UPPERCASE enum values?**

We use `OPEN` not `open` because the enum values mirror the Solidity
`LoanState` enum exactly:
```solidity
enum LoanState { OPEN, FUNDING, ACTIVE, REPAID, DEFAULTED }
```

When the queue worker receives a `LoanDisbursed` event from the blockchain and
calls `$loan->update(['state' => 'ACTIVE'])`, the string `'ACTIVE'` is the
same in both PHP and Solidity. No translation layer, no case conversion, no
bugs from mismatched strings.

**Why both `amount_cfa` and `amount_wei`?**

```sql
amount_cfa  DECIMAL(15,2)   -- for display: "200,000 CFA"
amount_wei  VARCHAR(78)     -- for blockchain: "200000000000000000000"
```

The blockchain works in Wei (the smallest unit of Ether). 1 ETH = 10^18 Wei.
The numbers get extremely large — a 200,000 CFA loan might be 0.5 ETH =
500,000,000,000,000,000 Wei (18 zeros). This number overflows every standard
numeric type:
- MySQL's `BIGINT` maximum is 9,223,372,036,854,775,807 (~9.2 × 10^18)
- 0.5 ETH in Wei is 5 × 10^17 — safely within BIGINT, but 1 ETH would overflow
- In production with real amounts, Wei values can exceed BIGINT

The safe solution is `VARCHAR(78)` — treating Wei as a string. 78 characters
can hold any `uint256` value (which has a maximum of 78 decimal digits).
Application code converts between Wei strings and decimal numbers using ethers.js
`formatEther()` / `parseEther()`.

**Why `DECIMAL(15,2)` for CFA amounts, not `FLOAT` or `DOUBLE`?**

This is critical. **Never use FLOAT or DOUBLE for money.** Here is why:

```php
// With FLOAT:
0.1 + 0.2 = 0.30000000000000004  // NOT 0.3!
```

Floating-point numbers are stored in binary, and most decimal fractions cannot
be represented exactly in binary. `DECIMAL(15,2)` stores numbers in exact
decimal format — 15 digits total, 2 after the decimal point. This means:
- Maximum value: 9,999,999,999,999.99 CFA (~10 trillion)
- No rounding errors: 55,000.00 is always exactly 55,000.00

The API conventions document explicitly states: "Amounts: integer cents (XAF)
— never floating point." The DECIMAL type enforces this at the database level.

**Why `softDeletes()` on loans but NOT on repayments?**

Loans can be archived (soft-deleted when an MFI leaves the consortium, for
administrative purposes). But a repayment is an **on-chain fact** — a
blockchain transaction that happened. You cannot "archive" a blockchain
transaction. We intentionally omitted `softDeletes()` from the Repayment model
to prevent that pattern.

### 3.3 The Loan Guarantors Table — The n-of-m Constraint

```sql
UNIQUE KEY (loan_id, guarantor_id)
```

This single database constraint enforces the rule: **a wallet cannot guarantee
the same loan twice**. The smart contract also enforces this (`require(!alreadyGuaranteed)`),
but we enforce it at the database level too. Defence in depth — if there is ever
a bug in the event listener that tries to insert a duplicate guarantee, the
database rejects it before the data is corrupted.

**Why no unique constraint on loan_funders?**

A lender CAN fund the same loan multiple times — each `fund()` call is a
separate blockchain transaction with its own tx_hash. Multiple funding
contributions from the same lender are valid and common. Hence no unique
constraint on `(loan_id, funder_id)` in loan_funders. The contrast is
deliberate and documented in the migration file.

### 3.4 The Repayments Table — Append-Only Design

```sql
tx_hash  VARCHAR(66)  NULLABLE  UNIQUE
```

**Why is `tx_hash` nullable but unique?**

In a perfect world, every repayment row would have a tx_hash — the on-chain
transaction that triggered it. But during testing and seeding, we create
repayment rows without an on-chain transaction. Making tx_hash `nullable`
allows this.

The `UNIQUE` constraint still applies to non-null values. In MySQL, multiple
NULL values in a unique column are allowed — NULLs are considered distinct
for uniqueness purposes. So two seed rows can both have `tx_hash = NULL`
without violating uniqueness, but two rows cannot both have
`tx_hash = '0xabc...'`.

**Column name alignment: the mismatch bug**

When we wrote the repayments migration, we named columns:
- `amount_cfa`, `amount_wei`, `balance_after_cfa`, `repaid_at`

Later, when we wrote the Repayment model, we named the fillable fields:
- `amount_paid_cfa`, `amount_paid_wei`, `remaining_after_cfa`, `on_chain_timestamp`

And the LoanSeeder used the model names. Result: the seeder crashed because it
was trying to insert into columns that did not exist.

**The fix:** We updated the migration to match the model names. This is the
correct direction — the model is the API that application code uses; the
migration should conform to it, not the other way around.

**Engineering lesson:** Always design the model interface first (what the
application sees), then write the migration to match. The migration is
infrastructure — the model is the contract.

### 3.5 The Credit Scores Table — One Row Per User

```sql
user_id  BIGINT  UNIQUE  -- enforced at DB level: one score per user
```

The `unique()` on `user_id` means there can only ever be one credit score
row per user. This mirrors the on-chain design where each wallet has one
`reputationScore` uint256 value in the LoanContract.

```sql
score  DECIMAL(5,2)  DEFAULT 50.00
```

We changed the score column from `UNSIGNED TINYINT` (original migration) to
`DECIMAL(5,2)`. Here is why:

- `UNSIGNED TINYINT` stores 0–255 as integers — good for memory, bad for
  precision
- The scoring formula uses weighted averages: `(timeliness * 0.6) + (volume * 0.3) + (lateness * 0.1)`
- This formula can produce values like `67.35` — fractional scores
- The model has `'score' => 'decimal:2'` cast
- The seeder inserts `65.00` — a decimal value

`DECIMAL(5,2)` stores up to `999.99` with exact decimal precision. Perfect fit.

**The `triggered_by_repayment_id` foreign key:**

```sql
triggered_by_repayment_id  FK → repayments.id  NULL ON DELETE SET NULL
```

Every credit score update is triggered by a specific repayment event. This
foreign key creates a direct audit trail: "Chioma's score changed to 65 because
of repayment #3." If the repayment row is ever (somehow) deleted, the FK sets
this field to NULL rather than cascading the delete to the credit score — you
want to keep the score even if the audit trail is broken.

### 3.6 The Audit Log Table — Immutable by Design

The `audit_log` table has two engineering features that distinguish it from
all other tables:

**Feature 1: No `updated_at` column**

```php
public $timestamps = false;
const CREATED_AT = 'created_at';
```

Standard Laravel models have both `created_at` and `updated_at`. We
deliberately only have `created_at`. Why? Because audit log entries are
write-once. An audit entry that was updated would itself be an audit violation
— you would need a log of changes to the audit log, leading to infinite
recursion. Having no `updated_at` column signals at the database level: this
table is append-only.

**Feature 2: MySQL Triggers for true immutability**

```sql
CREATE TRIGGER trg_audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE "45000"
        SET MESSAGE_TEXT = "NFR-010: audit_log is immutable";
END;
```

A MySQL trigger fires automatically when a specified event occurs on a table.
`BEFORE UPDATE` means it fires before any UPDATE statement on `audit_log`.
`SIGNAL SQLSTATE "45000"` raises a user-defined error — MySQL immediately
cancels the UPDATE and returns an error.

This means **no application code, no admin user, no direct SQL client** can
modify or delete an audit log entry. Not even a typo in a migration. The
trigger is enforced at the database engine level, below the application layer.

**`SQLSTATE "45000"`** is the standard MySQL state code for user-defined errors.
The quoted string is the error message that will appear in the application's
exception log, clearly identifying the NFR that was violated.

**The `entity_type` ENUM as a poor man's polymorphic index:**

```sql
entity_type  ENUM('loan','user','repayment','guarantee','funder','kyc_document','blacklist','system')
entity_id    BIGINT UNSIGNED NULLABLE
```

An audit log entry can refer to any entity in the system. Rather than having
separate `loan_id`, `user_id`, `kyc_document_id` nullable columns (most of
which would be NULL), we use the `(entity_type, entity_id)` pair. This is
called a **polymorphic association** — the same two columns can reference
different tables depending on `entity_type`.

The composite index on `(entity_type, entity_id)` makes queries like "show
all audit entries for loan #42" fast:
```sql
SELECT * FROM audit_log WHERE entity_type = 'loan' AND entity_id = 42;
```

### 3.7 The Blacklist Table — CEMAC 2026 Compliance

```sql
user_id        BIGINT  UNIQUE  -- one blacklist entry per user
wallet_address VARCHAR(42) UNIQUE  -- denormalized for fast lookup
default_loan_id FK → loans  NULL ON DELETE SET NULL
```

**Why store `wallet_address` when we already have `user_id`?**

This is deliberate **denormalization** — storing redundant data for
performance. When the smart contract's `createLoan()` function checks
`isBlacklisted(borrowerAddress)`, it passes a wallet address, not a user ID.

The blockchain layer does not know about our integer IDs — it only knows
wallet addresses. By storing `wallet_address` directly in the blacklist table
and indexing it, we can answer "is this address blacklisted?" in a single
fast lookup without joining to the users table.

**The `lifted` flag — future regulatory review:**

```sql
lifted      BOOLEAN  DEFAULT false
lifted_by   FK → users  NULL
lifted_reason VARCHAR(500)
```

The 2026 CEMAC regulation may allow blacklist entries to be administratively
lifted (e.g., the borrower proves the default was fraudulent, or fully
repays the outstanding debt). These columns support that future workflow
without a schema change.

### 3.8 The Six NFR Monitoring Tables — Engineering for Compliance

The six tables in the `000010` migration monitor each Non-Functional Requirement:

| Table | NFR | What it measures |
|---|---|---|
| `hash_integrity_log` | NFR-002 | Does MySQL hash match the on-chain hash? |
| `merkle_root_cache` | NFR-010 | Is this block's Merkle root tampered? |
| `transaction_performance_log` | NFR-004 + 008 | Is block confirmation < 5 seconds? |
| `privacy_audit_log` | NFR-009 | Was PII accidentally included in any payload? |
| `node_health_log` | NFR-003 | Is each consortium node responding? |
| `gas_cost_log` | NFR-007 | Is the monthly gas cost < USD 50 per MFI? |

**Why put all six in one migration file?**

They have no foreign key dependencies on each other. They all serve the same
purpose (compliance monitoring). They will always be deployed together. A
single migration for a logical grouping is cleaner than six separate migration
files that clutter the `migrations/` directory.

**`transaction_performance_log` — microsecond timestamps:**

```sql
submitted_at  TIMESTAMP(6)  -- microsecond precision
confirmed_at  TIMESTAMP(6)  -- microsecond precision
latency_ms    INT UNSIGNED  -- computed difference
```

`TIMESTAMP(6)` stores timestamps with 6 decimal places of seconds precision
(microseconds). Standard `TIMESTAMP` has second-level precision. NFR-004
requires confirmation times to be measured and compared against the 5-second
threshold. Without sub-second precision, you cannot accurately measure a
2,847ms confirmation time.

**`nfr004_compliant` and `nfr007_compliant` boolean flags:**

Rather than computing compliance in every query (`WHERE latency_ms < 5000`),
we store the compliance result as a boolean at insertion time. This allows the
regulator dashboard to query:
```sql
SELECT COUNT(*) FROM transaction_performance_log WHERE nfr004_compliant = false;
```
A simple count of violations, without any computation. The computation happens
once at write time; reads are fast and simple.

---

## PART 4 — THE TRIGGER SYSTEM (5 TRIGGERS IN TOTAL)

### 4.1 The Three Trigger Categories

| Trigger | Type | Purpose |
|---|---|---|
| `trg_audit_log_no_update` | BEFORE UPDATE | Immutability — NFR-010 |
| `trg_audit_log_no_delete` | BEFORE DELETE | Immutability — NFR-010 |
| `trg_repayments_no_update` | BEFORE UPDATE | Immutability — NFR-002 |
| `trg_repayments_no_delete` | BEFORE DELETE | Immutability — NFR-002 |
| `trg_loan_state_forward_only` | BEFORE UPDATE | State machine — NFR-002 |

### 4.2 The Loan State Trigger — The Most Complex One

```sql
CREATE TRIGGER trg_loan_state_forward_only
BEFORE UPDATE ON loans
FOR EACH ROW
BEGIN
    IF NOT (
        (OLD.state = 'OPEN'      AND NEW.state IN ('OPEN','FUNDING','DEFAULTED')) OR
        (OLD.state = 'FUNDING'   AND NEW.state IN ('FUNDING','ACTIVE','DEFAULTED')) OR
        (OLD.state = 'ACTIVE'    AND NEW.state IN ('ACTIVE','REPAID','DEFAULTED')) OR
        (OLD.state = 'REPAID'    AND NEW.state = 'REPAID') OR
        (OLD.state = 'DEFAULTED' AND NEW.state = 'DEFAULTED')
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'NFR-002: illegal loan state transition';
    END IF;
END;
```

**How MySQL triggers work:**

Inside a BEFORE UPDATE trigger, `OLD.column` refers to the value before the
update, and `NEW.column` refers to the value that the UPDATE statement is
trying to set. The trigger can inspect both and decide whether to allow the
change.

**The valid transition matrix (reading the trigger logic):**

```
FROM       →  TO (allowed)
──────────────────────────────────────────
OPEN       →  OPEN (no change), FUNDING, DEFAULTED
FUNDING    →  FUNDING (no change), ACTIVE, DEFAULTED
ACTIVE     →  ACTIVE (no change), REPAID, DEFAULTED
REPAID     →  REPAID only (terminal state)
DEFAULTED  →  DEFAULTED only (terminal state)
```

Notably, REPAID and DEFAULTED are **terminal states** — a REPAID loan cannot
become ACTIVE again, and a DEFAULTED loan cannot be un-defaulted in the
database (the on-chain event is permanent; only the administrative `lifted`
flag in the blacklist table can record a rehabilitation).

**Why allow `OLD.state = NEW.state` (no-change updates)?**

When the queue worker receives a blockchain event and updates a loan, it
might update `remaining_balance_cfa` without changing `state`. An UPDATE
that changes only non-state columns will fire the trigger with
`OLD.state = 'ACTIVE'` and `NEW.state = 'ACTIVE'` — the same value. This
must be allowed, otherwise updating any column on a loan would fail.

### 4.3 The Critical Bug: Trigger Was Lost After `migrate:fresh`

**What happened:** We created `trg_loan_state_forward_only` via a manual
tinker command. It worked. Then we ran `php artisan migrate:fresh` (which
drops ALL tables), and the trigger was gone — because triggers are attached
to tables, and the table was dropped.

**Why this is a serious problem in production:**

In development, we can re-run `migrate:fresh` any time. In production, you
never drop all tables. But if a new developer joins, clones the repo, and
runs `php artisan migrate`, they get a database without the trigger. The
state machine protection would be silently missing.

**The fix:** Embed the trigger creation inside the loans migration's `up()`
method, and the trigger drop inside `down()`:

```php
// In 2024_01_02_000002_create_loans_table.php
public function up(): void {
    Schema::create('loans', function (Blueprint $table) { ... });

    \DB::unprepared('CREATE TRIGGER trg_loan_state_forward_only ...');
}

public function down(): void {
    \DB::unprepared('DROP TRIGGER IF EXISTS trg_loan_state_forward_only');
    Schema::dropIfExists('loans');
}
```

Now the trigger is created every time the loans migration runs — including
`migrate:fresh`, `migrate` on a fresh clone, and CI/CD pipeline deployments.
It can never be accidentally absent.

**Engineering principle:** Any database object that enforces business logic
(triggers, stored procedures, views, check constraints) must live in a
migration file — never created manually.

---

## PART 5 — THE ELOQUENT MODEL LAYER

### 5.1 What Eloquent Models Are

Laravel's Eloquent is an **ORM (Object-Relational Mapper)**. It maps database
rows to PHP objects. Instead of writing:
```php
$result = DB::select('SELECT * FROM loans WHERE state = ?', ['ACTIVE']);
```

You write:
```php
$loans = Loan::active()->get();
```

Eloquent handles the SQL generation, result hydration, type casting, and
relationship loading. But it has conventions that must be respected.

### 5.2 The Table Naming Convention — Two Bugs Found

Laravel automatically derives the database table name from the model class name:
- `User` → `users`
- `Loan` → `loans`
- `Repayment` → `repayments`
- `LoanGuarantor` → `loan_guarantors`

The pluralisation is handled by Laravel's `Str::plural()` method. For most
class names, the result is obvious. But for two of our models, it went wrong:

**Bug 1: `AuditLog` → Laravel guessed `audit_logs`**
Our table is named `audit_log` (singular) — a log is a log, not a collection
of "logs" in the same way "users" is a collection of users.

**Bug 2: `Blacklist` → Laravel guessed `blacklists`**
Our table is named `blacklist` (singular) — there is one blacklist, not
multiple blacklists.

**The fix for both:**
```php
class AuditLog extends Model {
    protected $table = 'audit_log';  // override auto-pluralisation
}

class Blacklist extends Model {
    protected $table = 'blacklist';  // override auto-pluralisation
}
```

**How to detect this class of bug early:** Run `php artisan tinker` and call
`ModelName::count()` for every model. If a table name is wrong, you get:
`SQLSTATE[42S02]: Base table or view not found: 1146 Table '...tablename'
doesn't exist`. This is exactly the error we caught.

**Engineering lesson:** Always add `protected $table` to models whose class
names do not follow the `CamelCase → snake_case_plural` convention exactly.
When in doubt, be explicit.

### 5.3 The `$fillable` vs `$guarded` Decision

Every Eloquent model must declare which columns can be mass-assigned (set via
`Model::create([...])` or `$model->fill([...])`). There are two approaches:

**`$fillable` (allowlist)** — list exactly which columns are allowed:
```php
protected $fillable = ['wallet_address', 'role', 'name', ...];
```

**`$guarded` (blocklist)** — list which columns are blocked (usually just `id`):
```php
protected $guarded = ['id'];
```

We use `$fillable` for all models. Why? Security. The `$guarded = ['id']`
approach means every new column you add to the migration is automatically
mass-assignable. If a future developer adds a `is_system_admin` column
and forgets to guard it, an attacker who controls the request body could
set `is_system_admin = true`. With `$fillable`, new columns are blocked
by default until explicitly added to the list.

### 5.4 Type Casting — Converting Between PHP and MySQL

```php
protected $casts = [
    'email_verified_at' => 'datetime',
    'blacklisted'       => 'boolean',
    'amount_cfa'        => 'decimal:2',
    'details'           => 'array',
];
```

MySQL stores dates as strings (`2026-06-20 14:32:11`), booleans as `TINYINT(1)`,
JSON as text, and decimals as strings (when using PHP's PDO). Without casts,
reading `$user->blacklisted` would return `"0"` or `"1"` — strings, not
booleans. The cast automatically converts:

- `datetime` → PHP `Carbon` object (with `->format()`, `->diffForHumans()`)
- `boolean` → PHP `true`/`false`
- `decimal:2` → PHP string `"200000.00"` (not float — avoids precision loss)
- `array` → PHP array (auto-serialized to/from JSON)

### 5.5 Helper Methods and Query Scopes

**State helpers on Loan:**
```php
public function isActive(): bool    { return $this->state === 'ACTIVE'; }
public function isDefaulted(): bool { return $this->state === 'DEFAULTED'; }
public function fundingProgressPercent(): float {
    return min(100, ($this->total_funded_cfa / $this->amount_cfa) * 100);
}
```

These methods exist so application code reads like plain English:
```php
if ($loan->isDefaulted()) { /* trigger CEMAC blacklist */ }
echo $loan->fundingProgressPercent() . '%'; // "65%"
```

Without helpers, application code would be littered with `$loan->state === 'DEFAULTED'`
comparisons — easy to mistype, hard to refactor.

**Query scopes on Loan:**
```php
public function scopeOverdue($query) {
    return $query->where('state', 'ACTIVE')
                 ->where('due_date', '<', now());
}
```

A scope adds reusable query constraints:
```php
// Without scope:
Loan::where('state', 'ACTIVE')->where('due_date', '<', now())->get();

// With scope:
Loan::overdue()->get();
```

Scopes are chainable and composable:
```php
Loan::overdue()->where('borrower_id', $user->id)->count();
```

### 5.6 The AuditLog Model — Special Timestamp Configuration

```php
class AuditLog extends Model
{
    public $timestamps = false;    // disables auto-managed created_at + updated_at
    const CREATED_AT = 'created_at'; // but tell Eloquent which column IS the timestamp
}
```

By default, Eloquent manages two timestamps: `created_at` (set on insert) and
`updated_at` (set on insert and update). Setting `$timestamps = false` turns
off both — useful because `audit_log` has no `updated_at` column.

But we still want `created_at` to be set automatically on insert. The
`const CREATED_AT = 'created_at'` line tells Eloquent: when inserting, set
this column to the current timestamp. The combination gives us auto-managed
`created_at` without any `updated_at`.

---

## PART 6 — THE SEEDER LAYER

### 6.1 Why Seed Data Matters

Seeders serve two purposes in EDL:

1. **Development convenience** — instead of manually creating users and loans
   through the API for every `migrate:fresh`, the seeders do it automatically.
   Every developer starts with the same consistent test data.

2. **Integration test fixtures** — the seeded data represents realistic
   scenarios that integration tests can rely on. Tests that need an ACTIVE loan
   with a verified borrower can use the seeded data without creating their own.

### 6.2 The Seeder Architecture

```
DatabaseSeeder
    └── UserSeeder   (must run first — loans need user IDs)
    └── LoanSeeder   (depends on users existing)
```

The order matters because of foreign key constraints. `LoanSeeder` fetches
users by email to get their IDs:
```php
$chioma = User::where('email', 'chioma@gmail.com')->first();
```

If `UserSeeder` had not run first, this would return `null` and the loan
creation would fail with a null constraint violation.

### 6.3 The Realistic Test Data Design

The seeded data was designed to cover multiple states of the loan lifecycle:

**Loan 1 (ACTIVE):** Represents a loan that has been fully funded, disbursed,
and has one repayment made. This is the "happy path" — the most common state
in a healthy portfolio.

**Loan 2 (FUNDING):** Represents a loan that has passed the guarantee stage
and is 50% funded. This tests the UI's funding progress display and lender
browsing features.

**No REPAID or DEFAULTED loans in seed data** — these are terminal states. 
Creating them via seeders would mean the seeded entrepreneurs already have
completed loan histories, which is less useful for testing the active
workflows. Terminal-state loans should be created in dedicated test cases.

### 6.4 Wallet Addresses Are Ganache Accounts

The wallet addresses in UserSeeder map to real Ganache test accounts:

```
Admin:      0xf39Fd6e51...  ← Ganache account (Hardhat default)
Officer:    0x70997970...   ← Ganache account [1]
Chioma:     0x3C44CddD...   ← Ganache account [2]
Bertrand:   0x90F79bf6...   ← Ganache account [3]
Grace:      0x15d34AAf...   ← Ganache account [4]
SACCO:      0x99655070...   ← Ganache account [5]
ProCredit:  0x976EA740...   ← Ganache account [6]
COBAC:      0x14dC7996...   ← Ganache account [7]
```

This means when you open MetaMask and import one of these private keys, you
can log into the frontend as the corresponding user and perform real blockchain
transactions. The seed data and the blockchain accounts are aligned.

---

## PART 7 — BUGS FOUND AND FIXED IN PHASE 5

### Bug Summary Table

| Bug | Root Cause | Fix | Where Fixed |
|---|---|---|---|
| Seeder crash on `amount_paid_cfa` | Migration used `amount_cfa`; model/seeder used `amount_paid_cfa` | Updated migration columns to match model | `000005_create_repayments_table.php` |
| Seeder crash on `on_time_payments` | Migration used `on_time_count`; model/seeder used `on_time_payments` | Updated migration columns to match model | `000006_create_credit_scores_table.php` |
| `App\Models\AuditLog` → `audit_logs` | Laravel auto-pluralises class name | Added `protected $table = 'audit_log'` | `AuditLog.php` |
| `App\Models\Blacklist` → `blacklists` | Laravel auto-pluralises class name | Added `protected $table = 'blacklist'` | `Blacklist.php` |
| Trigger lost after `migrate:fresh` | Trigger created manually via tinker, not in migration | Embedded trigger in loans migration `up()` | `000002_create_loans_table.php` |
| `tx_hash NOT NULL` blocked seeder | Seeder doesn't provide tx_hash (no live blockchain) | Made `tx_hash` nullable | `000005_create_repayments_table.php` |
| `block_number NOT NULL` blocked seeder | Same reason | Made `block_number` nullable | `000005_create_repayments_table.php` |

### The Design Lesson from the Column Name Mismatch

The root cause of the first two bugs was that **the migration was written
before the model**. When we later wrote the model's `$fillable` array, we
used more descriptive names (`amount_paid_cfa` instead of `amount_cfa`).

The correct workflow for future tables:
1. Design the model first — decide what the PHP code should look like
2. Write `$fillable` and `$casts` in the model
3. Write the migration to match those exact names
4. Test with a seeder before moving on

---

## PART 8 — PHASE 5 BY THE NUMBERS

```
Migrations created:      13 EDL + 1 Sanctum (14 total)
Tables in edl_db:        25 (16 business + 9 Laravel/system)
Database triggers:        5
Eloquent models:         10
Relationships defined:   38 (hasMany, hasOne, belongsTo, MorphMany)
Helper methods:          12 (isActive(), isEligibleToBorrow(), getRating()...)
Query scopes:             4 (active, funding, defaulted, overdue)
Seeded users:             8 (1 admin, 1 officer, 3 entrepreneurs, 2 lenders, 1 regulator)
Seeded loans:             2 (1 ACTIVE, 1 FUNDING)
Bugs caught and fixed:    7
```

---

## PART 9 — WHAT COMES NEXT (PHASE 6 PREVIEW)

Phase 6 is **Smart Contract Implementation** — writing the actual Solidity
contracts that define the on-chain rules.

The contracts to be written:
```
contracts/src/access/
    Roles.sol              ← bytes32 role constants
    EDLAccessControl.sol   ← OpenZeppelin AccessControl base
    RBACModifiers.sol      ← onlyEntrepreneur, onlyOfficer, etc.

contracts/src/
    IdentityRegistry.sol   ← KYC hashing, status, blacklist
    LoanFactory.sol        ← deploys LoanContract instances
    LoanContract.sol       ← the complete state machine
```

The database schema designed in Phase 5 directly informs the contract design:
- The `ENUM('OPEN','FUNDING','ACTIVE','REPAID','DEFAULTED')` in MySQL mirrors
  the `LoanState` enum in Solidity
- The `sha256_hash` in `kyc_documents` mirrors the `kycHash` bytes32 in
  `IdentityRegistry`
- The `blacklisted` bool in `users` mirrors the `isBlacklisted` mapping in
  `IdentityRegistry`

---

## APPENDIX — THE MIGRATION CHECKLIST

For every new table you create, verify these before committing:

```
[ ] Column names match the model's $fillable exactly
[ ] Money columns use DECIMAL(15,2), never FLOAT
[ ] Wallet addresses use VARCHAR(42) or CHAR(42)
[ ] Transaction hashes use VARCHAR(66) or CHAR(66)
[ ] SHA-256 hashes use CHAR(64)
[ ] uint256 Wei values use VARCHAR(78)
[ ] ENUM values match Solidity enum names exactly (UPPERCASE)
[ ] Foreign keys have appropriate ON DELETE actions (cascade vs restrict)
[ ] Soft deletes added only where audit retention is required
[ ] Tables with append-only semantics have immutability triggers
[ ] Triggers are embedded in the migration, not created manually
[ ] Model has protected $table if the auto-pluralised name is wrong
[ ] Model tested with Model::count() via tinker
[ ] Seeds created and migrate:fresh --seed passes without errors
```

---

*End of Engineering Journal — Phase 5: Database Design, Migrations, Models & Seeders*
*Next journal entry will cover: Phase 6 — Smart Contract Implementation*
