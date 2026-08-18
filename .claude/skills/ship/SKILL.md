---
name: ship
description: Deploy runbooks the finisher follows. Vercel for web, EAS and TestFlight for mobile.
---

# Ship

## The skeleton deploy, first

On a deployed done level the first deploy happens at the end of slice 1, not at
SHIP. Slice 1 is the walking skeleton: routes exist, the app builds, it goes
live. Everything after it is verified against a real URL.

1. `scripts/preflight.sh`. Outstanding items mean no deploy is possible yet;
   say so once, keep building locally, park the live-URL lines.
2. Green pre-flight: `vercel link` if `.vercel/` is absent, then
   `vercel deploy --prod`, and record the URL in RESUME.md and EVIDENCE.md.
3. From here every slice redeploys, so each rubric line that names the live URL
   can be measured the day its slice lands.

Deploying only at the end is how run one produced nine slice-1 rubric lines
that could not be measured on the day slice 1 was built, or on any day after.

## Vercel (web)
1. vercel link, answer once, then vercel env pull for local parity.
2. Set production env vars with `vercel env add NAME production`; never commit
   secrets.
3. `vercel deploy --prod`. stdout is the deployment URL; capture it:
   `vercel deploy --prod > deploy-url.txt 2> deploy-err.txt`. A non-zero exit
   means the deploy failed; the error is in stderr, not stdout.
4. Post-deploy check: fetch the URL, walk the core route, confirm 200s and no
   console errors. Record evidence.
5. Rollback: `vercel rollback <deployment-id-or-url>` returns production to a
   previous deployment; `vercel rollback status` shows a pending one; undo by
   promoting a newer deployment with `vercel promote <deployment-id-or-url>`.
   Note the exact commands with this project's ids in REPORT.md.

## Expo EAS (mobile)
1. eas-cli present and signed in: `eas whoami`. First time in a repo:
   `eas build:configure`, then commit eas.json.
2. `eas build --platform ios --profile production` (add android when in
   scope). `eas build:list` shows build IDs, status, and artifact URLs.
3. `eas submit --platform ios --profile production` sends the build to
   TestFlight, or fold both steps into one with
   `eas build --platform ios --auto-submit`. Credentials: an App Store
   Connect API key via `eas credentials --platform ios`, and the app's
   `ascAppId` in the eas.json submit profile.
4. The build appears in TestFlight after processing, usually 10 to 15
   minutes. Internal testing group first. Record build IDs and the
   TestFlight link as evidence.
5. Rollback: the previous build stays live in TestFlight; note the build
   number to re-promote in REPORT.md.

## Both
- Environment variables listed in REPORT.md by name, never by value.
- The deployment is not done until the finisher has loaded it and recorded
  the check.
- Commands verified against the Vercel CLI and EAS references, August 2026.
  Re-verify flags against current docs when a deploy fails on syntax.
