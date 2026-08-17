# Forge build report

Build completed 17 August 2026 on Claude Code 2.1.233, model Fable 5, effort
xhigh. One plan approved at the gate; zero questions after it.

## File map

    CLAUDE.md                       identity, seven rules, compact policy
    START_HERE.html                 onboarding, offline, phone-readable
    BUILD_REPORT.md                 this file
    PROMPT.md                       the build prompt that produced this
    README.md                       scaffold overview
    .claude/settings.json           nine hook registrations, base permissions
    .claude/commands/forge.md       the pipeline, intake to ship
    .claude/agents/                 router, scout, designer, architect,
                                    builder, verifier, finisher
    .claude/skills/                 standards, design, workflows,
                                    stack-picker, ship, launch-kit, compliance
    .claude/workflows/              persona-panel, verify-fanout,
                                    design-tournament, defect-sweep
    scripts/                        guard, checks, runlog, dod-gate,
                                    checkpoint, rehydrate, snapshot, notify,
                                    evidence, selftest
    sandbox/                        gitignored smoke-test project, parked at
                                    its greenlight

Instruction text (CLAUDE.md + forge.md + seven agents): 359 lines of the 900
budget.

## Keep, port, retire: the ancestor audit

Ancestor: `lbtbly/agentic-harness-template-plugin` (5 plugins, 26 ADRs, 47
tests), a team-scale nightly orchestrator. Forge is a single-operator product
harness.

| Component | Verdict | Reason |
|---|---|---|
| goals skill, verify-goals.sh, goal ledger | Retire | native /goal evaluates a condition after every turn; the hand-rolled predicate runner is dead weight |
| run-to-done.sh, run-with-limits.sh, local-run.sh, bin/watch, kickoff and run skills | Retire | dynamic workflows plus the /workflows view replace hand-rolled orchestration loops |
| nightly-orchestrator.js, fix-ci.js, dod-verify.js | Retire | the loop and verify concepts survive in defect-sweep.js and verify-fanout.js; the rest is board-era scope |
| handoff-reminder.sh Stop hook, handoff skill | Retire | dod-gate.sh plus the native Stop block cap do this; RESUME.md replaces the ritual |
| inject-session, session-end, precompact-save-state hooks | Retire | rehydrate.sh, checkpoint.sh, snapshot.sh cover the same lifecycle |
| board adapters (Jira, Linear, Notion), trust ledger, journal-export, ingest-findings, compost, ci plugin | Retire | team-scale board machinery, out of scope for one operator |
| devcontainer and egress templates | Retire | native sandboxing covers isolation |
| secret-guard and protect-paths hook ideas | Keep | guard.sh's five-rule denylist embodies them; the denylist stays five |
| workflow API usage (meta literal, agent, parallel, pipeline, thunks, schema) | Keep | confirmed the syntax the four rewrites use; matches current docs |
| planner's machine-checkable DoD contract | Keep | lives in the architect's rubric rules |
| ADR-0016 decorrelated judge panel | Ported | design-tournament judges rotate distinct lenses |
| docs-writer anti-AI-tell writing rules | Ported | condensed into the standards skill copy bar |
| "adjectives are not verifiable" | Ported | sharpened line in the architect's rubric rules |
| "guessing costs a night" escalation discipline | Ported | verifier: an unreproducible defect is reported, never dropped or guessed at |
| naming conventions (verb-first kebab hooks, negative mandate last) | Ported | scaffold aligned while editing |
| advisory versus enforcement hook split | Keep | guard and dod-gate block, everything else exits 0 |

## Drift table

Every scaffold file, the doc it was checked against, and the change.

| File | Doc checked | Change |
|---|---|---|
| .claude/settings.json | hooks reference | `Edit\|Write\|MultiEdit` to `Edit\|Write` (MultiEdit no longer a tool); commands to the documented `"${CLAUDE_PROJECT_DIR}/..."` placeholder form; Notification matcher `permission_prompt\|idle_prompt` added; StopFailure matcher verified valid as written |
| .claude/commands/forge.md | skills and commands reference, /goal reference | commands merged into skills, description and argument-hint remain valid; ARM rewritten (only the user can run /goal); /goal line recorded in PLAN.md; BRIEF.md format made explicit; intake hard stop; GREENLIGHT.md at the gate; headless resume bounds; intake question 2 gains market and jurisdiction |
| .claude/agents/router.md | sub-agents reference | clean: all frontmatter fields valid as spelled |
| .claude/agents/scout.md | sub-agents reference | frontmatter clean; brief format gains obligations confirmation, primary sources first |
| .claude/agents/designer.md | sub-agents reference, Claude Design help center | clean: mcpServers list form valid, server name matches |
| .claude/agents/architect.md | sub-agents reference | frontmatter clean; skills gains compliance; rubric rules gain the compliance-trigger line and the adjectives-are-not-verifiable line |
| .claude/agents/builder.md | sub-agents reference | clean: permissionMode acceptEdits valid |
| .claude/agents/verifier.md | sub-agents reference | frontmatter clean; gains the unreproducible-defect line |
| .claude/agents/finisher.md | sub-agents reference | clean |
| .claude/skills/standards/SKILL.md | skills reference, best practices | frontmatter clean; gains the machine-tell copy bar; the three personal slots stay empty, they are the operator's |
| .claude/skills/design/SKILL.md | Claude Design help center | clean: mcp add command, /design-login, /design-sync, comment links, handoff bundle, inline-comment caveat all match the current article |
| .claude/skills/workflows/SKILL.md | workflows reference, sub-agents reference | "subagents cannot spawn subagents" corrected (spawn depth exists now); the fan-out-belongs-to-the-lead rule kept with the true rationale (no seat carries the Agent tool); ultracode and save-for-reuse wording aligned to current semantics; six-pattern mapping verified against the documented shapes |
| .claude/skills/stack-picker/SKILL.md | best practices | clean |
| .claude/skills/ship/SKILL.md | Vercel CLI reference, EAS docs | TODO completed: `vercel deploy --prod` with stdout-is-URL capture, rollback and promote pair, `eas build --profile production`, `eas submit` and `--auto-submit`, ASC API key credentials, TestFlight processing window |
| .claude/skills/launch-kit/SKILL.md | best practices | clean |
| .claude/skills/compliance/SKILL.md | skills reference | frontmatter valid; content untouched (operator-authored); wired into architect, scout, and intake |
| .claude/workflows/persona-panel.js | workflows reference | rewritten from pseudocode: meta literal, personas via schema, parallel interviewer thunks, synthesis agent writes the Panel section |
| .claude/workflows/verify-fanout.js | workflows reference | rewritten: unchecked lines via schema, pipeline one verifier per line, ruling computed in script at 100 percent only, RUNLOG append |
| .claude/workflows/design-tournament.js | workflows reference | rewritten: five angles in parallel, filter to three, pairwise judging with rotating lenses and byes, winner to DESIGN.md |
| .claude/workflows/defect-sweep.js | workflows reference | rewritten: areas mapped, sweep rounds with script-side dedupe, exit only on a dry sweep, 8-round hard ceiling, RUNLOG append |
| scripts/guard.sh | hooks reference | clean: tool_input.command field confirmed, five rules untouched |
| scripts/checks.sh | hooks reference | clean: PostToolUse exit-2 shows stderr to the model, confirmed |
| scripts/runlog.sh | hooks reference | clean: agent_type and agent_id are the current SubagentStop fields |
| scripts/dod-gate.sh | hooks reference | shell bug fixed: `grep -c \|\| echo 0` corrupted the count at zero unchecked; Stop exit-2 semantics and the 8-block override valve confirmed |
| scripts/checkpoint.sh | hooks reference | field names fixed: session_end_reason (SessionEnd) and error_type (StopFailure), hook_event_name fallback kept |
| scripts/rehydrate.sh | hooks reference | same grep -c fix; gains the arming reminder, both states labelled (awaiting greenlight, gate active) |
| scripts/snapshot.sh | hooks reference | clean |
| scripts/notify.sh | hooks reference | clean; scoped by the new Notification matcher instead |
| scripts/evidence.sh | project rule 5 | `mkdir -p .forge` replaced with the no-op guard; it no longer creates state outside a forge project |
| scripts/selftest.sh | new | the regression harness, see below |
| CLAUDE.md | best practices | rule 7 added: the greenlight is never automated |
| README.md | best practices | clean |

## The nine hooks, one line each

| Registration | Enforces |
|---|---|
| PreToolUse (Bash) guard.sh | five denylist rules: no force-push to main, no deleting main, no destructive deletes outside the project, no reading or moving secret files, no touching credentials; exit 2 blocks |
| PostToolUse (Edit\|Write) checks.sh | typecheck and lint after every edit; failures land in front of the model |
| SubagentStop runlog.sh | one append-only line per seat stop in RUNLOG.md, the run's black box |
| Stop dod-gate.sh | while .forge/ARMED exists, the session cannot end with unchecked rubric lines; the platform's 8-block override is the valve |
| StopFailure (rate_limit\|overloaded) checkpoint.sh | stamps RESUME.md the moment a limit kills a turn |
| SessionStart rehydrate.sh | injects RESUME, the unchecked rubric, the last RUNLOG lines, and the arming reminder, so no session starts cold |
| PreCompact snapshot.sh | copies the state files before summarization eats detail |
| SessionEnd checkpoint.sh | stamps RESUME.md on every exit |
| Notification (permission_prompt\|idle_prompt) notify.sh | desktop ping when the run needs eyes |

## Arming /goal manually

When the /forge greenlight is skipped or a fresh session resumes an armed
run, paste exactly:

/goal Every line of .forge/DOD.md checked, with evidence recorded in .forge/EVIDENCE.md, and a PASS verdict from the verifier agent.

The same line is the last line of every .forge/PLAN.md, and rehydrate.sh
prints it at session start until the goal is armed.

## selftest.sh

`scripts/selftest.sh` is the one-command drift check. It verifies: all nine
scripts are executable and no-op outside a forge project (exit 0, zero files
created); correct behavior against a fixture .forge/ (runlog fields,
checkpoint fields, snapshot copies, evidence append, guard blocking and
allowing); dod-gate blocking with unchecked lines and releasing at zero (the
grep -c regression); rehydrate's two arming labels; all four workflows
parsing under the runtime grammar; settings.json and every agent frontmatter
parsing. Exit non-zero on any failure. Run it after every Claude Code
update. Current result: all checks passed.

## Smoke test: what each run proved

Three headless runs in ./sandbox (stream-json transcripts in the session
scratchpad). Headless results are partial, not passing.

| Criterion | Proved by |
|---|---|
| /forge appears in the command list, with all four workflows | run 1 init event listed forge, persona-panel, verify-fanout, design-tournament, defect-sweep |
| intake fires, and a declined or empty intake is a hard stop | run 1: headless AskUserQuestion unavailable, BRIEF.md skeleton written, missing answers recorded in RESUME.md, run stopped, nothing assumed, nothing built |
| hooks fire in the sandbox | run 1 and 2: checkpoint stamps in RESUME.md (SessionEnd), router and architect lines in RUNLOG.md (SubagentStop), FORGE STATE block (SessionStart) |
| resume without re-asking; router sizes S; phases 3 and 4 skipped | run 2: --continue picked up at SIZE, router (haiku) returned S, no scout, no designer |
| plan and rubric written; /goal line recorded; GREENLIGHT.md phone-sized; clean stop at the gate | run 2: PLAN.md ends with the /goal line, DOD.md has three sections plus disqualifiers with zero compliance lines (none fired, correctly), GREENLIGHT.md holds all five elements plus the not-a-replacement statement, no site files created |
| rehydrate injects state and the arming reminder; the gate is not re-opened | run 3: FORGE STATE block with "Awaiting greenlight. Nothing armed yet." and the /goal line; the answer quoted RESUME.md and did not approve anything |
| both rehydrate labels, gate blocking and release | scripts/selftest.sh fixtures |

Not proved headless, with the interactive command to prove each yourself:

| Not proved | Why | Prove it with |
|---|---|---|
| interactive intake answering | AskUserQuestion never ran; the hard stop path ran instead | in ./sandbox: `rm -rf .forge`, then `claude`, then `/forge "a one-page site that shows the current moon phase"`, answer the three questions, check `cat .forge/BRIEF.md` |
| the intake-to-BRIEF format contract | run 2's BRIEF.md was seeded by hand in the specified format | same interactive run: confirm intake's own write matches the format in forge.md |
| the notification ping at the gate | headless sessions do not raise desktop notifications | same interactive run, wait at the greenlight for the ping |
| the live /goal loop | /goal is a user command; no user exists in -p | after an interactive greenlight on a real goal, paste the /goal line and watch the evaluator verdicts per turn |

Full interactive sequence: `cd sandbox && rm -rf .forge && claude`, run the
/forge command above, answer intake, stop at the gate without approving,
quit, then `claude --continue` and read the FORGE STATE block.

## Notes for the operator

- The ancestor harness is still installed as user-scope plugins on this
  machine. Its protect-paths hook blocked the approved settings.json edit
  (applied via shell instead, the path its own ADR-0009 documents), and its
  observe hooks wrote stray .orch/, .impeccable/, and docs/SUGGESTIONS.md
  files into this repo and the sandbox during the build. None are committed.
  Now that Forge replaces it, consider uninstalling the ancestor plugins; if
  they stay, expect .orch/ journals in every repo you work in.
- checkpoint.sh's SessionEnd stamps read "(SessionEnd)" on this build: the
  headless exits did not carry session_end_reason, so the fallback fired.
  The field reads are correct per the reference and covered by selftest.
- /tmp/ancestor (the audit clone) was removed after the audit.
