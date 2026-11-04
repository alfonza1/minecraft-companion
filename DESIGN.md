# Player Two — graphite studio

## Direction and evidence

Apple-inspired, original Player Two design. Dark, modern minimal; software is the
subject. Preserve the P2 identity, direct tool navigation, real state, and all
existing routes. No Apple assets, SF font redistribution, fake window chrome,
mascot, fabricated gameplay, or decorative telemetry.

References inspected in headless Chromium on 2026-11-04:

- [MacBook Pro](https://www.apple.com/macbook-pro/): restrained navigation,
  generous product framing, compact blue primary actions.
- [Final Cut Pro](https://www.apple.com/final-cut-pro/): the actual software
  carries the presentation; quiet black surroundings and clear type hierarchy.
- [Apple Intelligence](https://www.apple.com/apple-intelligence/): focused
  feature chapters, segmented controls, distinct foreground/background surfaces.
- [Apple button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons):
  reference for control roles; native semantics and keyboard operation remain.

Research captures and before/after evidence: `.git/apple-redesign/` (local only).

Three directions considered: bright editorial product pages; cinematic black
product stage; graphite professional software. Selected graphite professional
software throughout, with a centered product stage on the website. It respects
the user's dark-theme preference while keeping dense operational screens usable.

## Audit

Replace condensed uppercase headings, blue-tinted surfaces, monospace overuse,
hard full-width dividing rules, square controls and crowded mini-labels. The
old homepage screenshot was too small to understand. Preserve the bounded
desktop content width, non-expanding screenshot, gathering default, and visible
console tools. Settings, onboarding, resources, inventory, studio, missions,
assistance, chat, profiles, diagnostics and every public route share the system.

## Locked system

- Palette: near-black canvas, neutral graphite surfaces, silver-white text,
  muted gray secondary text, accessible blue actions. Semantic success, warning
  and danger retain distinct labels as well as color.
- Typography: native system sans (`-apple-system`, BlinkMacSystemFont, Segoe UI),
  400 body / 600 headings; sentence case; -0.035em display tracking. Monospace
  only for code, coordinates and technical data. No remote font dependency.
- Tokens: `packages/ui/companion-tokens.css`. Shared radius, spacing, motion,
  typography, surface and control roles; legacy token aliases preserved.
- Marketing: centered hero and large actual product capture; focused feature
  chapters, constrained reading widths, varied detail layouts.
- App: compact session bar, immediately visible tool shelf, contextual active
  session stage with adjacent conversation, grouped inspector work areas.
- Content: clear page introduction, anchored sections, readable code and lists.
- Controls: blue filled primary, raised neutral secondary, blue text links;
  rounded rectangles for dense tools, capsules for navigation and website CTAs.
- Motion: short state transitions, no perpetual decorative animation; reduced
  motion disables nonessential movement. Visible focus and native dialogs.
- Responsive: 320, 375, 390, 414, 768 and 1440 widths; wrap tools rather than
  hide important destinations. No horizontal page scrolling.

## File scope

Edit shared tokens; website App, main and index; add a website studio stylesheet
in place of the imported compact theme. Update dashboard SessionStage, Studio,
YouTubeOptions and BuildPreview presentation; replace the imported console theme
with the dashboard studio stylesheet. Keep the retired files for reference.
Refine component styles where hardcoded legacy colors/fonts bypass shared tokens.
Update real application captures, intentional visual baselines and design docs.
Create this design record and a verification report. Delete no production files.

## Implementation checklist

- [x] Shared typography, surfaces, buttons, inputs, focus and reduced motion
- [x] All nine public pages, footer, mobile menu, code and interactive sections
- [x] Console shell and every tool route
- [x] Session contexts, chat, voice, dialogs and error/empty states
- [x] Inventory, resource workbench, missions, collaboration and build studio
- [x] Settings, onboarding, profile/memories and advanced diagnostics
- [x] Desktop/mobile visual review and accessibility corrections
- [x] Behavior regression checks, production builds and source review
- [x] Updated product captures and safe local application update
- [x] Published site verification

## Rollback

Baseline: `9628c013e41324b0e62eb4b80e0a65b437d2a250`.
Local safety branch: `safety/pre-apple-redesign-2026-11-04`.
Redesign commits stay scoped. If rejected, revert those commits on the feature
branch, rebuild and redeploy; do not reset history or restore user data from an
old snapshot. User accounts, memory, voice preferences and projects are outside
the design changes and remain untouched.
