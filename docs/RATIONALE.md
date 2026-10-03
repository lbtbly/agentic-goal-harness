# Forge rationale

This file is the human-facing record of the evidence behind Forge's rules: the measured incidents, numbers and studies that v1 prompts carried inline.
It describes the harness as of v1 (snapshot 2026-10-03). Run names (run one, run two, run three, vitrine, tomb-raider) are kept as the v1 sources wrote them.
Agent prompts no longer carry this material. They keep the instruction and nothing else.
A rule change should cite the matching entry here, or update it in the same change.

v2 (3 October 2026) changed the mechanisms some entries describe, not the evidence: attempt.sh became attempt.mjs and the ladder runs in .claude/workflows/build.js; models are pinned per seat and never passed on a dispatch; /goal left arming; checks.sh, verify-fanout.js and defect-sweep.js were retired. See BUILD_REPORT-2026-10.md.

## 1. The lead and context cost

**The lead holds only RESUME.md, the current slice and the rubric ids in flight, and every seat returns a pointer to its work, not the work.**
The lead is the most expensive seat in the run and the only one with no model pin, no effort setting and no turn cap. Across three measured runs it was 30.8, 37.4 and 37.7 per cent of total cost, and its cache reads reached 1.46 billion tokens in one session. Seven seats were tuned and the lead was not, because nobody counted it. A seat that returns its work instead of a pointer to its work has moved its context into the lead's, where it is re-read on every turn for the rest of the run. Every phase result the lead needs is a file it re-reads on demand, not a payload it carries from the phase that produced it. The cost report counts the lead for the same reason: it is the largest single cost centre in every measured run, and a report that omits it optimises seven seats and misses the eighth. START_HERE states the same measurement as "33 to 58 per cent of every measured run" and adds one session that cost $1,110 across 3,540 round-trips at 998,263 peak context.
(v1 forge.md, What the lead carries; v1 scripts/cost.mjs header; v1 START_HERE.html, What changed)

**Optimise context length inside a dispatch, not prose length or seat count.**
Three runs were measured out of their own transcripts. Cache reads are 62 to 66 per cent of a run and output is 10 to 13, so trimming prose is a rounding error. When cache reads dominate, the lever is context length inside a dispatch. Spend is concentrated: run two's top fifth of dispatches carried 44.4 per cent of subagent spend, so the expensive dispatches are the lever and the median dispatch is not. The same write-up says each stage's premise was tested before it was built and two of the three tested failed; the two lost claims are in Design (flat hierarchy) and Building (no seat can see rendered UI).
(v1 START_HERE.html, What changed; v1 scripts/cost.mjs)

**Cost is read from the transcripts Claude Code already writes, not from OpenTelemetry.**
Every forge seat is user-defined, and claude_code.cost.usage collapses all of them into agent.name="custom", so a dashboard shows one undifferentiated bucket. The per-dispatch files carry the real thing: agent-*.jsonl holds message.usage per round-trip and the sibling .meta.json holds agentType. That makes the tally retroactive to every run already on disk, including runs that finished months ago. Dollars are list-price reconstructions from recorded token counts (rates of 9 September 2026), not amounts billed, which is the number that makes two runs comparable. A 1h cache write costs 2x and cannot be told from a 5-minute write in the transcript, so a run on the 1h TTL reads slightly cheap.
(v1 scripts/cost.mjs header; v1 README.md)

## 2. Model pins and escalation

**The escalation ladder is counted on disk by scripts/attempt.sh, because a ladder with no counter is a sentence.**
Nothing on disk counted fails per slice. DEFECTS.md is a flat append with no aggregation and deliberately no clear, RESUME.md carries the phase and not the tally, and the compact policy preserves the goal, the slice and the unchecked lines but never the fail count. So the ladder reset itself at every compaction, which on a long run means it effectively never fired. The rung is computed from the ledger rather than remembered, so it survives compaction and reads the same to whoever asks.
(v1 forge.md §9; v1 scripts/attempt.sh header; v1 scripts/selftest.sh §3e)

**First FAIL on a slice: re-run the failing check with the evidence attached. Do not escalate and do not rebuild.**
Audited verifier false negatives run about 24 per cent against false positives of 8.5, so a red verdict is more often wrong than a green one, and escalating on it takes the expensive branch on bad information a quarter of the time.
(v1 forge.md §9; v1 scripts/attempt.sh header and rung text; v1 START_HERE.html)

**Second FAIL: re-dispatch the builder one tier up by passing model on the dispatch itself.**
The seat pins model: sonnet, so raising it means passing model on the dispatch, which takes precedence over the frontmatter. Naming the rung without naming the mechanism is how a ladder becomes a sentence. On a UI or craft line, re-specify the brief before raising the model: on identical prompts the gap between a vague and a specific brief measured wider than the gap between two models.
(v1 forge.md §9; v1 scripts/attempt.sh)

**Third FAIL: git reset --hard to the pre-slice commit, re-plan with a failure memo, then attempt.sh reset.**
On 82 engineering tasks rewind-with-memory beat continue-from-failure 87.8 to 62.2 per cent, and the ablation is the load-bearing part: resetting the conversation while leaving a half-broken tree was the worst arm of the three. That means the pre-slice commit must exist, so the lead commits before dispatching a builder, not only after a green verdict. The bar never moves; the resources do.
(v1 forge.md §9; v1 scripts/attempt.sh)

**Where the account allows it, pin the verifier to a different model family from the builder.**
Top judges disagree on about four fifths of their errors, so family diversity buys coverage for a config change and no extra dispatch.
(v1 forge.md §9)

## 3. The greenlight

**The gate is a plan-mode moment, so it is mechanical, not behavioral.**
With every gate document on disk, the lead calls EnterPlanMode and puts the greenlight in the plan file. While it waits there it cannot write, so no /goal paste, no inference and no eagerness can arm the run. Only the user's native approval ends the wait, and the gate stays open until an approval however many presentations that takes. A run that can approve its own plan has no gate.
(v1 forge.md §6; v1 CLAUDE.md rule 7)

**A /goal paste is never approval, and the evaluator's push never outranks the gate.**
/goal is a user command the lead cannot run. If the goal arrives while the gate is open, the lead says so, keeps waiting and never creates ARMED. ARMED marks approval, not arming: /goal is session-scoped and dies with the session, so an armed run resumed fresh has no condition, which is why rehydrate.sh re-surfaces the line on every session start until the goal is armed.
(v1 forge.md §7; v1 scripts/rehydrate.sh comment on the arming reminder)

## 4. Planning and slicing

**On a deployed done level, slice 1 is the walking skeleton and it deploys before any rubric line needs a live URL.**
Run one put nine live-URL lines in slice 1 while the pipeline deployed at phase 10, so slice 1 could not close on its first day or its last. Deploying only at the end is how run one produced nine slice-1 rubric lines that could not be measured on the day slice 1 was built, or on any day after. A rubric line may demand the live URL only because an earlier slice produced one.
(v1 agents/architect.md; v1 skills/ship; v1 forge.md §8)

**Each slice ends with "Closes: <rubric ids>", the lists partition DOD.md exactly, and a slice is epic sized, not initiative sized.**
Prose describes the evidence; the id list is the contract. The Closes lists are the index that makes a scoped re-verify possible, and until that existed nothing but the progress board read them. A line that no Closes list names is a plan defect worth seeing. When a slice's Closes list passes roughly a dozen rubric lines, split it: the goal is the only initiative in the run, and the escalation ladder only works when a slice is small enough to re-do cheaply.
(v1 agents/architect.md; v1 forge.md §9; v1 scripts/progress.mjs, comments on slice parsing)

**Plan every role, not only the end users. Back-office work is named at the greenlight.**
Back-office and operator surfaces are surfaces: moderation and notice queues, abuse and rate limits, backup and restore, and how the operator learns something broke. What the free tier cannot carry is named at the greenlight, never discovered after launch. Back-office work that maps to no screen becomes a named human dependency at the gate rather than a surprise at slice six, so every `manual:` step in a journey appears verbatim in PREFLIGHT.md. Where roles differ in rights, PLAN.md carries a role-by-capability matrix and seeds one test identity per role, so the verifier walks every role without operator credentials, and a role reading what it must never see is a captured FAIL.
(v1 agents/architect.md; v1 skills/design)

## 5. Building

**Match the nearest existing precedent in the repo. Where two disagree, pick one and name it in the commit message.**
Imitation is already what keeps a codebase consistent, and it beats a style rule: run two held 224 of 224 single-quoted imports with nothing enforcing it, while an em-dash ban living in three separate documents still shipped five.
(v1 agents/builder.md)

**Compose from scripts/capture.sh and pass shot ids. Write a probe only when the contract cannot express the check, and write it to .forge/probes/.**
The vitrine build shipped 209 scripts, 13 of them Forge's and 196 hand-written by the run. Sixty-nine of those imported chromium from playwright directly, each starting from nothing. Twenty-three of them covered two rubric lines (prove-f19.mjs, prove-f19-path3.mjs, f19-f49-path3-probe.mjs, f19-stranger-nokey-probe.mjs, run-f19-path3.sh, and eighteen more for r13). Not one shared a helper, and every one was committed into the product. So the loop was never open: it was reinvented per rubric line. capture.sh is the shared floor, and a seat composes from it and passes paths. The contract is the floor that collapses the pile, and it only works if the seats are pointed at it and the debris is a disqualifier (see Rubric writing).
(v1 agents/builder.md; v1 scripts/capture.sh header; v1 scripts/selftest.sh §3e; v1 START_HERE.html)

**One capture command and one three-file contract on every platform. Platform lives in data, not in seat prose.**
Every target answers the same command and writes the same three files, so the verifier's instructions never fork per platform. What differs is the freeze recipe, the variant matrix and where the tree comes from, and all of that is configuration. The tree is the half a PNG cannot carry: div soup, skipped heading levels, missing landmarks, buttons that are spans. A pixel diff cannot see any of it, and a cross-renderer pixel diff cannot see anything reliably at all. Where a platform genuinely has no element tree the meta marks the shot tree:declared, so a verifier knows it is reading a contract rather than an observation. START_HERE records the claim this replaced: "No seat can see rendered UI." Every seat could. The build installed Playwright itself and drove it constantly. What was missing was not sight but a shared contract.
(v1 scripts/capture.sh header; v1 scripts/selftest.sh §3e; v1 START_HERE.html)

**Chain shell work into one call, read with an offset and a limit, and say what you are looking for before you look.**
Every Bash round-trip costs about eight cents and fires the guard. Run two paid that ten thousand times, and Bash was seventy-eight per cent of every tool call it made. The guard header gives the figure as 77 to 78 per cent of all tool calls across the vitrine build, roughly ten thousand fires.
(v1 agents/builder.md; v1 scripts/guard.sh header; v1 scripts/selftest.sh §3e)

**The builder stops at 250K tokens of context: write what is done and what is left to RESUME.md, commit, and hand the slice back unfinished.**
maxTurns does not bound this. Run two pinned the builder at 220 turns and one dispatch still reached 815 round-trips and 613,865 tokens, for a hundred and one dollars, because turns and round-trips are not the same unit. A slice that needs more than one context is a slice the architect cut too wide, and handing it back says so. Grinding on costs the same money and hides it. (The verifier carries the same ceiling for an accuracy reason, see Verification.)
(v1 agents/builder.md; v1 START_HERE.html)

**Every green slice is a commit made with scripts/commit.sh --now. It is a step, not a sentiment.**
Run one wrote this same instruction into the harness and then went seven and a half hours without a single commit, landing 314 paths in one lump at shutdown. The hooks now checkpoint underneath on a throttle, so the floor is ten minutes, but a checkpoint is a safety net and a slice commit is history. The lead's slice commits are the real history; the throttled commit is the net underneath them, so a crash costs minutes rather than a day.
(v1 forge.md §8; v1 scripts/commit.sh header; v1 scripts/selftest.sh §3c)

**Never write the harness's README into the product.**
One build shipped Forge's own scaffold README verbatim, so a stranger cloning a collection-tracking app was told it had seven seats, nine hooks and a greenlight. Wrong documentation is worse than none, because none is obviously missing. The harness's own README, START_HERE, PROMPT and BUILD_REPORT therefore deliberately do not travel into a target project through manifest sync, and selftest asserts the README says it is not a product README.
(v1 agents/builder.md; v1 skills/standards; v1 README.md; v1 scripts/manifest.mjs, TRACKED comment; v1 scripts/selftest.sh §3e)

## 6. Verification

**Hand the verifier the contract only: the diff, the rubric lines in its scope and paths to the evidence. Never the builder's RUNLOG, reasoning or a summary of what it tried.**
A reviewer who sees the advocate's framing checks the code against itself instead of against the rubric, and that is the whole reason the seat is separate. The verifier is told this is not tidiness, it is the mechanism. Verification is 25 to 29 per cent of an M or L run's cost, near parity with the builder, so a dispatch handed the wrong context is expensive twice over: it costs more and it judges worse.
(v1 forge.md §9; v1 agents/verifier.md; v1 START_HERE.html)

**Read DOD.md for the lines in scope, never end to end.**
Run two's DOD.md was 164 KB, and a dispatch ruling on five ids that loads all of it has spent forty thousand tokens buying worse judgment.
(v1 agents/verifier.md)

**Rule each rubric line in its own pass, against that line's threshold alone.**
Batching several lines into one judgment costs double-digit accuracy on exactly this kind of work, and the best measured judge is right about 89 per cent of the time even one line at a time. The verifier is told: you are not as reliable as you feel.
(v1 agents/verifier.md)

**Flag only what breaks a stated line, and never impose a constraint the rubric does not state.**
The verifier was asked to find problems, so it will find some whether or not they exist. A missing abstraction, a test for a case that cannot happen, a defensive branch nobody asked for: none are defects unless a rubric line says so. "The judge invented a requirement" is how a bar gets silently raised, and a raised bar is as much a broken contract as a softened one.
(v1 agents/verifier.md)

**The first verify of a slice is full scope. A re-verify after a FAIL is scoped to the defect list, the slice's Closes ids and any line still unchecked. One full-scope verify of the whole rubric runs before SHIP.**
Before this, every re-verify re-walked all hundred and twenty lines, all personas and all screens to confirm one fix, and verification took as much wall-clock as building. The architect already guaranteed the Closes lists partition DOD.md exactly, so the index existed; nothing but the progress board read it. The bar does not move: the same lines are ruled on, by the same seat, to the same thresholds. A line already [x] is not re-ruled, and the final full pass proves one hundred percent once, end to end. What stops is proving the settled lines over and over, for example re-walking a hundred and twenty verified lines to confirm one CSS fix.
(v1 forge.md §9; v1 agents/verifier.md)

**Anchor the render before judging anything. Never rule on a blank frame.**
capture.sh writes an anchor into every shot's meta: navigation, console errors, failed requests, the main landmark, the element count. A capture whose anchor failed is not evidence about design, it is evidence the page did not paint, and ruling on it produces confident nonsense about a screen that never existed. Console errors are collected before the verdict for that reason: the render has to be anchored first, or a blank mount gets judged as a design difference. For engine rigs, never pass -nographics: it initialises no graphics device and reports green over blank frames.
(v1 agents/verifier.md; v1 scripts/capture.sh; v1 scripts/selftest.sh §3e; v1 START_HERE.html glossary)

**Rule craft lines on structure, tokens and computed hierarchy from the capture triple, not on a pixel diff against the mock.**
Two rasterizers never agree at the pixel, and a mock and a build produced by the same model from the same context agree on being wrong together, so that comparison either blocks every slice or gets loosened until it rules on nothing. What is diffable is in the tree JSON: the largest computed font-size node on a card is that object's rank-1 attribute, the type set is the declared set, heading order does not skip, the main landmark exists, nothing overflows at 320. Pixel diffing is for shipped against shipped, between slices. The approved screens in .forge/screens/ are the human's reference at the gate and the verifier cannot open a share link, so if they are absent or short the verifier says exactly that and names the limit, and never implies a comparison it did not make.
(v1 agents/verifier.md; v1 skills/design, Claude Design runbook; v1 agents/designer.md)

**Captures are frozen so that two captures of one idle shot are byte-identical, and the threshold is never widened to cope.**
A threshold nobody can meet gets widened, and widening is the visual form of softening a rubric line. The web path disables animation, transition, caret blink and smooth scroll. The iOS path overrides the status bar (time, network, battery) before the frame, or the clock and the battery make every capture a new image, and permissions are granted up front so no system modal covers the first frame. It also offers an accessibility content-size variant, the one that catches the real defect: text clipping and contrast collapse appear at accessibility content sizes, so the default-size light-mode capture is exactly the one that hides what agents get wrong. The Android path uses adb exec-out, never `adb shell screencap` piped, because shell line-ending translation corrupts the PNG and the corruption looks like a rendering difference. The engine rig belongs in the target repo, because evidence that exists only inside one MCP session on one OS is not reproducible and does not satisfy rule 6.
(v1 scripts/capture.sh)

**The verifier stops at 250K tokens of context: rule on what it has, mark the rest unreached, say so at the top of the verdict.**
This is not a budget, it is accuracy. An Anthropic-authored benchmark measured monitor recall falling from 98.6 to 88 per cent on subtle cases, and 99.7 to 69 on obvious ones, from context padding alone. A verifier deep into a long context is not being thorough, it is being wrong more often, and it is doing it confidently. A dispatch approaching the ceiling is a signal to split the rubric line, never to raise the cap.
(v1 agents/verifier.md)

**Three rulings per line, not two: PASS with an evidence reference, FAIL with a reproducing command, or UNKNOWN. UNKNOWN is not for lines the verifier did not reach.**
A judge with no way out invents a verdict, and a rubric-driven run cannot tell an invented PASS from a real one, so the way out is written into the format. UNKNOWN leaves the box unchecked, names what evidence would settle it, and routes to gathering that evidence rather than to the defect list. A line simply not reached is "unreached", a different thing, and belongs at the top of the verdict with the scope. A defect that cannot be reproduced is reported as unverified, never dropped and never guessed at: guessing costs a night, reporting costs a line.
(v1 agents/verifier.md; v1 scripts/selftest.sh §3e; v1 START_HERE.html)

**Every line ruled against is recorded with scripts/defect.sh in the same pass. The ledger has no clear command and must not get one.**
An unchecked box says a line is not done; it has never said whether the line was refused or simply not reached, and the difference is the whole state of the run. A rubric line that failed verification four times used to be byte-identical on the board to a line nobody had attempted: DOD.md carries a checkbox and nothing else, RUNLOG.md recorded no failures at all, and the rulings sat unread inside VERDICT-*.md. So a red run and a green run drew the same. A defect is open while its rubric line is unchecked and no later PASS names the same id. Passing the line is the only legitimate way it closes, which is the same rule the Stop gate enforces.
(v1 agents/verifier.md; v1 scripts/defect.sh header; v1 scripts/progress.mjs, defects comment; v1 scripts/selftest.sh §4b)

**The verifier's acceptance suite is written by the architect at the greenlight into .forge/holdout/, and the builder is never pointed at it.**
The gap between what a visible suite proves and what a held-out one proves grows about 27 points per tenfold increase in code size, and the reflex fix makes it worse: on one measured task, adding more visible tests widened the gap by 25 points. You cannot out-test a proxy by extending the proxy. A held-out case is the only thing that catches a build that has learned the test rather than the requirement. Same bar, same thresholds, different cases.
(v1 agents/architect.md; v1 START_HERE.html glossary)

## 7. Rubric writing

**Every line is a number or a named property, never an adjective and never tooling.**
Adjectives are not verifiable: if a shell command or a capture cannot check it, write the criterion differently or leave it out. A line naming a build artifact, a framework payload, a fixture path, or a header a CDN may strip dies at the first stack change. Name what a fresh machine observes on the shipped product.
(v1 agents/architect.md)

**A line whose proof needs credentials or access the run does not hold is marked OPERATOR and listed at the greenlight.**
Evidence must be re-observable without mutating production. Marking the line keeps the gap visible at the gate instead of leaving the verifier to invent a ruling for it.
(v1 agents/architect.md)

**Documentation is slice work, and the four kinds stay apart.**
A docs pass at SHIP documents what the builder remembers, which is the last slice. So each slice's Closes list carries the doc lines it owes, and the doc lines go in the slice that builds the thing they document, never in a documentation slice at the end. Documentation lands green with the code and the verifier rules on it in the same pass. Collapsing tutorial, how-to, reference and explanation into one file is the signature failure of machine-written documentation. A reference is generated where a generator exists, because a hand-written reference is stale by the next slice. The FAQ has a source and does not need inventing: the terms in each Actors row's vocab-unknown, and the failure steps the verifier recorded. A question nobody asked is not an FAQ entry. Product docs pass the same copy bar as product copy.
(v1 agents/architect.md; v1 agents/builder.md; v1 skills/standards)

**The disqualifier list names verification debris in the shipped tree.**
One build shipped 209 scripts of which 196 were hand-written probes, all committed (counts in Building), plus a .bak file and a scratchpad script at the repo root. A one-off probe belongs in .forge/probes/, which the product gitignores. The evidence survives in EVIDENCE.md; the script does not ship. Selftest asserts that nothing stops probe scripts shipping inside the product unless the disqualifier exists.
(v1 agents/architect.md; v1 scripts/selftest.sh §3e)

## 8. Pre-flight

**Everything the human must install, create or authorise is listed at the greenlight, read from the real machine, and it never gates arming.**
Run one learned that the Vercel CLI was missing at slice 1, hours in, and nine rubric lines had been waiting on it the whole time. A prerequisite found late is a prerequisite nobody planned for. A prerequisite the operator meets on day one costs a command; the same prerequisite found at slice 1 costs the slice. The list is derived from the stack, not from the rubric, because what the build needs to exist at all is a wider set than the lines whose proof needs console access. The user may approve with items outstanding, and the run then knows from its first turn that it is deploy-blocked instead of discovering it mid-build. The report is surfaced again on every session start until it is empty.
(v1 forge.md §6; v1 agents/architect.md; v1 scripts/preflight.sh header; v1 scripts/rehydrate.sh comment)

**The label must name the property the check actually tests.**
A label that overstates is worse than no check: it converts an unknown into a false reassurance. `cmd:supabase` tests that a binary is installed, so its label says "Supabase CLI installed", never "authenticated with Supabase"; the second needs `run:supabase projects list`. `path:supabase/config.toml` tests that a file any offline init creates is present, so it is not "project linked".
(v1 agents/architect.md)

**Prefer run: for anything whose failure mode is authentication, quota or permission, because presence and permission are different questions.**
Run two's database URL was present at every step and failed three ways: masked, then unreachable, then unauthenticated, all reported identically by a check that only asked whether a value existed. run: is the only kind that tests a property rather than a presence. It executes only under --probe, never from the SessionStart report, because a file the architect writes should not run arbitrary commands every time a session opens.
(v1 agents/architect.md; v1 scripts/preflight.sh; v1 scripts/selftest.sh §3e-ii)

**env: reads this machine and says nothing about the deploy target. Pair it with remote-env: under a heading that promises to describe a live URL.**
A variable set in a local dotenv says nothing about what the deploy target holds, so the check detail now says which ("set on this machine", "set in .env, local only"), and "set" stops meaning four different things. remote-env reports "cannot check" rather than passing when the CLI is absent or unauthenticated, because a check that cannot run must never answer the question it was asked. The harness wrote `remote-env` and run two independently wrote `denv` for the same idea on the same evening, so both spellings are accepted and neither copy's PREFLIGHT.md breaks on sync. Caching and the fail-soft posture are run two's: the check runs at every session start through rehydrate.sh, so it must never hang and never lie when offline. The url: kind, also run two's, asks whether the product answers rather than whether a value exists, and reports the code it got.
(v1 agents/architect.md; v1 scripts/preflight.sh)

**A value that still carries the shape of the instruction is not a value. Say so in the remedy when the operator never sees the credential.**
Supabase hands out a connection string containing [YOUR-PASSWORD] verbatim, and a project created through the API has a generated password nobody has seen. There is nothing to substitute and the placeholder ships. The remedy is "reset the password, then substitute", not "copy the connection string". Placeholder shapes treated as unset: [..], <..>, YOUR_, your-, changeme, xxxx.
(v1 agents/architect.md; v1 scripts/preflight.sh; v1 scripts/selftest.sh §3e-ii)

**Ordering belongs in `## ` stage headings, not in remedy text.**
The remedy prints only while an item is outstanding, because a remedy beside a satisfied item reads as work to do, so the sequence goes with it the moment the item is satisfied. Run two put "then", "after", "once" or "before" in 8 of 18 remedy fields. A heading survives. A connection string does not exist before the database, a deploy variable does not exist before the first deploy, and a bucket must exist before anything seeds into it: run two lost a seed run because storage provisioning was never sequenced.
(v1 agents/architect.md; v1 scripts/preflight.sh; v1 scripts/selftest.sh §3e-ii)

**The final line of PREFLIGHT.md counts even without a trailing newline.**
Without the `|| [ -n "$LINE" ]` guard the last requirement is dropped, never counted, and so can never be reported outstanding: the script prints "Nothing is waiting on you" precisely when something is. This is the report the operator trusts to be complete, and its whole reason for existing is that run one found a missing prerequisite too late.
(v1 scripts/preflight.sh comment on the read loop; v1 scripts/selftest.sh §3e)

## 9. Design

**The Actors grid replaces the role census and the persona panel. It asks for parameters, not opinions.**
Casting personas from a role census and asking them what they would use scores about 54 per cent accuracy on interface questions where grounded profiles score 62 and shuffled personas score 52, and every model tested carries a uniform acquiescence shift, so "would you use this" measures the model's agreement floor rather than the actor. The grid asks for a job, a situation, a band, a stage, an incumbent, and two switching forces that each name a surface. There are no interviews. The assumed cells are the run's exposed surface and go to the human at the greenlight verbatim.
(v1 forge.md §4; v1 agents/designer.md; v1 skills/design; v1 START_HERE.html)

**One row is an actor-JOB pair, not a person and not a role. Situation is the highest-yield field.**
Two people in the same role who differ in proficiency and trigger need different interfaces; two people in different roles with the same job usually need the same one. Role stays a column because PLAN.md's capability matrix and its seeded test identities key on it. A job must be statable without naming a screen, a control or a product; if it names one it is a solution assumption wearing a job's clothes. Situation binds the entry route and the state the app is in on arrival (cold start, deep link, resumed session), and it is the field the old four-field card lacked entirely.
(v1 skills/design)

**Band uses the PIAAC distribution and is assigned from the hardest task the job requires, never from a job title.**
Below 1 is 14 per cent of adults, Level 1 is 29, Level 2 is 26, Level 3 is 5, and 26 per cent cannot use a computer at all. "Senior accountant, therefore Level 3" is a claim about five per cent of everyone, professionals included. A cast where every row is band 2 or 3 is a claim about a 31 per cent tail and must be defended as one. At band 1 or below the flow completes inside one surface with no route transitions, affordances are labelled rather than iconic, and nothing requires inference across two sources. The `steps` field is why the band is not inert: a prose competence label produces no novice behaviour and no novice design, only an enforced number does.
(v1 skills/design; v1 agents/designer.md)

**Stage (Dreyfus) is a separate axis from band, and density follows the grid, not taste.**
A Level 3 domain novice is common and needs a different interface from a Level 1 domain expert. Assign stage by what the actor decides without consulting a procedure. Novice and advanced-beginner mean the interface supplies the rule: one decision per screen, staged disclosure, and confirm-plus-undo on anything destructive, because a novice cannot recognise a wrong outcome. Proficient and expert mean it supplies the saliences: density, deviation highlighting, undo without a dialog, and a keyboard path off the default visual one.
(v1 skills/design; v1 agents/designer.md)

**Anxiety and habit replace a single churn field, and each clause must end in a named surface.**
Switching has two forces and they name two different screens. A clause that cannot terminate in a surface is deleted, not softened.
(v1 skills/design)

**The grid deliberately has no name, photo, age, bio, hobbies or quote, and no population shares, importance ratings or willingness to pay.**
The presentational fields are what a model produces most fluently and what carries least information, and nothing downstream reads them. Two rows separated only by demographics are one row wearing two names. Shares, ratings and willingness to pay are survey-derived in the methods that define them, and fabricated here. Slice order comes from the human at the greenlight.
(v1 skills/design)

**Every cell carries one of five provenance tags, the tier is computed, and the greenlight prints only the assumed cells.**
Tags: [B] the brief, [R] published research the scout retrieved, [S] a scout observation of the market, [I] a real artifact the human attached, [A] assumed. proto means no retrieved evidence. desk means at least 60 per cent of cells across executor rows are [B], [R] or [S], and every executor row's band and incumbent are among them. qualitative means the human attached at least one real transcript. A run may not upgrade its own tier. Band and stage are expected to be the hardest to lift off [A]: proficiency and authority are exactly the fields teams assume rather than measure, which is why the gate must show them. Retrieved research is evidence about that population, not about this product's users: better than assumption, weaker than one transcript from somebody who does the job.
(v1 skills/design; v1 agents/scout.md)

**Strip the provenance tags before the grid reaches the designer or the builder.**
A citation read as an instruction becomes a directive, and the designer would design for the evidence rather than for the actor.
(v1 forge.md §4; v1 agents/designer.md; v1 skills/design)

**The scout's [R] cells are an assignment, and vocabulary must be quotable from something it retrieved.**
Go and find the digital-skill distribution for this market rather than the OECD average, the professional-body and sector surveys, the government statistics, the published usability studies, and the incumbent's real complaints in reviews and forums. A term list written from priors about the role is the failure this grid exists to avoid. An empty vocab list is honest where a fabricated one is worse than nothing, indeed anti-evidence. Named source and date, or it does not count.
(v1 agents/scout.md; v1 skills/design)

**Declare the LOUD element per route, and squint-test every exported screen.**
Run against five shipped screens of a real build, the squint test returned a clear dominant region on four, which refuted a much larger claim that the design phase produced flat hierarchy (the object model, the token contract and the deny-list all rested on that claim and were struck). On the fifth, the dense one, the dominant region was a filter chip and a secondary action while the page title and the two largest numbers on the page disappeared. The critic named the chips correctly and had no way to know that was wrong. Declaring LOUD is what turns a correct observation into a defect. Density is the variable that predicted failure in that test: the single-purpose screens held, the dense one did not, so density is declared per route and the rubric compares it to the shipped thing. The step costs one dispatch and about ninety seconds, and it is in the pipeline because it earned its place: the design phase's falsification test earned exactly one gate. In the glossary's words, a card-soup screen collapses into an undifferentiated grid under blur, while unblurred the same screen reads as clean and modern to a model.
(v1 forge.md §4b; v1 agents/designer.md; v1 agents/design-critic.md; v1 skills/design; v1 scripts/selftest.sh §3e; v1 START_HERE.html)

**Name QUIET and rank the attributes: exactly one rank 1, at most three on-card.**
Rank 1 is the identity of the record, and declaring it is what makes "which field is loud" a lookup instead of a judgement. Naming QUIET makes de-emphasis a deliverable, which a model will never do unprompted because suppressing a region looks like doing less work. A back-office queue is a route like any other.
(v1 agents/designer.md; v1 skills/design)

**The design-critic holds Read and nothing else, and it is a defect spotter, not the decider.**
A critic that can search the filesystem can find the sharp originals and the design rationale, and then it judges the intent rather than the pixels. The blindness is the instrument, so it is enforced by the tool grant rather than requested in prose. A model judging design pairwise agrees with human experts only about two times in three (figures under "Directions are merged, not crowned"). So the critic may downgrade a metric PASS to HOLD but may never turn a metric FAIL into a PASS; every claim about the shipped build must cite an element id present in that shot's tree JSON, or it is rejected before a human reads it; and taste is not the critic's, it dies at the greenlight with the human.
(v1 agents/design-critic.md)

**Directions are merged, not crowned. The design-directions workflow merges five and iterates once.**
Nielsen Norman's four-alternative study, which they still publish: picking the single best of four scored 56 per cent above the average of the four, merging the best ideas from all four scored 70, and one iteration on the merged design scored 152. And on pairwise design judgement the best measured model agrees with human experts about 66 per cent of the time against a human baseline of 85, so a crowned winner discards the better direction roughly one time in three. Deleting the pick deleted the whole apparatus that existed to make the pick trustworthy: the filter to three, the bracket, the rotating lenses, the byes. That is the largest simplification in the design phase and it is bought with the strongest evidence in it. The same 66 per cent figure is why the design-critic may never turn a FAIL into a PASS.
(v1 forge.md §4; v1 workflows/design-directions.js header; v1 agents/design-critic.md; v1 START_HERE.html)

**The five directions come from a per-goal stratification call that runs first.**
Five hardcoded angles are static across every goal, which is the independent-generation baseline: it buys +0.039 mean pairwise distance. A per-goal stratification call buys +0.173, over four times more, and the divergence clause raises quality by +0.38 standardised units rather than trading against it. Five agents given five fixed angles produce five variations of one idea; the generic set ("minimal", "bold", "playful", "data-first", "warm") is the same five directions every product gets. Stratify comes first so the strata cannot be back-rationalised from directions that already exist.
(v1 workflows/design-directions.js header and prompts)

**The merge must read as one design somebody decided, and the iteration is exactly one pass.**
Assembling a design from parts of several agents' output ranked last of twelve topologies measured, for token starvation and what the authors called the Frankenstein effect. The defence is coherence, and every direction must appear in the provenance table or carry a written reason it contributed nothing. The NN/g number is for merge plus one iteration. Nothing measured says two is better, and an uncapped "iterate until it looks good" loop has no evidence behind it and unbounded cost.
(v1 workflows/design-directions.js)

**Export every approved screen to .forge/screens/NN-name.png, and paste feedback that matters into the Claude Design chat as well.**
The verifier compares against those files and cannot open a share link. Inline canvas comments occasionally fail to persist. The handoff bundle carries design files, chat and annotations, so builders read it natively, never from screenshots.
(v1 agents/designer.md; v1 skills/design, Claude Design runbook)

## 10. Parallel builders

**The unit of disjointness is the feature and the interface, never the file.**
One builder on a sharing surface and one on an unrelated server-side algorithm do not collide; two on the same feature do, however carefully they divide the files. The reason to be careful is not merge conflicts, which git handles. It is that parallel writers make independent implicit decisions about style, edge cases and patterns, and three failure modes survive perfect feature-level separation. Shared surfaces: two independent features still both reach the tokens, the component library, the API client, the shared types, the schema and migrations, the router and auth, and a client half and a server half share the contract between them by construction, so a clean merge proves nothing. Precedent drift: the builder matches the nearest precedent in the repo, and a builder branched before its sibling landed can only match the older one. The worktree base: `isolation: worktree` branches from the default branch, not the parent session's HEAD, so builders in worktrees cannot see each other's work at all, and a builder on slice 4 starts from a tree missing slices 1 to 3.
(v1 forge.md, Parallel builders)

**Every slice declares its write scope, the architect commits the contract between parallel slices before either dispatches, and both builders branch from the same commit.**
Two slices may run at once only if their write scopes are disjoint and neither claims a shared surface. The write-scope line is what makes the decision checkable instead of arguable. Without a written contract the slices are not disjoint, they are coupled through an unwritten agreement. A shared branch point means both match the same precedent, and a style divergence found at merge is a defect against the later slice. Merge serially and run the full check between, never both and verify once.
(v1 forge.md, Parallel builders; v1 agents/architect.md; v1 scripts/selftest.sh §3e)

**Parallel builders buy wall clock, never tokens.**
Parallel dispatches always consume more than the serial equivalent. Buy it when the streams are genuinely independent, say so plainly, and never present it as a saving.
(v1 forge.md, Parallel builders)

**Worktrees pile up, and nothing prunes them.**
Seventeen had accumulated on a two-day run, one still locked, each holding a full checkout with its own .forge and about twelve hundred captures the main board cannot see. The board does not prune them, because deleting a builder's checkout is not a rendering decision. It says they are there, and how much evidence is stranded inside them.
(v1 scripts/progress.mjs, worktrees comment; v1 scripts/selftest.sh §4b)

## 11. Workflows

**Workflows exist to beat three failure modes a single context window cannot, and only the lead runs them.**
The three: agentic laziness (stopping at partial progress), self-preferential bias (grading your own work) and goal drift (losing constraints across compaction). They are exactly what a Forge run must survive. The platform allows subagents to spawn subagents to a depth limit, but no forge seat carries the Agent tool, so every fan-out belongs to the lead. That is a design rule, not a platform accident. Match the pattern to the phase, never all six to one goal, since most traditional coding tasks do not need a panel of five reviewers. Set a token budget in the prompt when a workflow could sprawl. Pair /loop only with recurring work, never a one-shot build, and never the greenlight.
(v1 skills/workflows; v1 CLAUDE.md rule 7)

**verify-fanout is capped at 40 lines per wave, and what the cap drops is logged and counted as unverified.**
An L rubric runs to a hundred and forty lines, and one agent per line meant a hundred and forty agents each booting the product independently, with no cap anywhere: defect-sweep bounds its fan-out at six and this bounded nothing. Silent truncation reads as "covered everything" when it did not, which is the one failure a verification workflow must not have, so a capped run can never report PASS.
(v1 workflows/verify-fanout.js comments)

**The verify-fanout ruling is computed in script code at one hundred percent, not by any agent.**
PASS exists only at one hundred percent of lines, and any verifier that returns nothing counts as unverified, so the ruling cannot be PASS.
(v1 workflows/verify-fanout.js header and code comments)

**defect-sweep exits on a full sweep that finds nothing new, never on a fixed number of passes. Round 8 is a ceiling, not the exit.**
Each sweeper is told that an empty list means the area is clean, not that it ran out of patience. Sweeping is capped at six areas. A sweep that reports clean over an empty set is the same defect class as a counter that reads a directory name as a file (see Progress board).
(v1 workflows/defect-sweep.js header; v1 skills/workflows; v1 scripts/progress.mjs comment on safeDir)

## 12. Hooks and scripts

**The Stop gate fires once per stop attempt, then yields and writes down where the run stopped.**
It reads stop_hook_active, which the platform sets on the re-entry the hook itself causes. A gate that ignores that flag re-blocks its own continuation forever. Run one did exactly that: 468 blocks, 40M cache tokens spent on the word "Holding.", and a forced platform override that read to the operator like a crash. A bar you cannot step away from is a livelock, not a bar. So the gate reminds once, then lets the run rest, and the bar itself does not move: ARMED stays, the rubric is untouched, and a park is never a PASS. The platform overrides a Stop hook after 8 consecutive blocks; that valve is deliberate. Selftest calls this the regression that must never come back.
(v1 scripts/dod-gate.sh header; v1 scripts/selftest.sh §3b; v1 CLAUDE.md rule 8; v1 START_HERE.html §10)

**A Stop payload that cannot be read yields. It never blocks.**
Three outcomes must stay distinct: the flag is set, the flag is explicitly unset, or the payload could not be read at all. The first fix collapsed the third into the second, which reinstated the livelock on any machine whose python3 is missing or broken (stock macOS without the Xcode command line tools ships exactly such a stub): every stop reads as "flag not set" and blocks forever, and the condition never clears because it is a property of the machine and not of the run. The safe default is inverted from the obvious one: yielding wrongly costs one missed reminder, while blocking wrongly cannot be escaped from inside the run. The payload read is bounded (2 seconds in code), because a gate that blocks on an idle pipe fails exactly the way the livelock did, silently and for the whole turn.
(v1 scripts/dod-gate.sh; v1 scripts/selftest.sh §3e, the livelock second edition)

**A park record is retired the moment it stops being true.**
A park record that outlives the park tells the next session a false number. dod-gate removes PARKED at zero unchecked lines and again whenever it is still blocking, because still blocking means the run is working. rehydrate prints PARKED before anything reads the rubric and concludes the run simply died: a parked run stopped on purpose.
(v1 scripts/dod-gate.sh; v1 scripts/rehydrate.sh; v1 scripts/selftest.sh §3e)

**Numeric tests in shell scripts validate their operands and fail toward the safe side.**
`[ -lt ]` has three outcomes and the code read two: a non-integer operand exits 2, and `&&` reads that exactly like "new enough". In preflight, "cmd:node:20.11" made every version requirement report satisfied no matter how old the installed tool was. In commit.sh, a worded window value meant the `&& exit 0` never fired and the throttle failed open: a commit per hook call, and run one had 1126 of them. In dod-gate, `grep -c` prints the count and exits 1 when nothing matches, so a `|| echo N` fallback appends a second line and the arithmetic dies on "0\n0". Selftest 3b-ii added the park with nothing checked yet, the likeliest park of all, which the old fixture hid because it carried one checked line: a population that never includes the failing case is not a test.
(v1 scripts/preflight.sh; v1 scripts/commit.sh; v1 scripts/dod-gate.sh; v1 scripts/selftest.sh §3b-ii, §3e)

**The Bash guard fails closed.**
An empty command used to mean both "the payload carried no command" and "I could not parse the payload", and both allowed the call. So one missing interpreter turned all five rules off, on a machine that looks fine, with no output anywhere. A safety gate fails closed: when there is a payload but no usable parse, the rules match against the raw text instead.
(v1 scripts/guard.sh comment; v1 scripts/selftest.sh §3e)

**The guard denylist stays five rules, written as bash regex builtins, and project additions only ever add.**
The five rules were five `echo | grep` pipes, which is ten processes per fire on top of the interpreter; they are now bash regex matches, which are builtins and spawn nothing, because the guard is the most frequently fired thing in the harness (volume in Building). Bash regex is ERE and carries no \b, and BSD and GNU disagree on the alternatives, so each word boundary is an explicit character class. Per-project rules live in .forge/overrides/guard-deny, which keeps the shipped copy hash-clean and therefore syncable. Selftest counts the shipped rules, not the deny calls: the override handler is a sixth deny call and is deliberately not a sixth rule. The rules match raw command text, so a heredoc that writes the credential patterns is itself blocked by rule five, which is the gate working: edit the file with the file tools. Keeping them builtins is structural, in the same way the board is kept free of unlinkSync.
(v1 scripts/guard.sh header; v1 scripts/selftest.sh §3e)

**Known gap, recorded as shipped: the guard and commit.sh disagree about .env.example.**
Guard rule four's `[^|;]*` run matches the prefix of the example template, so reading it is blocked, yet commit.sh deliberately excludes the same file from its secret scan. Two of the three secret locks disagree about one file. The guard test records the blocking behaviour as pre-existing, not a regression from the bash rewrite.
(v1 scripts/guard-test.sh comment)

**commit.sh checks for secrets before it stages anything, and a refusal leaves a record on disk.**
.gitignore covers .env and .env.*, and guard.sh blocks moving secret files; the commit check is the third lock, so a secret must never reach a commit. The first version staged everything and then ran `git reset` on a hit, which discarded any index the lead had built by hand. Every caller invokes commit.sh as `commit.sh ... >/dev/null 2>&1`, so stderr goes nowhere, and a refusal nobody can see stops the safety net for the rest of the run while every call still reports success. So the refusal writes .forge/COMMIT-BLOCKED and a RUNLOG line, where rehydrate.sh and the operator will both find it. .forge/commit-allow holds the exact paths that are genuinely committable, such as a public certificate or a test fixture key.
(v1 scripts/commit.sh; v1 scripts/selftest.sh §3e)

**The ten-minute checkpoint floor lives at every SubagentStop, red checks do not block it, and session end is unthrottled.**
A builder dispatch runs for hours, and the stops that fire inside it are exactly the unnamed ones, so the floor must not move behind the seat gate. commit.sh exits on a clean tree or inside its window after one `git status` and a stamp read, so paying it on every fire is cheap and skipping it would cost a crashed run its afternoon. A red result does not block the checkpoint: rule 5 says work that is not committed does not exist, and a builder whose typecheck is red mid-slice is exactly the one who must not lose an hour to a crash. The commit happens and carries the words "checks red", and the log carries it too. SessionEnd and StopFailure (rate_limit, overloaded) commit with --now, because that is the last thing that runs before a session dies and the window never applies.
(v1 scripts/runlog.sh; v1 scripts/checkpoint.sh; v1 scripts/commit.sh header; v1 CLAUDE.md rule 5)

**SubagentStop is not the dispatch boundary, so the expensive work runs only when the stop names a forge seat.**
The vitrine build logged 9,324 stops against 185 real subagent transcripts: fifty fires per dispatch. 9,081 of those lines carry an opaque agent hash rather than a seat name, and only 196 name a seat. At the measured 2,692 ms median for a full check, gating it on the seat name is about seven hours of blocking hook time per M or L run. A stop that names no seat still gets its log line and the throttled checkpoint, but never the unthrottled check. Selftest 3e states the same numbers: 2.7 seconds a fire.
(v1 scripts/runlog.sh comment; v1 scripts/selftest.sh §3e; v1 START_HERE.html)

**The post-edit gate moves, it does not soften: throttled per edit, absolute per dispatch.**
checks.sh runs on every Edit or Write, which is the most expensive thing in the harness. A full tsc plus an uncached `eslint .` over the whole tree, with the failure fed back into the builder's context. A sixty-edit slice paid it sixty times, and a builder two edits from finishing a rename was pulled off to fix a state it was about to fix anyway. That is most of why building looked slow while the verifier looked cheap. So per edit the gate is a throttled early warning (skip when the last full pass went green under DEBOUNCE seconds ago), and per dispatch runlog.sh runs it unthrottled on SubagentStop before commit.sh, so a slice can never end dirty and no red tree is committed. The throttle only ever starts from a green pass: a red pass leaves the stamp alone, so a broken tree is re-checked on every edit until it is not broken. eslint gets --cache so the second call is a diff of the first, offered only to a script that is actually eslint, because another linter would take the flag as a file path and fail a check that had nothing wrong with it.
(v1 scripts/checks.sh header; v1 scripts/runlog.sh; v1 scripts/selftest.sh §3e)

**The debounce is set in settings.json env, and the subagent prompt cache TTL is one hour.**
settings.json carried only permissions and hooks, so FORGE_CHECKS_DEBOUNCE had nowhere to be set and ran at 20 seconds for all 1,524 edits of a build. The env block now sets it to 120, and subagentPromptCacheTtl is 1h (as is cacheTtl on the builder and verifier). The script's own default remains 20.
(v1 scripts/selftest.sh §3e; v1 START_HERE.html; v1 .claude/settings.json)

**Decide "tooling missing" from the exit status, never from the message.**
Exit 127 is the shell's "binary not found", which is what a half-installed tree produces; a check that ran and failed exits 1. "Cannot find module" is the literal wording of TS2307, the most common real TypeScript error there is, and exactly what a builder importing a not-yet-created file produces. Reading that as "tooling missing" turns the gate off at the moment it matters most. A manifest exists before its dependencies, and blocking on "command not found" stalls the very install that would clear it, so a check that ran and found problems blocks and a check that could not run says so and stands down.
(v1 scripts/checks.sh; v1 scripts/selftest.sh §3e)

**RUNLOG records each stop in one atomic append, with the elapsed seconds since the previous stop.**
Run two's RUNLOG carried 45 interleaved lines with verdict prose spliced mid-record ("C3 is unch", "The worktr"), because concurrent stops each appended separately. The line is built once and written once, and because command substitution strips the trailing newline, the write puts it back. The log used to record stops and nothing else, so "does the harness spend longer verifying than building" cost a forensic reconstruction over three and a half thousand events. The elapsed field turns the stream into a measurement.
(v1 scripts/runlog.sh comments; v1 scripts/selftest.sh §3e; v1 scripts/progress.mjs, time-split comment)

**Vendored script copies are checked against a recorded baseline at every session start, and sync closes drift honestly.**
Every script is a per-project copy and copies were never synced. Measured across two real target projects, nothing was ever identical (bytes):

| script | harness | vitrine | tomb-raider |
|---|---|---|---|
| checks.sh | 3636 | 23371 | 611 |
| dod-gate.sh | 3947 | 2574 | 601 |
| commit.sh | 3487 | 1894 | absent |
| defect.sh | 972 | absent | absent |

Four of five differ between the two products, not just from the harness. Tomb-raider's dod-gate.sh was a 601-byte stub against the harness's 3,947: the Stop gate that enforces the entire rubric was not there. That run is the one recorded as folding under pressure. It did not fold; it had no gate. rehydrate.sh runs a hash compare against the recorded baseline, which is cheap and silent when everything matches.
(v1 scripts/manifest.mjs header; v1 scripts/rehydrate.sh comment; v1 scripts/selftest.sh §3e)

**manifest.mjs syncs first and detects after, and check never reports clean while anything differs.**
spec-kit's recipe assumes files start identical and you detect divergence, so a manifest that only detects divergence records the mess as the baseline. A file matching the last recorded manifest drifted because the harness moved and is safe to overwrite; a file matching neither was edited in the target and overwriting it would discard someone's work. With no recorded manifest there is no baseline, so "edited in the target" is a guess, and guessing conservatively is the exact failure spec-kit shipped and withdrew: keep everything, and the project sits permanently half-upgraded with no reinstall able to repair it. So say unknown and make the operator choose. The baseline stamps what is actually on disk, because stamping the harness's hashes for a file deliberately kept writes a lie: the next check reads clean while the file is still wrong, which is how a half-upgrade goes silent. Check counts any differing file, edits included, because it cannot tell a customisation from a 601-byte stub where the Stop gate should be. It also distinguishes a file that drifted from one that never arrived.
(v1 scripts/manifest.mjs; v1 scripts/manifest-test.sh; v1 scripts/selftest.sh §3e)

**A seat is a contract between its prose and its frontmatter, and seat-check.mjs reads both.**
Run two shipped four seats that could not do their stated job. The verifier, the only seat permitted to clear the Stop gate, had no Edit and flipped seven checkboxes through `sed -i`. The finisher was told to write REPORT.md with `tools: Read, Bash` and would have failed at the run's last step. The designer was ordered to "Run /design-sync first" by three separate files while holding neither the tool nor any way to answer the condition attached to it: a subagent has no slash-command surface, `mcpServers: claude-design` does not reach it, and DesignSync is a top-level tool, not an mcp__claude-design__* one. Nothing caught any of it, because the only test asked whether the frontmatter parsed. The patterns are deliberately high-precision: a rule that fires on prose the seat did not mean would train people to ignore the check, which is how the frontmatter test became decorative. The verb matters: PREFLIGHT.md being "read by scripts/preflight.sh" names the reader and orders nothing, and matching a bare mention flagged a seat that correctly has no Bash.
(v1 scripts/seat-check.mjs header; v1 scripts/selftest.sh §6b)

**A turn ceiling that truncates is worse than the runaway it guards.**
It produces a silently incomplete result. Run two capped the builder at 80 while it used 170. seat-check cannot know the real figure, so it only flags a seat that runs commands and has maxTurns below 50.
(v1 scripts/seat-check.mjs)

**A test must be able to fail, or it is decorative.**
Selftest asserts that seat-check fails on a broken seat, by stripping Edit and Write back out, which is exactly how run two shipped it. Run two's own mutation pass found four tests that passed whether or not their code worked, including one written to close a check-lies-about-its-subject bug. Every case in the adversarial audit block failed before its fix and is there because the earlier fixture could not have caught it. Selftest also checks that every script no-ops outside a forge project, across the whole script list rather than a frozen list of nine, because commit.sh and preflight.sh once shipped with no such assertion.
(v1 scripts/selftest.sh §1, §3e, §6b)

**README and START_HERE counts are asserted by selftest against the filesystem.**
README carries counts, and counts break on every pipeline change. Before this was enforced it listed six skills where seven existed and told the operator to fill three slots in the standards skill that were already written. Prose discipline is what failed, so the fix is not more discipline.
(v1 scripts/selftest.sh §3e; v1 README.md)

## 13. Progress board

The board is a renderer. Its comments carry a long list of ways a counter lied while looking confident. They are kept here, grouped by the rule they support.

**The board deletes nothing: progress.mjs holds no unlink call and no unlink import.**
`.forge/shots` is where builders and verifiers write evidence captures, and the sweep used to delete every entry it did not recognise, so a capture filed flat there was destroyed on the next `scripts/evidence.sh` call by the board that exists to display it. Run two's captures survived only because they sat in per-slice subdirectories, where the delete call throws EISDIR into an empty catch: luck, not design. A manifest fixed that half (prune only what the file recorded writing), because copies are `<hash>-<basename>` and the hash is 1 to 8 hex characters, which `d5-01-aisle-dark-390.png` matches exactly. The manifest was not enough, because test runners wipe their output directories mid-run: 169 of the 250 capture paths named in one run's EVIDENCE.md no longer existed on disk. For those, the board's copy is the last surviving image, and pruning it because it aged out of the newest sixty destroys the only proof of a ruling. A renderer that runs a thousand times a run must not hold a delete at all. Disk is cheaper than evidence. Selftest greps to keep this structural.
(v1 scripts/progress.mjs comment on the shots sweep; v1 scripts/selftest.sh §4b)

**A counter reads what the run produced, never what the counter produced, and never a directory name as a file.**
Captures get filed per slice. Slice 1 wrote eleven into .forge/shots/slice1/ and a flat readdir returned the single string "slice1", so the screenmap counted zero captures for the whole run and said so confidently. Separately, the board writes display copies as `<hash>-<basename>` into the flat level of .forge/shots, so unioning them with the sources counted every capture twice from the second render onward, and copies written before the prune ledger existed were counted forever: 155 files sat flat in vitrine's shots directory against a 60-entry ledger. So only the subdirectories count. A run whose proof has evaporated (test runners wipe their output directories, see the deletion entry above) should say so rather than quietly shrink.
(v1 scripts/progress.mjs comments; v1 scripts/selftest.sh §4b)

**Attribution of a capture to a screen is corroborated or it does not happen. A wrong screen is worse than an unassigned one.**
DESIGN.md numbers seven screens and DOD.md numbers fourteen surfaces, and the two disagree from position two onward, so `look-01-landing-390-dark.png` is DOD surface 1 and the old matcher filed it under DESIGN screen 01, "Aisle check". Five of seven rows counted another screen's captures and the panel read "7 of 7" with total confidence. That is the defect the board exists to catch in the product, sitting in the board. A screen-name fallback on slices produced one attribution in seven on a thirteen-slice run, and that one was wrong: it matched slice 13's launch-kit sentence about capturing the landing page and filed the Landing screen under the slice that photographs it. Viewport widths are not screen numbers (1440 is not screen 14, 390 is not screen 39). The later rule allows attribution by a screen's own name in a filename, since "f7-not-in-collection-390.png" does show the collection screen; the board has never claimed to draw verdicts from filenames.
(v1 scripts/progress.mjs comments; v1 scripts/selftest.sh §4b)

**A zero over a population the matcher never classified is not a measured zero.**
Run two named 76 captures by rubric id, none carried a screen number, and the panel said "0 of 7" beside a gallery full of screenshots. The residue sentence once read "805 captures carry no screen number, so none is counted here" while the rows above it counted 46, and it prescribed naming captures `<screen>-...`, which is the very collision that mislabelled five of seven rows. It now reports the residue and prescribes nothing. Viewport and theme were always in the filenames, and an older comment that called 390 and 1440 "inert" meant a screen proved on a laptop only and a screen proved everywhere drew identically.
(v1 scripts/progress.mjs comments; v1 scripts/selftest.sh §4b)

**The cursor and the counts come from the rubric, not from a sentence, and recomputed numbers beat stale prose.**
RESUME once read "Current slice: verifying against the live URL. Slice 1 closed. Slice 2 at 8 of 9", and the parser took the first number on the line, which belonged to the word "closed". The board showed slice 1 in flight while slices 1 to 3 were fully verified and slice 4 stood at 8 of 12. A slice is done when every line it Closes is checked, and the cursor is the lowest slice that is not, which reads the same checkboxes the Stop gate reads. Likewise a stale handoff read beside a live rubric is how a board lies without saying anything false: it claimed "37 of 124 checked" for twelve hours while DOD.md held 71 and the Stop gate agreed with DOD.md. Where RESUME states a count the board can recompute, the recomputed one wins and the disagreement is named with its age. Verdict dates beat file mtimes, because copying the state directory makes every verdict simultaneous.
(v1 scripts/progress.mjs comments; v1 scripts/selftest.sh §4b)

**The board separates "in build" and "unrecorded" from "open", and a failed line from an unattempted one.**
A board sat at 0 verified, 0 evidence, 122 open through hours of real work and looked identical to a run that had not started. The lines built and never written down are the debt worth showing: in run two that was nine lines built and an EVIDENCE.md that never existed. A line that FAILED verification four times used to be byte-identical on the board to a line nobody had attempted, so a red run and a green run drew the same, which is the one thing a board must never do. Rulings are read from VERDICT-*.md, then the DEFECTS.md ledger, then evidence prose, and conservatively: a false red is worse than a missing one.
(v1 scripts/progress.mjs comments; v1 scripts/selftest.sh §4b, §4d)

**An environment is a URL that answers with HTML. Dead local ports are litter.**
The old rule was a denylist of dashboard hostnames, and a denylist only ever knows what somebody remembered to add: it filtered supabase.com but drew the project's own database at aaxlmxludhrjlsyfgeqj.supabase.co as `production`, drew the object store beside it, and drew upload.wikimedia.org green because a CDN answers 301. HTML alone is not enough either, because upload.wikimedia.org serves its 404 page as text/html. Redirects are followed, 401 and 403 count (a deploy behind access protection is still the place to look), and a 5xx is worth a chip of its own because the thing exists and is broken. An entry is remembered and never unset by a later blip, and the deployed URL is probed at most once a minute, because a board that hammers production to draw a dot is a worse board. Twelve dead local ports had accumulated on a two-day run, one of them the discard port :9 used as a deliberate negative control, so they collapse into one count that names them on hover.
(v1 scripts/progress.mjs comments; v1 scripts/selftest.sh §4b)

**Time split is a reconstruction and is drawn as one.**
RUNLOG records stops and nothing else, so the stretch that ends in a builder stop is charged to build and the one ending in a verifier stop to verify, and gaps of more than a quarter of an hour with no stop of any kind are idle. Charging only named-stop-to-named-stop gaps under the idle cap is the wrong shape: with 61 seat-named stops among 3,639 the named ones sit hours apart, every gap trips the cap, and a 41-hour run reports two hours of work. The panel states its coverage beside the figure.
(v1 scripts/progress.mjs, where-the-time-goes comment)

**Token totals are incremental by byte offset, and the offset must be a byte offset.**
c.off is a byte offset fed to readSync while lastNl is an index into the decoded string in UTF-16 units. Any multi-byte character in a chunk makes the string shorter than the bytes it came from, so the stored offset lands short of the true line end and the next render re-reads that tail. Whole records fall inside it, parse fine, and their usage is added again. The total is persisted and monotonic, so the inflation compounds on every render and never washes out.
(v1 scripts/progress.mjs, token tally comment)

**Done is drawn filled and in progress is drawn outlined.**
Done used to be painted in the muted colour while the active node held the only green, so a finished step read as dimmed and the step still running looked more complete than the ones behind it. The same inversion hit the slice chips: the fill sat on the active chip and nothing on the done ones, so the slice still being worked looked settled and the three finished behind it looked pending. In-build reads as scope, not progress, which is why it is an outline and not a fill.
(v1 scripts/progress.mjs, stylesheet comments)

## 14. Compliance and stack choices

**Obligations are conditional: read the triggers, attach only what fires, and write each as a rubric line with an artifact behind it.**
A goal that triggers nothing gets nothing. A static page with no accounts, no analytics and no generated content carries no obligations, and adding them anyway is a defect.
(v1 skills/compliance)

**Artifacts, never claims. Verify before you write. Engineering hygiene is not legal advice.**
"GDPR compliant" is unverifiable, so it is not a rubric line; "an export and a deletion completed in a real session, captured" is. The compliance file was accurate on 16 August 2026 and decays from that date, so the scout confirms current status for the target market at plan time and the file is never quoted as authority. Real exposure (large user base, sensitive categories, minors at scale, a novel model use, anything high-risk under the AI Act) gets a lawyer before launch, and that review is itself a rubric line. Where a date is contested or a proposal sits mid-negotiation, the rubric line reflects the law in force and the plan notes the pending change in one sentence.
(v1 skills/compliance)

**The SBOM and a monitoring path belong in the build, not in a later project.**
For software or a connected device placed on the EU market, you cannot report what you cannot detect. The component inventory has to be good enough to know what you shipped, which is why it is produced by the build pipeline. The skill flags this trigger as having a near date.
(v1 skills/compliance, Cyber Resilience Act note)

**A listed high-risk AI use case is escalated to a lawyer before building.**
The deadline moved to December 2027, but classification is a design decision made now and the architecture is expensive to retrofit. Separately, disclosure that the user is interacting with an AI is live law today, not a future obligation, and it is disclosed at the point of interaction, not buried in a policy page.
(v1 skills/compliance)

**Do not build against the Digital Omnibus cookie provisions. Build so they are cheap to adopt.**
The data half of the Digital Omnibus remains in negotiation, and provisions such as single-click rejection, a moratorium on re-asking after refusal and legally binding browser-level consent signals have been contested and were dropped from at least one negotiating text. Keep consent state in one place behind an interface, never scattered across components, so a future browser signal or a changed banner is a swap rather than a rewrite.
(v1 skills/compliance, watch list)

**Web stack default: aggregates over the same rows belong in one round trip, because concurrency in the code is not concurrency at the database.**
Serverless in front of a transaction-mode pooler is a contract, not a detail. Both halves of it cost run two a day, and they are independent: fixing either one alone still leaves the route broken. Run two's /catalogue issued its results, its totals and five facet counts as eight queries in one Promise.all, which reads as clean concurrency and arrives at a pooler as a pipeline. Five facet counts became one `union all` discriminated by a `dimension` column, and two unrelated table counts became one query with two scalar subqueries. Each branch kept its own exclude-that-dimension predicate, so nothing was traded away. A rubric line that counts round trips per route is cheap and catches the query half before a pooler ever sees it. Measured and written up in run two at lib/db/client.ts and lib/catalogue/search.ts.
(v1 skills/stack-picker)

**Web stack default: size the pool for one request's own concurrent queries, and cache it.**
A transaction-mode pooler may assign consecutive pipelined queries to different backend connections. `max` must cover one request's own concurrent queries: minimising it does not save connections, it forces a pipeline onto one socket, and at `max: 1` run two saw three of eight queries answered and five never replied to, with no error and nothing to reconnect from. No prepared statements go through the pooler. A warm serverless instance calls the client builder once per request, so the pool must be cached, and discarded as one unit when stale rather than leaked per request. Total concurrent demand is capped with an admission semaphore, or the pipeline returns as soon as demand across simultaneous requests exceeds `max`.
(v1 skills/stack-picker)

## Known inconsistencies in the v1 evidence

These are kept so nobody cites a number without knowing the sources disagree.

- Lead cost share: forge.md gives 30.8, 37.4 and 37.7 per cent for three runs; START_HERE gives 33 to 58 per cent of every measured run.
- Probe debris: capture.sh says 209 scripts, 13 of them Forge's and 196 hand-written, then says all 221 scripts were committed. builder.md and architect.md say 209 scripts of which 196 were probes. The 221 figure is unexplained.
- Bash share of tool calls: builder.md says seventy-eight per cent (run two); guard.sh and selftest say 77 to 78 per cent (the vitrine build). Both give roughly ten thousand fires and appear to describe the same build, but v1 names it two ways.
- The checks debounce: checks.sh defaults to 20 seconds, settings.json sets 120, and START_HERE says "Now 120".
- Seat counts: CLAUDE.md says seven agents and lists seven, while README and START_HERE count eight seats once design-critic is included (selftest asserts START_HERE no longer claims seven).
- skills/workflows still maps patterns to persona-panel.js and design-tournament.js, which no longer ship, and says "the four shipped here" where three ship.

## Not carried here

Rationale that is only a one-clause reason inside an instruction, with no measurement or incident behind it, stays in the instruction. The compliance horizon dates and obligation lists are law content, not evidence, and stay in the compliance skill.
