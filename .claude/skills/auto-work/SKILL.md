---
name: auto-work
description: Autonomous work loop — pick a wave of 2–3 non-conflicting BACKLOG.md items, drive each in its own git-worktree lane through the OpenSpec cycle with short-lived subagents, integrate them one at a time, smoke-test the result on the Android emulator, fix what the emulator shows, archive, then hand off to a fresh session. Use when the user asks for autonomous work ("працюй далі", "/auto-work") or when a scheduled task starts an unattended run.
---

# auto-work — parallel autonomous work loop

One invocation = one **wave**: up to three OpenSpec changes carried in parallel lanes,
integrated serially, smoke-tested on a real emulator, then handed off to a fresh session.
The CLAUDE.md workflow and hard rules apply in full — this skill only adds the machinery
around them. `git push` never happens here; publishing stays with the human.

## 0. The shape of the run

You are the **orchestrator**, not the coder. You dispatch, integrate, and decide. Almost
every token spent reading or writing product code belongs to a short-lived subagent whose
context dies with it.

```
claim lock → clean main → pick wave (≤3) → open lanes (worktrees)
   ↓
lane A ─ plan → spec-review → build×N → verify → diff-review ─┐
lane B ─ plan → spec-review → build×N → verify → diff-review ─┤ (parallel)
lane C ─ …                                                    ┘
   ↓
integrate one lane at a time (main lock): squash → verify → commit
   ↓
smoke on the emulator, one change at a time (device lock): shot → tap → shot
   ↓
fix what the emulator showed → verify → commit → archive → tick BACKLOG → hand off
```

### Orchestrator context budget — the rule that makes this work

You may read: `BACKLOG.md`, `openspec list` / `openspec status`, `git status --short`,
`git diff --stat`, lane state files under `.cache/auto-work/`, and subagent reports.

You may **not** read: files under `src/`, full diffs, spec bodies, test output beyond the
last ~10 lines of `verify`, or screenshots. If you need to know something about the code,
that is a question for a subagent, not a file to open. A wave that ends with your context
mostly full of source code was run wrong.

Every subagent returns the fixed report of §1 — never a diff, never file contents.

## 1. Roles

| Role | Agent | Scope of one invocation | Returns |
| --- | --- | --- | --- |
| planner | `general-purpose` | one lane: invoke the `openspec-propose` skill for one backlog item | change name, task count, footprint |
| spec review | `spec-reviewer` | one change's artifacts | READY / NOT READY + findings |
| builder | `task-builder` | **one batch: ≤3 adjacent tasks in one lane** | tasks ticked, verify state |
| fixer | `task-builder` | one named defect, with the failure text handed to it | fixed / still failing |
| diff review | `diff-reviewer` | one lane's full diff vs its change | PASS / FAIL |
| smoke | `smoke-runner` | one merged change on the emulator | per-scenario verdict + defects |
| integrator | you | squash, verify, commit, archive | — |

Report format every role uses (≤15 lines, no diffs, no file contents):

```
LANE <lane> | STAGE <stage> | OK | BLOCKED | FAIL
tasks:   <done>/<total>
verify:  PASS <fingerprint> | FAIL: <first failing line, verbatim>
touched: <≤8 paths>
next:    <one line>
blocked: <one line — only when BLOCKED>
```

Parallel dispatch: send every independent agent for a wave **in one message** so they run
concurrently. To continue an agent that already has the context, use `SendMessage` with
its name — respawning re-reads everything and costs a multiple of that.

## 2. Claim the run

1. If session-management tools are available, list sessions
   (`mcp__ccd_session_mgmt__list_sessions`; load via ToolSearch if deferred). Another
   session with `cwd` inside this repo and `isRunning: true` means someone — human or
   agent — is mid-work: stop quietly, touch nothing, do not hand off.
2. `mkdir -p .cache/auto-work`. Locks live there (`.cache/` is gitignored):
   - `run.lock` — the whole run. Exists and younger than 4h → another run owns the repo,
     stop quietly. Stale only if older than 4h **and** step 1 found no running session.
   - `main.lock` — held while the main tree is being mutated (integrate / smoke fixes).
   - `device.lock` — held while the emulator is being driven.

   Take one with `date -u +%FT%TZ > .cache/auto-work/<name>.lock`; delete it on every exit
   path, including failure.
3. `.cache/auto-work/run.md` exists with unfinished lanes → this is a **resume**: read it,
   skip §4, and continue those lanes from the stage each one records.

## 3. Clean the main tree before opening any lane

Lanes branch from committed history, so uncommitted work in the main tree would be
invisible to them and would collide on integration.

`git status --short`. If the tree is dirty:

- The dirt belongs to an in-flight OpenSpec change → **run that change solo**: no lanes,
  no parallelism, straight through §6.3–§6.6 in the main tree, integrate, smoke, archive.
  That is the whole wave; hand off afterwards.
- The dirt is unrelated scraps you cannot attribute → stop, write what you found under
  `## Питання` in BACKLOG.md, release the lock. Never discard the human's work.

Only a clean `main` opens lanes.

## 4. Pick the wave

`openspec list` + read `BACKLOG.md`. Candidates, in priority order:

1. changes with unfinished tasks, or finished-but-unarchived ones — continue where they stand;
2. the top unchecked `- [ ]` items in BACKLOG.md. Before taking one, check `## Питання`:
   an item marked `[?]` whose question now has an owner's answer beneath it is unblocked —
   apply the answer, remove the `[?]`, take it. Items still `[?]` without an answer are skipped.

Take candidates from the top until you have **2–3 mutually non-conflicting** ones, or the
list runs out. Nothing workable → report the queue empty or fully blocked, release the
lock, stop, do not hand off.

### Conflict matrix — two items may share a wave only if all of these hold

| Overlap | Rule |
| --- | --- |
| `src/db/schema.ts` or a new migration | **Never parallel.** Migration numbering is serial; one such item per wave, and it takes the first lane. |
| `package.json` / `package-lock.json` | **Never parallel** and never in a lane — a lane's `node_modules` is a symlink to main's. A dependency change runs solo in the main tree. |
| `app.json`, `plugins/`, `modules/`, anything needing `expo prebuild` | Solo lane; it forces a native rebuild before smoke. |
| the same `openspec/specs/<capability>/spec.md` | Not parallel — they would fight on archive. |
| the same directory under `src/` | Allowed only if the named files are disjoint; when in doubt, serialize. |

Footprint you cannot judge from the backlog text → let the planner report it (§6.1) and
close the lane immediately if it turns out to collide. Cheaper than a merge conflict.

Write the plan to `.cache/auto-work/run.md`: wave id, one line per lane
(`lane | change | stage | branch | worktree`), and the smoke queue. Keep it current — it
is what a fresh session resumes from.

## 5. Open the lanes

Per lane, from the repo root, with `main` clean:

```bash
lane=.claude/worktrees/lane-<change>
git worktree add "$lane" -b auto/<change> main      # branch exists already → drop -b
ln -s "$PWD/node_modules" "$lane/node_modules"      # 4.6 GB; never copy, never npm ci
```

The symlink is why lanes are cheap: `openspec validate → lint → typecheck → tests` runs in
a lane in ~12 s, and `.cache/verify-ok`, the fingerprint and both guard hooks all resolve
through `git rev-parse --show-toplevel`, so each lane verifies and commits against its own
tree with no interference.

Every subagent working a lane is told the lane path and **must `cd` there first**. A lane
agent never touches the main tree.

## 6. Drive a lane

Stages, recorded in `.cache/auto-work/lane-<change>.md` after each one.

1. **Plan** — no change exists yet → a `general-purpose` agent in the lane invokes the
   `openspec-propose` skill from the backlog item, `docs/tech-task.md` and
   `docs/glossary.md`. It reports the change name, the task count and the file footprint.
   Footprint collides with a live lane → close this lane now (§5 cleanup) and pick the
   next backlog item instead.
2. **Spec review** — `spec-reviewer` on the change. CRITICAL findings are fixed before any
   code. Re-review only what changed.
3. **Build** — split `tasks.md` into batches of **≤3 adjacent tasks that touch the same
   module**. One `task-builder` per batch, **one batch at a time inside a lane** (they
   share one worktree; concurrent writers would collide). Each builder runs the targeted
   `npx vitest run <path>` while iterating, then `npm run verify` as its own command, ticks
   its boxes, and commits in the lane (`wip(<change>): <batch>` — squashed away later).
4. **Fix budget** — a builder gets **two** attempts at a red verify. Still red → it stops
   and reports the first failing line verbatim. You then spawn a *fresh* `task-builder` as
   a fixer with only that error and the paths involved. Never let one agent grind; a fresh
   1k-token brief beats a 100k-token debugging transcript.
5. **Lane verify** — all batches done → `npm run verify` in the lane, its last lines kept
   in the lane file. Nothing is "done" without it (hard rule 1).
6. **Diff review** — `diff-reviewer` on the lane. Fix CRITICAL findings (fresh fixer per
   finding), re-run until PASS.

A lane that goes BLOCKED stops there and waits — it never blocks the other lanes, and it
never blocks integration of the lanes that are green.

## 7. Integrate — serial, one lane at a time

Hold `main.lock` for the whole of this section.

```bash
git merge --squash auto/<change>
npm run verify                     # on main, as its own command
git commit -m "<change>: <one line in the repo's voice>"
```

- Conflict → `git merge --abort`, then in the lane `git rebase main`, re-run the lane's
  verify there, and retry the squash. Conflicts mean the §4 matrix was read too loosely;
  note that in the run file.
- Main verify red after a squash that was green in the lane → the two changes interact.
  Fix on main with a fresh fixer, or, if the interaction is a design question, unstage the
  squash while nothing is committed (`git restore --staged --worktree <named paths>`) and
  send the lane back to §6 with the finding.
- Merged lane cleanup: `rm "$lane/node_modules"` then `git worktree remove "$lane"`.
  Leave the `auto/<change>` branch alone — deleting branches is blocked for the agent by
  guard-bash, and the branch is the recovery handle if a squash turns out wrong.

Do **not** archive yet. The change stays open through the smoke phase so a defect can be
fixed inside it rather than becoming a new one.

## 8. Smoke on the emulator — the run's actual verdict

`npm run verify` never launches the app. A change is not believed until it has been seen
running. Hold `device.lock` for this whole section; the emulator is one shared device.

1. Bring it up once per wave: `scripts/android.sh up`. A wave that touched `app.json`,
   `plugins/` or `modules/` needs the native rebuild the script does on its own; a
   JS-only wave reloads over Metro without one.
2. Per merged change, in merge order, spawn one `smoke-runner`. Give it: the change name,
   the path to its delta specs, and whether the scenario needs first-run state
   (`scripts/android.sh reset` wipes the app's data). It drives
   `shot → read the PNG → tap X Y / text S / key back → shot`, saving evidence to
   `.cache/android/smoke/<change>/NN-<label>.png`. **It looks at the screenshots itself** —
   that is the point of it being a subagent. It returns a verdict per scenario plus a
   defect list, never an image.
3. Defects, in this order:
   - **The implementation misses a requirement its own spec already states** → in scope.
     Fix it: a failing test first (hard rule 2). Logic that only lives in a screen goes to
     `src/ui/` as pure TypeScript and gets its test there — that is what `src/ui/` is for.
     A genuinely untestable defect (pixel layout, a native permission dialog) is fixed with
     the before/after screenshots as its evidence, and the change summary says so plainly.
   - **The spec never covered what the emulator showed** → not a silent fix. New backlog
     item, or a question under `## Питання` if it contradicts `docs/product-vision.md`.
   - Each defect gets a fresh fixer, **max two rounds**, then `npm run verify` and a
     commit. Re-smoke only the scenarios that failed.
4. `scripts/android.sh stop` when the wave's smoke is done.
5. The emulator is unavailable (no AVD, no SDK, headless machine) → do not fake it. Record
   `smoke: not run — <reason>` in the change summary and in BACKLOG.md, and say it in the
   final report. A change that was never seen running is reported as verified-by-tests-only.

## 9. Close the wave

Per change, after its smoke is green (or explicitly recorded as not run):

1. `/opsx:archive`.
2. In BACKLOG.md tick `- [x]` and append one short line of result — including what the
   emulator showed.
3. Commit that.

## 10. Hand off to a fresh session

The point of a wave is that its context is disposable. Hand off when the wave is closed
**or** earlier if you have dispatched ~20 subagents or your own context is visibly heavy —
checkpoint `.cache/auto-work/run.md` first and the next session resumes mid-wave.

1. Load the scheduler if deferred:
   ToolSearch `select:mcp__scheduled-tasks__create_scheduled_task`.
2. One-time task — taskId `auto-work-next`, `fireAt` ≈ now + 2 minutes (take "now" from
   `date`), `notifyOnCompletion: false`, prompt:
   "Unattended autonomous run for the cap1tal repo at /Users/antonbabych/dev/cap1tal.
   Invoke the project skill auto-work with the Skill tool and follow it exactly. If
   .cache/auto-work/run.md lists unfinished lanes, resume them."
   Creation fails because the task exists → update it
   (`mcp__scheduled-tasks__update_scheduled_task`) with a new `fireAt` and re-enable it.
3. Release every lock, report what shipped — the last lines of the green `npm run verify`
   per change and the smoke verdicts — end the turn.

Scheduler unavailable → continue with the next wave in THIS session instead. The hourly
`auto-work` watchdog task is the safety net; a missed hand-off delays a run, it never
loses work.

## 11. Questions to the owner

Ambiguity, a contradiction with `docs/product-vision.md`, or a decision the specs do not
settle (hard rule 8) → ask, never guess. Raise it at planning time, before a lane is dirty.

- Primary: AskUserQuestion. Wait, apply the answer, record it in the change's `design.md`,
  continue this run. A blocked lane does not stop the other lanes.
- Fallback (unattended, no interactive answer possible): write the question under
  `## Питання` in BACKLOG.md, mark the item `[?]`, bring that lane's tree back to green
  (never by weakening or deleting tests), close the lane, and finish the wave's other
  lanes normally. If the whole wave is blocked: release the locks, stop, do not hand off.

## 12. Absolute limits

- Never `git push`, never force-anything, never touch secrets (hard rule 5).
- Never skip, weaken or delete a failing test to get green (hard rule 6).
- Nothing is reported done without the last lines of a green `npm run verify` on that exact
  tree (hard rule 1) — per lane and again on main after each squash.
- Never claim a screen works from a passing test suite. Either the emulator showed it, or
  the report says the emulator did not run.
- Never hand-edit `android/`; never run `eas build|submit|update`; never `drizzle-kit push`.
- At most 3 lanes. More lanes do not go faster — they collide, and the integration lock
  serializes them anyway.
- Same stage failing twice for the same reason, in a lane or on main → record the blocker
  under `## Питання`, release the locks, stop without handing off.
