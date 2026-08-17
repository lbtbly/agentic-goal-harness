# Forge · build prompt for Claude Code · v1.2

## Before you paste

1. Unzip forge-starter.zip into an empty repo, then `git init && git add -A && git commit -m "forge scaffold"`
2. Check `gh auth status` passes. The audit step reads your private ancestor repo.
3. The claude-design MCP server is already connected on this machine (user scope, /design-login done). Verify with `/mcp` that it is listed.
4. Pick the session profile. Standard day: `/model claude-opus-5`. Flagship day, meaning a fresh weekly window and a goal worth it: `/model claude-fable-5`. The judgment seats (designer, architect, verifier) inherit the session model.
5. Set `/effort xhigh`. Do not use ultracode for this build; scaffolding verification is sequential work.
6. Paste everything between the PROMPT markers as one message. It opens in plan mode by design. You approve once, then it runs to the end.

Expected: one plan to approve, then roughly 20 to 40 minutes of autonomous work.

---

## PROMPT START

You are completing Forge, my personal goal harness for Claude Code. The scaffold is already in this repo: CLAUDE.md, nine hooks in .claude/settings.json, the /forge command, seven agents, six skills, four workflow templates, and nine scripts. Read all of it first. Then enter plan mode and present your plan. I approve it once. After approval, you work to completion without asking me anything.

## What Forge is

One custom command, `/forge "<one-line goal>"`, that carries a goal from a sentence to a shipped product. The flow: a two-minute intake, an automatic sizing step, research, design with synthetic user interviews, planning, one greenlight from me, then an autonomous build that ends only when a per-goal Definition of Done passes adversarial verification with evidence. Market ready is the bar: not a proof of concept, not a minimum viable anything. Deployed is the floor, not the finish.

## Non-negotiables

1. **Docs beat memory, and docs beat this scaffold.** Where a current official page contradicts a scaffold file, the doc wins and you fix the file.
2. **Simple stays simple.** A goal sized S never spawns parallel agents, never opens a worktree, never faces a review panel, never convenes the designer.
3. **Exactly one human gate: plan approval.** No permission prompts mid-run, in this build or in any future /forge run.
4. **Hooks enforce, they never interrogate.** The guard denylist stays five rules; do not grow it.
5. **State is sacred.** The .forge/ layout, the append-only RUNLOG, and the RESUME pointer are load-bearing; keep every script's no-op guard for projects without .forge/.
6. **Writing style everywhere:** direct, no em dashes, no hollow filler, no rocket emoji.
7. **The bar never moves.** Never weaken a rubric rule, a never-rule in an agent, or the escalation ladder while editing.

## Step zero: audit the ancestor

Clone and read my previous harness: `gh repo clone lbtbly/agentic-harness-template-plugin /tmp/ancestor`. It is private; authentication is already set on this machine. If the clone fails, note it in the plan and continue without it. Do not stop to ask.

Inventory its commands, agents, hooks, skills, and docs. Produce a keep, port, retire table with a one-line reason per row. Retire by default anything the platform now does natively: hand-rolled goal tracking (the native /goal command and its per-turn evaluator), orchestration loops (dynamic workflows), and end-of-turn enforcement (Stop hooks). Port naming conventions and any skill prose that still earns its place into the scaffold's files. The table ships inside the plan at the greenlight.

## Step one: verify the scaffold against current docs

For every file in .claude/ and scripts/, check the current official reference and fix drift: code.claude.com/docs/en/best-practices, /sub-agents, /hooks, /slash-commands, /skills, /workflows, plus the Claude Design MCP documentation. Known intentional gaps you must close:

- The four files in .claude/workflows/ are pseudocode with the pattern in comments. Rewrite all four in the current dynamic workflow syntax so they load: persona-panel (fan-out-and-synthesize), verify-fanout (adversarial verification), design-tournament (generate-and-filter, then tournament), defect-sweep (loop until done).
- Hook payload field names inside runlog.sh and checkpoint.sh are best-effort. Match them to the current hooks reference (SubagentStop, SessionEnd, StopFailure input fields).
- Agent frontmatter uses tools, model, effort, skills, mcpServers, permissionMode, maxTurns. Confirm every field name and value against the sub-agents reference; fix anything renamed or invalid.
- settings.json matchers (Bash; Edit|Write|MultiEdit; rate_limit|overloaded on StopFailure) must match current matcher semantics.

Produce a drift table: file, doc checked, change made or clean.

## Step two: wire and harden

- Confirm the claude-design MCP server is reachable and referenced correctly from the designer agent (mcpServers) and the design skill runbook.
- Make every script executable, and idempotent outside a forge project: each must no-op when .forge/ is absent. Test this.
- Complete the TODO in the ship skill against current Vercel and EAS CLI behavior.

## The specification is the scaffold

The pipeline (intake, size, scout, the lead-run persona panel, design, plan, greenlight, arming the native /goal, build, verify with the escalation ladder, ship) lives in .claude/commands/forge.md. Agent mandates and never-rules live in .claude/agents/. Rubric rules live inside the architect. Treat these files as the specification: improve wording only where a doc contradicts them, never weaken a rule. Remember the platform constraint that shaped them: subagents cannot spawn subagents, so every fan-out belongs to the lead.

## Step three: smoke test

Create ./sandbox, run `/forge "a one-page site that shows the current moon phase"`. Confirm the flow: intake, sizing to S, a plan with a rubric, a clean stop at the greenlight. Do not build the site. Then quit the session, reopen with `claude --continue`, and confirm rehydrate.sh loads the state into context. The demo ends at the gate, twice.

## Definition of done for this build

- The drift table is complete: every scaffold file checked against a current doc.
- All four workflow files are rewritten in real syntax and load without error.
- The workflows skill correctly maps all six official patterns (classify-and-act, fan-out-and-synthesize, adversarial verification, generate-and-filter, tournament, loop until done) to the phases that use them, checked against the dynamic workflows documentation.
- /forge shows in the command list; the smoke test and the resume test pass.
- Total instruction text across CLAUDE.md, the command, and all agents stays under 900 lines. Over budget means cut, not compress into unreadable prose.
- BUILD_REPORT.md at repo root: the file map, the keep, port, retire table from step zero, the drift table from step one, one line per hook on what it enforces, and the exact sentence to arm /goal manually when I skip the command.

## PROMPT END

---

## After the build

1. Fill the three slots in .claude/skills/standards/SKILL.md. That file is your taste, in writing. It feeds every future rubric.
2. Once a project holds real components, run `/design-sync` so Claude Design builds with your actual tokens.
3. First real run: `/forge` with the Tomb Raider collectors app. Sizing should come back M, so the lead runs the full persona panel before the designer opens Claude Design. Read the rubric and the screens hard at the greenlight.
4. Save ultracode sessions for L goals and Fable 5 flagship sessions for the goals that deserve them and the weeks that can afford them.
