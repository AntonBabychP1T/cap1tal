---
name: auto-work
description: Autonomous work loop — take the next unchecked BACKLOG.md item, drive it through the full OpenSpec cycle to green, commit, archive, then launch the next session. Use when the user asks for autonomous work ("працюй далі", "/auto-work") or when a scheduled task starts an unattended run.
---

# auto-work — autonomous work loop

One invocation = at most ONE OpenSpec change driven to done, then a hand-off to a fresh
session. The CLAUDE.md workflow and hard rules apply in full — this skill only adds the
loop around them. `git push` never happens here; publishing stays with the human.

## 1. Guard against parallel work

1. If session-management tools are available, list sessions
   (`mcp__ccd_session_mgmt__list_sessions`; load via ToolSearch if deferred). Another
   session with `cwd` inside this repo and `isRunning: true` means someone — human or
   agent — is mid-work: stop quietly, do not touch the tree, do not hand off.
2. Lock: `.cache/auto-work.lock`. If it exists and is younger than 4 hours, another auto
   run owns the repo — stop quietly. Treat it as stale only if it is older than 4 hours
   AND step 1 found no running session. To take the lock:
   `date -u +%FT%TZ > .cache/auto-work.lock`. Delete it on every exit path below.

## 2. Orient

`openspec list` + `git status` + read `BACKLOG.md` (repo root). Pick the work item:

- an in-flight change with unfinished tasks, or a finished but unarchived one →
  continue it from wherever it stands;
- otherwise the top unchecked `- [ ]` item in BACKLOG.md — but first check `## Питання`:
  an item marked `[?]` whose question now has an owner's answer beneath it is unblocked —
  apply the answer, remove the `[?]`, and take that item;
- items still marked `[?]` without an answer are skipped;
- nothing workable left → report that the queue is empty or fully blocked, delete the
  lock, stop. Do not hand off.

## 3. Drive one change to done

Exactly the CLAUDE.md workflow, no shortcuts:

1. No change exists yet → `/opsx:propose` from the backlog item, `docs/tech-task.md` and
   `docs/glossary.md`.
2. Run the `spec-reviewer` subagent; fix CRITICAL findings before implementing.
3. `/opsx:apply` task by task; after each task run the relevant tests, then
   `npm run verify` as its own command.
4. All tasks done and verify green → run the `diff-reviewer` subagent; fix CRITICAL
   findings and re-run until PASS.
5. Commit (the commit hook refuses an unverified tree). Never push.
6. `/opsx:archive`.
7. In BACKLOG.md tick the item `- [x]`, append one short line of result to it, commit
   that too.

## 4. Questions to the owner

Ambiguity, a contradiction with `docs/product-vision.md`, or a decision the specs do not
settle (hard rule 8) → ask, never guess. Raise questions at the planning stage (propose /
spec review) whenever possible, before the tree gets dirty.

- Primary: AskUserQuestion. Wait for the answer — the owner replies when they see it —
  then apply it, record the decision in the change's `design.md`, and continue this run.
- Fallback (unattended run where interactive questions do not work): write the question
  under `## Питання` in BACKLOG.md, mark the item `[?]`, bring the tree back to a state
  where `npm run verify` is green (never by weakening or deleting tests), delete the
  lock, and stop WITHOUT handing off. The owner answers inline in BACKLOG.md.

## 5. Hand off to the next session

Only after step 3 fully completed and unchecked items remain:

1. Load the scheduler if deferred:
   ToolSearch `select:mcp__scheduled-tasks__create_scheduled_task`.
2. Create a one-time task — taskId `auto-work-next`, `fireAt` ≈ now + 2 minutes (take
   "now" from `date`), `notifyOnCompletion: false`, prompt:
   "Unattended autonomous run for the cap1tal repo at /Users/antonbabych/dev/cap1tal.
   Invoke the project skill auto-work with the Skill tool and follow it exactly."
   If creation fails because the task already exists, update it
   (`mcp__scheduled-tasks__update_scheduled_task`) with a new `fireAt` and re-enable it.
3. Delete the lock, report what was shipped (with the last lines of the green verify),
   end the turn.

If the scheduler tools are unavailable, continue with the next backlog item in THIS
session instead. Either way the hourly `auto-work` watchdog task is the safety net — a
missed hand-off only delays the next run, it never loses work.

## 6. Absolute limits

- Never `git push`, never force-anything, never touch secrets (hard rule 5; guard-bash
  enforces).
- Never skip, weaken or delete a failing test to get green (hard rule 6).
- Nothing is reported done without quoting the last lines of a green `npm run verify`
  (hard rule 1).
- One change per session run when hand-off works; in-session continuation is only the
  fallback of step 5. Fresh context per change is the point.
- If verify cannot be made green honestly, or the same step fails twice for the same
  reason: record the blocker under `## Питання` in BACKLOG.md, delete the lock, stop
  without handing off.
