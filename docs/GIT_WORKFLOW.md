# EDL Git Workflow

## Branch structure

master      ← production-ready releases only, tagged versions
  └── develop   ← integration branch, all milestone work merges here first
        └── milestone/M1-project-init
        └── milestone/M2-identity-registry
        └── milestone/M3-loan-contracts
        └── milestone/M4-database          (already merged — Phase 5)
        └── milestone/M5-laravel-auth
        └── ... etc, one branch per milestone

## Rule for every AI agent session

BEFORE starting work in a new agent session:
  1. Run: git checkout develop && git pull
  2. Run: git checkout -b milestone/M{number}-{short-name}
  3. Confirm you are on the correct branch: git branch --show-current

AFTER completing work in an agent session:
  1. Run all tests for the milestone (see Definition of Done in MILESTONES.md)
  2. Commit with conventional commit format: feat(scope): description
  3. Push the milestone branch
  4. Open a PR into develop (or merge directly if working solo)
  5. Update PROGRESS.md (see Step 6.4)

## Never do this

- Never commit directly to master
- Never have two agents working on the same milestone branch simultaneously
- Never merge a milestone branch into develop without running its tests first
- Never start a new milestone branch from an uncommitted develop branch

## Commit message format (Conventional Commits)

feat(contracts): add LoanContract state machine
fix(api): correct loan funding validation
docs(readme): update quick start instructions
test(contracts): add reentrancy guard test cases
chore(deps): bump ethers to 6.13.2

Format: <type>(<scope>): <description>
Types: feat, fix, docs, test, chore, refactor
