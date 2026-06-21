# EDL Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner Milestone |
|---|---|---|---|---|---|
| R1 | Off-chain MySQL state drifts out of sync with on-chain state if the event listener (M8) misses or duplicates an event | Medium | High | vw_event_completeness_check view (built in earlier SQL); listener re-scans missed blocks on restart; idempotent event handlers using tx_hash unique constraints | M8 |
| R2 | Reentrancy vulnerability in fund() → _disburse() ETH transfer | Low (mitigated by design) | Critical | OpenZeppelin ReentrancyGuard applied; checks-effects-interactions pattern (state set before external call); explicit test case TC-SC-005 | M3 |
| R3 | PII accidentally written on-chain during rapid development | Medium | Critical | privacy_audit_log pre-flight check procedure; code review checklist requiring explicit on-chain payload inspection before any new contract write function | M6, M7 |
| R4 | Gas costs higher than expected on Besu production network, breaking NFR-007 cost target | Medium | Medium | gas_cost_log tracks every transaction from M2 onward; PoA consensus chosen specifically to avoid gas auctions; fallback to fixed-fee sidechain documented in TECH_STACK.md | M14 |
| R5 | Two AI agent sessions edit the same file simultaneously, causing merge conflicts or silent overwrites | Medium | Medium | Strict one-branch-per-milestone Git workflow (Step 6.1); AGENT_HANDOFF.md mandates checking PROGRESS.md before starting | All |
| R6 | Smart contract state machine allows an invalid transition due to a missed guard condition | Low | Critical | Exhaustive state transition test matrix in M3 (every state x every function = pass/revert expected); DB trigger trg_loan_state_forward_only as defense-in-depth at off-chain layer | M3 |
| R7 | Credit scoring formula produces unexpected scores at edge cases (0 payments, first payment, all late) | Medium | Low | Explicit edge case tests: zero repayments, single repayment, all-late history, all-on-time history | M3 |
| R8 | MFI officer role confused with admin role in middleware, allowing privilege escalation | Low | High | onlyOfficerOrAdmin() modifier is EXPLICIT not implicit; PHPUnit test asserts officer CANNOT call admin-only endpoints | M5 |
| R9 | Dissertation deadline pressure causes skipping of Definition of Done verification | Medium | High | Definition of Done checklists are binary (pass/fail) specifically to resist "good enough" rationalization under time pressure | All |
| R10 | Ganache state lost between development sessions (deterministic accounts reset, deployed contract addresses invalidated) | High | Low | --deterministic flag with fixed mnemonic ensures SAME addresses every restart; deployment script checks if already deployed before redeploying | M2, M3 |

---

## Review cadence

This register should be reviewed at the start of each new milestone branch.
Add new risks as they are discovered — do not wait for a "risk review meeting"
that will never happen on a solo dissertation project. The moment you think
"this could go wrong," write it here.
