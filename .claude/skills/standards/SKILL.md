---
name: standards
description: The quality bar every forge rubric draws from. Market ready, not minimum viable.
---

# Standards

Rubric sources. The architect turns these into checkable lines; the verifier
holds them.

## Craft
- Spacing on a consistent scale, one type system, aligned everything.
- Real states on every screen: loading, empty, error, offline where relevant.
- Copy written for humans: no filler, no lorem ipsum, no em dashes, no rocket
  emoji. Every empty state tells the user what to do next.
- No machine tells in copy: no inflated significance ("seamless", "robust",
  "delve", "landscape"), no elegant variation (repeat the term; three names
  for one thing reads as three things). Prefer the concrete: a number, a
  path, the actual error. Do not call a thing important; show what it does.
- Mobile first, verified at three viewports minimum.
- Zero console errors on the core flows.
- Accessibility floor: contrast passes, focus visible, forms labeled, images
  described.

## Behavior
- The core loop completes in the fewest taps the concept allows.
- Interactions respond within 100ms or show progress.
- Data survives a refresh. Errors are recoverable, never dead ends.

## Documentation

The product documents itself as it is built, scoped by the done level. Not a
pass at the end: a docs pass at SHIP documents what the builder remembers, which
is the last slice. Each slice's Closes list carries the doc lines it owes, so
documentation lands green with the code and the verifier rules on it in the same
pass.

Keep the four kinds apart. Collapsing them into one file is the signature
failure of machine-written documentation, and the four answer different
questions:

- TUTORIAL takes a stranger from nothing to one working thing, once.
- HOW-TO answers "how do I do X" for someone who already has the thing running.
- REFERENCE is looked up, never read. Generated where a generator exists,
  because a hand-written reference is stale by the next slice.
- EXPLANATION is why it works this way, and it is the only one that may be
  discursive.

By done level:

- runs locally: a README that gets a stranger from clone to a running app.
  Prerequisites, one command, what success looks like, the three things most
  likely to go wrong. Nothing else.
- deployed live: the above, plus user-facing help covering every core-loop
  screen, plus an FAQ, plus a CHANGELOG the finisher appends to at ship.
- deployed plus launch assets: the above, plus the support surface the store
  listing or the landing page points at.

The FAQ has a source and does not need inventing: the terms in each Actors row's
`vocab-unknown`, and the failure steps the verifier recorded. A question nobody
asked is not an FAQ entry.

Product docs pass the same copy bar as product copy. Nothing above exempts them.

THE HARNESS'S OWN README IS NOT THE PRODUCT'S README. One build shipped Forge's
starter scaffold README verbatim inside the product, so a stranger cloning a
collection-tracking app was told it had seven seats, nine hooks and a greenlight.
Wrong documentation is worse than none, because none is obviously missing.

## Personal rules
<!-- SLOT 1: Value before the wall.
     A first-time user completes the core action at least once before any
     signup, paywall, or permission prompt. Accounts exist to save progress,
     never to unlock the first taste.
     Evidence: a clean-session capture series showing the core action
     completed with no account. -->
<!-- SLOT 2: Motion is calibrated to the category, and declared before it is
     built. DESIGN.md states the motion register and defends it in one line.
     Minimal and functional for business and finance, with at most one moment
     of enchantment, placed at completion. Expressive and characterful for
     creative, entertainment, travel, and collecting. The build matches the
     declared register; no drift, no default library flourish.
     Evidence: the register line in DESIGN.md plus a capture of the signature
     transition. -->
<!-- SLOT 3: Text is designed, not filled in.
     Voice: direct, concrete, rhythmic. Verbs over nouns. No filler openers,
     no hedging, no marketing air, no em dashes, no acronym stacks, no
     invented urgency. Every string earns its space; if it does not survive
     being read aloud, it is not shipped.
     Structure: English ships first and every product is built to add
     languages later. No hardcoded strings, no text baked into images,
     layouts hold at 40 percent text expansion, and dates, numbers and
     currency are locale-aware from the first commit.
     Evidence: the string inventory, plus pseudo-locale screenshots at 40
     percent expansion showing no clipping or overflow. -->