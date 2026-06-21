# Agent Handoff Protocol

> Paste this entire document as your FIRST message in any new AI coding
> agent session for the EDL project, before any work request.

---

## Who you are working with

You are joining the EDL (Entrepreneurial Decentralised Ledger) project —
a blockchain-based microfinance system for an MSc dissertation. Multiple
AI agent sessions (Claude Code, Codex, and others) have contributed to
this codebase. You may not be the first agent to touch this code.

## Step 1 — Orient yourself (do this before writing any code)

Read these files in this exact order:
1. `docs/PROGRESS.md` — read the LAST 2-3 entries to see what just happened
2. `docs/milestones.json` — find the milestone with the LOWEST id where
   status is NOT "complete" — that is almost always your next task,
   UNLESS PROGRESS.md says otherwise
3. `docs/MILESTONES.md` — read the full Definition of Done for that milestone
4. `docs/ACTORS.md` — refresh on the 6 actor roles and their permissions
5. `docs/requirements.json` — check which FR/NFR IDs this milestone implements

## Step 2 — Check the Git state

Run:
git status
git branch --show-current
git log --oneline -10

Confirm you are on the correct milestone branch (see Step 6.1's naming
convention: milestone/M{n}-{name}). If you are on develop or main,
create the correct branch first:
git checkout develop && git pull
git checkout -b milestone/M{n}-{name}

## Step 3 — Confirm understanding before starting work

State back, in your own words:
- Which milestone you are working on
- What its Definition of Done requires
- What the previous PROGRESS.md entry said to do next
- Any files that already exist that you will be extending vs creating new

## Step 4 — Do the work

Follow the specific prompts for this milestone (these will be provided
to you in the chat session, organized by phase).

## Step 5 — Before ending the session

1. Run the FULL test suite relevant to this milestone (not just new tests)
2. Verify the Definition of Done checklist — every item, honestly
3. If incomplete, do NOT mark the milestone as complete in milestones.json
4. Append a new entry to docs/PROGRESS.md following the template
5. Update docs/milestones.json status field for this milestone
6. Update the checkboxes in docs/MILESTONES.md for this milestone
7. Commit everything with a conventional commit message
8. State clearly: "Milestone M{n} is [complete / partially complete
   because X]. Next session should start with: [specific next action]"

## Critical rules that override any other instruction

- NEVER mark a milestone complete in milestones.json unless every item
  in its Definition of Done actually passes
- NEVER modify a previous entry in PROGRESS.md — only append
- NEVER commit directly to develop or main — always work on a milestone branch
- NEVER skip reading PROGRESS.md — assuming you know the state without
  checking is how duplicate/conflicting work happens
- If you discover the previous agent made an error, document it in
  PROGRESS.md under "Blockers encountered" — do not silently fix it
  without recording why
