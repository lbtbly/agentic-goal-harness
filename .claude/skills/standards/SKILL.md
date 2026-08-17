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