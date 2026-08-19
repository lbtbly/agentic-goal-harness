---
name: design
description: Persona interviews, design spec format, and the Claude Design runbook for the forge pipeline.
---

# Design

## Role census (before any persona is cast)

Products carry a role spectrum, and a panel that interviews only consumers
plans only for consumers. First, write the census into BRIEF.md under
"## Roles": one row per role with mandate, access rights, and key surfaces.

    | Role | Mandate | Access | Key surfaces |

Sources: the goal, the scout research (category norms reveal the roles: a
marketplace has buyers, sellers, and support; a B2B2C product has a
professional side and a consumer side, different people with different
churn), and the compliance triggers (personal data implies someone
administers it). Always present: every end-user kind, and the operator.
Present when real: admin tiers with distinct rights, back-office roles named
by mandate, a support specialist and a content reviewer being different
roles when their access differs. On S goals the census is two lines, user
and operator, unless the brief says otherwise.

## Persona panel (run by the lead, consumed by the designer)

Personas are drawn from the census, three to five: one per end-user kind,
one back-office persona when the census carries back-office roles, and the
operator. Each: name, context, motivation, the one thing that would make
them churn or quit. More roles than five interviews: merge the closest
kinds and say so in the synthesis. The interviewer pass probes by kind:

End user:
1. Would you use this? What would you use instead?
2. What is missing before you would pay or return?
3. What in comparable products annoys you most?

Back-office:
1. What fills your queue, and what makes one case slow?
2. What data must you see to do the job, and what must you never see?
3. Where does the current tool make you do the system's work by hand?

Operator:
1. What breaks first when real users arrive, and how do you find out?
2. What do you do weekly that should be a surface, not a ritual?
3. What can this platform tier not carry, and when do you hit that wall?

Synthesis: three findings, three table stakes, one risk, and the access
boundaries the interviews surfaced (who must never see what). One page.

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
- Then export every approved screen to `.forge/screens/NN-name.png`, numbered to
  match the screen list. This is not for the builder, which keeps reading the
  bundle natively. It is for the verifier, which is ordered to compare shipped
  screens against the approved designs and cannot: a share link needs an
  authenticated session a subagent does not carry, and returns 403 to it. Run
  two's verifier said so honestly and ruled on written intent instead, which is
  the right behaviour over a broken contract and still leaves every craft line
  measured against prose. A design that exists only behind a URL is not evidence.
  Export through the same MCP server that made the screens.

## DESIGN.md format

1. Information architecture: screens and navigation, ten lines maximum.
2. Screen list: name, share link, local export path, one-line intent. The
   export path is what the verifier opens; the link is for humans.
3. Tokens: color, type, spacing decisions that bind the builder.
4. Interaction notes: the three decisions a builder must not improvise.
