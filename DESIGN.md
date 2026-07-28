---
name: Splitwiser
description: A warm, precise shared-expense ledger for friends and trips.
colors:
  ledger-charcoal: "oklch(18% 0.006 70)"
  sidebar-charcoal: "oklch(22% 0.006 70 / 0.92)"
  panel-charcoal: "oklch(24% 0.006 70 / 0.84)"
  row-charcoal: "oklch(24% 0.006 70 / 0.74)"
  raised-charcoal: "oklch(29% 0.006 70)"
  control-charcoal: "oklch(12% 0.004 70 / 0.72)"
  ledger-ivory: "oklch(91% 0.006 55)"
  muted-parchment: "oklch(82% 0.02 70)"
  quiet-taupe: "oklch(66% 0.02 70)"
  hairline: "oklch(98% 0.006 70 / 0.1)"
  sand-gold: "oklch(82% 0.1 78)"
  deep-gold: "oklch(70% 0.1 78)"
  ink-on-gold: "oklch(31% 0.07 78)"
  balance-mint: "oklch(82% 0.15 160)"
  balance-coral: "oklch(74% 0.17 20)"
  error-rose: "oklch(84% 0.08 25)"
typography:
  display:
    fontFamily: "\"Source Serif 4\", Georgia, serif"
    fontSize: "42px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "normal"
  headline:
    fontFamily: "\"Source Serif 4\", Georgia, serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "\"Source Serif 4\", Georgia, serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  page: "40px"
components:
  button-primary:
    backgroundColor: "{colors.sand-gold}"
    textColor: "{colors.ink-on-gold}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "9px 14px"
    height: "38px"
  button-secondary:
    backgroundColor: "{colors.panel-charcoal}"
    textColor: "{colors.ledger-ivory}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "9px 14px"
    height: "38px"
  input:
    backgroundColor: "{colors.control-charcoal}"
    textColor: "{colors.ledger-ivory}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "9px 10px"
    height: "38px"
  chip:
    backgroundColor: "{colors.panel-charcoal}"
    textColor: "{colors.muted-parchment}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  panel:
    backgroundColor: "{colors.panel-charcoal}"
    textColor: "{colors.ledger-ivory}"
    rounded: "{rounded.lg}"
    padding: "22px"
---

# Design System: Splitwiser

## 1. Overview

**Creative North Star: "The Warm Ledger"**

Splitwiser should feel like a carefully kept account book used after dinner or while reviewing a trip: calm charcoal paper, warm metallic markers, and exact figures that remain easy to scan. The interface is dark because the current product scene is personal financial review in mixed or low ambient light, where glare should stay low and balance states should remain distinct.

This is product UI, so design serves the task. Familiar controls, stable grids, restrained motion, and explicit labels take priority over spectacle. Editorial serif headings give the ledger a human voice, while Geist carries every control, label, and data-dense row. The system rejects generic fintech navy, neon crypto styling, decorative glass, oversized hero metrics, and card grids that turn every fact into a separate tile.

**Key Characteristics:**

- Warm, low-chroma charcoal surfaces with one sand-gold action voice.
- Clear mint and coral balance semantics that never rely on position alone.
- Serif section headings paired with compact sans-serif controls and figures.
- Flat rows and bounded panels, with depth reserved for navigation and dialogs.
- Desktop density that becomes structural, touch-safe layout below 1120px.

**The Ledger First Rule.** Every screen must answer a financial question before it adds decoration.

## 2. Colors

The palette resembles charcoal paper, parchment type, sand-gold tabs, mint credits, and coral debits. The OKLCH tokens in the frontmatter are normative and map directly to `src/styles.css`.

### Primary

- **Sand Gold:** Primary actions, active navigation, selected controls, month headings, and focused reconciliation states.
- **Deep Gold:** The darker endpoint of the primary-action gradient and restrained accent depth.
- **Ink on Gold:** High-contrast text and icons placed on gold selections or controls.

### Secondary

- **Balance Mint:** Money owed to the current user, completed states, successful synchronization, and constructive actions.
- **Balance Coral:** Money the current user owes, unresolved outflow, and negative synchronization states.
- **Error Rose:** Destructive actions and validation errors. It is not interchangeable with ordinary negative balances.

### Neutral

- **Ledger Charcoal:** The application canvas and deepest persistent surface.
- **Sidebar Charcoal:** The desktop navigation plane.
- **Panel Charcoal:** Bounded modules, dialogs, and primary content containers.
- **Row Charcoal:** Expense and activity rows that need a subtle layer above the canvas.
- **Raised Charcoal:** Hovered or selected neutral surfaces.
- **Control Charcoal:** Inputs, selects, textareas, and inset controls.
- **Ledger Ivory:** Primary headings, values, and high-priority copy.
- **Muted Parchment:** Supporting copy and secondary labels.
- **Quiet Taupe:** Dates, captions, helper text, and tertiary metadata.
- **Hairline:** Structural dividers and low-emphasis borders.

Trip artwork, country flags, the New York Statue of Liberty badge, and expense-category icons may use local palettes because they identify destinations or data categories rather than global UI meaning.

**The One Gold Voice Rule.** Sand Gold is reserved for actions, current selection, focus, and meaningful ledger emphasis. It is never ambient decoration.

**The Balance Meaning Rule.** Mint always means value returning to the user or a completed constructive state. Coral always means value leaving the user or an unresolved negative state.

## 3. Typography

**Display Font:** Source Serif 4 (with Georgia and serif fallbacks)

**Body Font:** Geist (with Apple system and Segoe UI fallbacks)

**Label/Mono Font:** Geist for labels; system monospace is reserved for sync keys and machine-readable values.

**Character:** Source Serif 4 makes trip and ledger headings feel considered without turning controls into editorial decoration. Geist keeps navigation, buttons, forms, tables, dates, and money legible at product density.

### Hierarchy

- **Display** (700, 42px, 1.1): Primary desktop page headings. Reduce to 32px below 680px.
- **Headline** (700, 30px, 1.2): Reconciliation introductions and major in-page sections.
- **Title** (700, 20px, 1.25): Dialog headings and compact module titles.
- **Body** (400, 14px, 1.6): Explanations, activity copy, and supporting content. Prose is capped near 62 to 70 characters.
- **Label** (700, 11px, 0.1em, uppercase): Eyebrows, dates, field labels, table headers, and metadata groups.

Money figures use the body family at 700 or 800 weight with tabular alignment implied through stable column widths. Labels never use the serif family.

**The Two Voices Rule.** Serif introduces a place or section. Sans-serif operates it. Never use the display face for buttons, form labels, navigation, or table data.

## 4. Elevation

The system is flat by default and establishes depth through tonal layering, one-pixel hairlines, and surface opacity. The desktop sidebar receives an ambient lateral shadow because it is a persistent navigation plane. Dialogs receive the strongest shadow because they interrupt and sit above the application. Ordinary panels and rows remain shadowless.

### Shadow Vocabulary

- **Navigation Ambient** (`18px 0 60px rgba(0, 0, 0, 0.28)`): Desktop sidebar only.
- **Dialog Lift** (`0 24px 80px rgba(0, 0, 0, 0.48)`): Modal dialogs above the scrim.
- **Destination Badge** (`0 5px 14px` with a destination-local translucent color): Country and city artwork only.
- **Status Halo** (`0 0 0 4px` with a semantic subtle color): Online-save status indicators only.

Backdrop blur is functional on persistent navigation and dialog scrims. It must not become decorative glassmorphism across content panels.

**The Flat by Default Rule.** If an ordinary expense, balance, or activity panel needs a shadow to separate it, fix its surface contrast or border first.

## 5. Components

### Buttons

Buttons are compact, firm, and familiar.

- **Shape:** Gently rounded rectangle (8px) with a 38px desktop minimum height and 44px touch minimum.
- **Primary:** Sand-to-deep-gold background, Ink on Gold text, 9px by 14px padding, and 700 weight.
- **Hover / Focus:** Hover brightens the gold range. Keyboard focus uses a 2px Sand Gold ring with 2px offset. Active state scales to 0.98 for 160ms.
- **Secondary:** Ledger Ivory text on a subtle panel tint with a Hairline border. Hover adds gold-tinted surface and emphasized border.
- **Link actions:** Success and danger variants use semantic text on transparent backgrounds and keep a 44px touch target.
- **Disabled:** Preserve the component shape at 48% opacity and use a not-allowed cursor.

Only one contextual Add Expense action appears on a page. The global action is omitted when the page already owns that command.

### Chips

- **Style:** Fully rounded (999px), Hairline border, Muted Parchment text, and compact 6px by 10px padding.
- **State:** Selected chips use Sand Gold fill, Ink on Gold text, and `aria-pressed`. Unselected chips remain neutral.
- **Quick split:** Group expenses expose a compact preset row for an equal split and one 100% share action per active member. A 100% action assigns the entire expense to that member and gives every other member a zero share; it never changes who originally paid.

### Cards / Containers

- **Corner Style:** 16px for primary panes and modules; 12px for compact status panels.
- **Background:** Panel Charcoal for bounded modules, Row Charcoal for repeated ledger entries, and transparent backgrounds for wide page shells.
- **Shadow Strategy:** No shadow at rest. Use the elevation vocabulary only for navigation, dialogs, destination badges, and status halos.
- **Border:** One-pixel Hairline boundaries. Never use a thick colored side stripe.
- **Internal Padding:** 22px for desktop modules, reduced structurally on compact screens.

Overview is deliberately not a card collection. It presents open balances and recent changes as direct sections, without a giant net-balance hero, duplicate quick actions, an Active Ledgers card, or instructional sidebar copy.

### Inputs / Fields

- **Style:** Control Charcoal background, Hairline border, 8px radius, Ledger Ivory value, and 9px by 10px padding.
- **Labels:** Uppercase Geist at 11px, 700 weight, and 0.08em to 0.1em tracking. Every visible label is programmatically associated with its control.
- **Focus:** A 2px soft Sand Gold outline with 1px offset.
- **Error / Disabled:** Validation errors use Error Rose text, border, and a low-opacity rose fill. Disabled controls remain readable and visibly unavailable.
- **Responsive:** Two-column field pairs stack below 680px. Controls become at least 44px high below 1120px.

### Navigation

Desktop uses a fixed 288px sidebar with 38px rows, subdued default labels, Sand Gold active states, and locally colored destination badges. Below 1120px the sidebar becomes a fixed six-item bottom navigation with a 44px minimum width and 52px minimum item height. The top bar retains the brand, the relevant global action, and a visible user avatar; the user name may hide below 680px.

### Dialogs

Dialogs are 480px maximum width, 16px rounded, and placed over a dark scrim. They use `role="dialog"`, an explicit title association, trapped keyboard focus, Escape dismissal, outside-click dismissal, body-scroll locking, and focus restoration. Footer actions align to the end and remain touch-safe.

### Expense Rows

Expense rows prioritize date, category icon, description, category and trip metadata, optional notes, then paid and lent figures. On screens below 680px they become a four-column grid: date and icon lead, description spans the remaining width, and the two figures form an aligned second line separated by a Hairline rule. Category remains visible on the description line.

### Online Save

Online persistence stays inline on All Expenses. Local, connecting, saving, synced, and error states use the existing neutral, gold, mint, and coral roles. Sync-key setup never interrupts the ledger with a modal.

Motion is limited to 160ms to 180ms state transitions. When `prefers-reduced-motion: reduce` is active, animations and transitions collapse to 0.01ms and smooth scrolling is disabled.

## 6. Do's and Don'ts

### Do:

- **Do** use Sand Gold for the current action, selected state, or keyboard focus.
- **Do** use Mint and Coral consistently for incoming and outgoing balance meaning.
- **Do** preserve visible categories and stable figure alignment in every expense-row layout.
- **Do** keep desktop controls at least 38px high and touch controls at least 44px high.
- **Do** use a single contextual Add Expense action per screen.
- **Do** keep trip flags, the New York Statue of Liberty, and category icons locally expressive.
- **Do** use semantic button variants, explicit form labels, progressbar semantics, focus trapping, and visible focus rings.
- **Do** adapt layout structurally at 1120px and 680px rather than shrinking type fluidly.

### Don't:

- **Don't** use generic fintech navy and gold, neon crypto styling, purple gradients, or decorative glassmorphism.
- **Don't** create a giant net-balance hero, duplicate quick actions, an Active Ledgers card, or instructional sidebar copy on Overview.
- **Don't** put every fact in an identical card or nest cards inside cards.
- **Don't** add a colored `border-left` or `border-right` thicker than 1px as an accent.
- **Don't** use gradient text, ornamental blur, bounce motion, or orchestrated page-load animation.
- **Don't** use Source Serif 4 for controls, labels, navigation, or dense financial data.
- **Don't** hide category context to make an expense row fit. Reflow the row instead.
- **Don't** open a modal when an inline status, setup panel, or progressive disclosure pattern can finish the task.
- **Don't** invent color-named button variants. Use primary, secondary, success-link, danger-link, or utility roles.
