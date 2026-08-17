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
