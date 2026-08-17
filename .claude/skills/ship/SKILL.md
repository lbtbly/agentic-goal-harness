---
name: ship
description: Deploy runbooks the finisher follows. Vercel for web, EAS and TestFlight for mobile.
---

# Ship

## Vercel (web)
1. vercel link, then vercel env pull for local parity.
2. Set production env vars with vercel env add; never commit secrets.
3. vercel deploy --prod. Capture the URL.
4. Post-deploy check: fetch the URL, walk the core route, confirm 200s and no
   console errors. Record evidence.
5. Rollback: vercel rollback to the previous deployment. Note the command in
   REPORT.md.

## Expo EAS (mobile)
1. eas build --platform ios (and android when in scope), production profile.
2. eas submit to TestFlight. Internal testing group first.
3. Record build IDs and the TestFlight link as evidence.
4. Rollback: previous build stays live; note the build number to re-promote.

## Both
- Environment variables listed in REPORT.md by name, never by value.
- The deployment is not done until the finisher has loaded it and recorded the
  check. TODO: complete provider-specific steps during the build against
  current CLI docs.
