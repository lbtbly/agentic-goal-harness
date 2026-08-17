---
name: compliance
description: Legal and regulatory obligations that attach to a goal, by trigger, plus the dated horizon of what lands in the next twelve months. The architect consults this when writing the rubric; obligations become checkable Release lines, never universal ones.
---

# Compliance

Obligations are conditional. Read the triggers, attach only what fires, write
each one as a rubric line with an artifact behind it. A goal that triggers
nothing gets nothing: a static page with no accounts, no analytics, and no
generated content carries no obligations, and adding them anyway is a defect.

Three rules govern how this lands:

1. **Artifacts, never claims.** "GDPR compliant" is unverifiable, so it is not
   a rubric line. "An export and a deletion completed in a real session,
   captured" is.
2. **Verify before you write.** This file was accurate on 16 August 2026 and
   decays from that date. The scout confirms current status for the target
   market at plan time. Never quote this file as authority.
3. **Engineering hygiene, not legal advice.** Real exposure (large user base,
   sensitive categories, minors at scale, a novel model use, anything
   high-risk under the AI Act) gets a lawyer before launch, and that review is
   itself a rubric line.

## Baseline triggers

**The product stores anything about a person** (accounts, email, uploads,
collection data, device identifiers)
- A lawful basis named per purpose, in a privacy notice written for humans.
- Data export and account deletion that work end to end, including backups on
  a stated schedule.
- Stated retention per data category. Nothing kept just in case.
- Processors under contract: hosting, analytics, email, auth, model providers.
  EU or adequate-country residency preferred for European audiences; transfers
  documented where they happen.
- Data minimization at the schema level: if a column has no purpose, it does
  not exist.
- Artifact: the privacy notice, plus captures of an export and a deletion
  completed in a real session.

**The product sets non-essential cookies, SDKs, or analytics**
- Nothing non-essential fires before a choice. Reject as easy as accept, same
  prominence, same number of clicks.
- Consent stored, revocable, honored on return, and re-asked only on a real
  change of purpose.
- First-party internal analytics may sit outside consent depending on
  implementation; third-party analytics and advertising do not. Check before
  assuming.
- Artifact: a network capture on first load showing no non-essential requests
  before a choice, plus a capture of the reject path.

**The product shows AI-generated or AI-manipulated content**
- User-visible labeling of generated media, and machine-readable marking in
  the file itself.
- Deepfake-style content carries explicit disclosure.
- Artifact: the label in the interface plus the metadata on a generated file.

**The user interacts with an AI system**
- Disclosed as AI at the point of interaction, not buried in a policy page.
  This is live law today, not a future obligation.
- Artifact: a capture of the disclosure in the flow.

**The product uses AI in a listed high-risk use case** (hiring, credit,
education access, biometric identification, essential services)
- Stop and escalate to a lawyer before building. The deadline moved to
  December 2027, but classification is a design decision made now and the
  architecture is expensive to retrofit.
- Artifact: a written classification with reasoning, and a review sign-off.

**Minors are plausibly in the audience** (casual games, collecting, anything
that reads as all-ages)
- Age signal at entry. No behavioral advertising to minors. No dark patterns
  around purchases or streaks.
- Store age rating consistent with actual content.
- Artifact: the age flow, the rating declaration, and a capture of the
  purchase path showing no pressure mechanics.

**Users can see, share, or compare other users' content**
- A reporting path, a stated moderation policy, a response commitment, and an
  appeal route.
- Artifact: a report filed and resolved end to end.

**Money changes hands**
- Total price including tax before commitment. Renewal terms, cancellation,
  and withdrawal rights stated plainly at the point of decision.
- Cancellation no harder than subscription.
- Artifact: captures of checkout and of cancellation completed.

**It ships through an app store**
- Privacy labels matching actual network behavior, verified against traffic
  rather than against intent.
- Platform tracking prompts where required, and no collection before the
  prompt is answered.
- Artifact: the label declaration next to a traffic capture.

**It is a consumer-facing digital service in the EU** (e-commerce, banking,
transport, ebooks, and adjacent categories)
- Accessibility obligations are legal duties here, beyond the craft floor in
  the standards skill. Treat conformance as a Release line.
- Artifact: an audit against the current standard, with exceptions listed and
  justified.

**The product is software or a connected device placed on the EU market**
- A vulnerability detection and reporting capability, and a component
  inventory good enough to know what you shipped. See the horizon below; this
  one has a near date.
- Artifact: an SBOM produced by the build pipeline, plus a written reporting
  runbook naming who files and where.

## The twelve-month horizon

Dates below were correct on 16 August 2026. Confirm each at plan time.

**11 September 2026, Cyber Resilience Act, reporting obligations.**
Manufacturers of products with digital elements placed on the EU market must
report actively exploited vulnerabilities and severe incidents: early warning
within 24 hours, full notification within 72 hours, a final report within 14
days of a fix for vulnerabilities and within a month for severe incidents,
filed through the Single Reporting Platform. This reaches products already on
the market, not only new releases. Scope carve-outs exist, notably around some
SaaS and remote data processing, so classify the product before assuming it
is in or out. You cannot report what you cannot detect, which is why the SBOM
and a monitoring path belong in the build, not in a 2027 project.

**2 December 2026, AI Act, two items.**
Marking and detection obligations for generative systems reach systems that
were already on the market before August 2026, closing the grandfathering
window. Separately, new prohibitions on AI systems for generating child sexual
abuse material and non-consensual intimate imagery take effect, with required
technical safeguards such as refusal behavior, output controls, and content
filtering. Any product that generates or edits images of people settles this
well before the date.

**2 August 2027, AI Act, structural.**
Member states stand up national regulatory sandboxes, and the Commission faces
its deadline for delegated acts covering embedded high-risk systems. Not a
product obligation, but it is when practical guidance for high-risk work
starts to exist.

**Beyond the window, in force order:** high-risk obligations for standalone
listed systems on 2 December 2027; full Cyber Resilience Act conformity on
11 December 2027; high-risk obligations for embedded systems on 2 August 2028.

## Watch list, not law

The data half of the Digital Omnibus, covering GDPR amendments and the move of
cookie rules into the GDPR, remains in negotiation. Provisions such as
single-click rejection, a moratorium on re-asking after refusal, and legally
binding browser-level consent signals have been contested and were dropped
from at least one negotiating text. Do not build against them. Do build so
they are cheap to adopt: keep consent state in one place behind an interface,
never scattered across components, so a future browser signal or a changed
banner is a swap rather than a rewrite.

## Verification protocol

At plan time the scout confirms, for the target market: whether each fired
trigger still applies, whether any horizon date has moved, and whether the
product's classification has changed. Primary sources first, official
regulator pages over commentary. Where a date is contested or a proposal sits
mid-negotiation, the rubric line reflects the law in force and the plan notes
the pending change in one sentence.

## How this lands in the rubric

Under Release in DOD.md, one checkbox per fired trigger, each naming its
artifact and, where relevant, its date. Nothing vague, nothing aspirational,
nothing the verifier cannot rule on with evidence in hand.
