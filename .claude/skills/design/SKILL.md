---
name: design
description: Persona interviews, design spec format, and the Claude Design runbook for the forge pipeline.
---

# Design

## Persona panel (run by the lead, consumed by the designer)

Build three personas from the research: name, context, motivation, the one
thing that would make them churn. For each, an interviewer pass probes:
1. Would you use this? What would you use instead?
2. What is missing before you would pay or return?
3. What in comparable products annoys you most?
Synthesis: three findings, three table stakes, one risk. One page.

## Claude Design runbook

Server: claude-design, added at user scope:
claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp
Sign in once with /design-login. Verify with /mcp.

Working rules:
- Run /design-sync before designing when the repo holds real components, so
  screens use actual tokens instead of approximations.
- One project per goal. Key screens plus the core flow, not every state.
- Ask Claude Design for two alternative directions on the primary screen, pick
  one, then iterate on it.
- Inline canvas comments occasionally fail to persist. When feedback matters,
  paste it into the design chat as well.
- Finish with the internal share link (comment access) for the greenlight, and
  the handoff bundle for the builder. The bundle carries design files, chat,
  and annotations; builders read it natively, never from screenshots.

## DESIGN.md format

1. Information architecture: screens and navigation, ten lines maximum.
2. Screen list: name, share link, one-line intent.
3. Tokens: color, type, spacing decisions that bind the builder.
4. Interaction notes: the three decisions a builder must not improvise.
