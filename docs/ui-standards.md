# UI standards

FinTrack uses a calm, information-first interface.

## Required qualities

- One obvious primary action per screen.
- Android phone widths are the design target. The app remains a centered,
  520px-max single-column workspace on tablets and desktops, including the browser
  preview; larger displays do not introduce a separate sidebar or multi-column
  dashboard.
- Keep Home, Activity, Plan, and Worth in the persistent bottom navigation, with
  other sections in an accessible drawer. Touch targets are at least 44px and
  dialogs open as bottom sheets without hiding their actions.
- Bottom navigation links expose their visible labels to assistive technology.
  Dismissing the drawer restores focus to its opener; selecting a section moves
  focus to the destination heading, including after a section finishes loading.
- Neutral surfaces, one teal accent, semantic status colors, and tabular numerals.
- A shared spacing/type/radius scale and consistent alignment.
- Light, dark, and system themes with WCAG AA contrast.
- Use scannable, labelled rows for day-to-day records on all screens. Dense
  analytical or import tables may scroll horizontally inside their section,
  without scrolling the page itself.
- Exact totals beside charts and a text/table alternative for every chart.
- Purposeful empty, locked, loading, error, permission, and restore states.
- Direct copy that explains the consequence and recovery action.
- In calculators, distinguish contractual bank terms from hypothetical market
  paths. Show entered assumptions, dated external money, transfers, withdrawals,
  possible corpus depletion and an accessible schedule; label stale results
  after an input changes.
- Compare at a common evaluation date and label the shared purchasing-power
  base date; show differences in funding, not a "best investment" badge. Use
  editable copies of goals without changing saved records. Never prefill an
  assumed investment return as a recommendation.

## Prohibited patterns

- Decorative gradients, glass effects, excessive shadows, nested cards, or repeated
  dashboard tiles with no decision value.
- Generic slogans, fake “insights,” invented production data, unexplained scores,
  emojis as controls, and filler prose.
- Motion that delays work or ignores reduced-motion settings.
- Charts that do not answer a user question.
- AI-generated runtime text or financial advice.

Feature review uses real long labels, large INR values, zero/negative values,
320px and regular phone widths, desktop preview, keyboard-only use, and both color
themes. Screenshot baselines are reviewed rather than blindly regenerated.
