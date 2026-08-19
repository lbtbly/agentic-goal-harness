---
name: stack-picker
description: How the architect picks a stack per goal category. Defaults, not dogma.
---

# Stack picker

The architect owns the call and may override any default with a three-sentence
defense. Verify current versions at plan time; never pin from memory.

## Web product
Default: Next.js on Vercel, Postgres via a managed provider, Drizzle, Better
Auth or the platform standard. Pick boring, deployable, typed.

### What this default demands

Serverless in front of a transaction-mode pooler is a contract, not a detail.
Both halves below cost run two a day, and they are independent: fixing either
one alone still leaves the route broken.

**Query side. Concurrency in the code is not concurrency at the database.**
Aggregates over the same rows belong in one round trip. Run two's `/catalogue`
issued its results, its totals and five facet counts as eight queries in one
`Promise.all`, which reads as clean concurrency and arrives at a pooler as a
pipeline. Five facet counts became one `union all` discriminated by a
`dimension` column, and two unrelated table counts became one query with two
scalar subqueries. Each branch kept its own exclude-that-dimension predicate, so
nothing was traded away. Worth doing regardless of pool size.

**Connection side.** A transaction-mode pooler may assign consecutive pipelined
queries to different backend connections, so:
- `max` must cover one request's own concurrent queries. Minimising it does not
  save connections; it forces a pipeline onto one socket. At `max: 1` run two
  saw three of eight queries answered and five never replied to, no error,
  nothing to reconnect from.
- No prepared statements through the pooler.
- A warm serverless instance calls the client builder once per request, so the
  pool must be cached, and discarded as one unit when stale rather than leaked
  per request.
- Cap total concurrent demand with an admission semaphore, or the pipeline
  returns as soon as demand across simultaneous requests exceeds `max`.

Measured and written up in run two at `lib/db/client.ts` and
`lib/catalogue/search.ts`. A rubric line that counts round trips per route is
cheap and catches the query half before a pooler ever sees it.

## Mobile app
Default: Expo and React Native, EAS build and submit, TestFlight for the first
loop. Web companion only when the concept demands it.

## Casual game
Default: the lightest engine that fits: web canvas or Phaser for instant play,
Unity only when 3D or heavy physics is the concept. Ship the loop first, meta
later.

## Content site
Default: Astro or Next.js static, deployed on Vercel. No database until a
feature forces one.

## Rules
- One stack per goal. Polyglot is an L-goal decision, never a default.
- Prefer platforms with a one-command deploy; the finisher depends on it.
- Note the deploy target in PLAN.md so the ship skill runbook matches.
