# Splitwiser Design System

## Register

Product UI. The interface uses restrained warm neutrals, a sand-gold action accent, and semantic green/red states. Familiar controls and legible financial data take priority over decoration.

## Color roles

All shared colors live in `src/styles.css` under `:root` and use OKLCH.

- `--color-bg-*`: app, sidebar, panel, row, raised, control, inset, overlay, and interaction surfaces.
- `--color-text-*`: primary content, secondary copy, and tertiary metadata.
- `--color-border-*`: default structure and emphasized or selected boundaries.
- `--color-accent*`: brand emphasis, active navigation, and primary actions.
- `--color-positive*`: money owed to the user, completed states, and constructive actions.
- `--color-negative*`: money the user owes and outstanding balances.
- `--color-danger*`: destructive actions and validation errors.
- `--color-focus-ring*`: keyboard focus treatment.

Trip artwork, country flags, and expense-category icons keep local palettes because their colors identify specific destinations or data categories rather than global UI meaning.

## Buttons

Every standard button combines `.btn` with one semantic variant:

- `.btn-primary`: the main action in a section or dialog.
- `.btn-secondary`: supporting, cancel, and neutral actions.
- `.btn-link-success`: compact constructive actions such as recording a repayment.
- `.btn-link-danger`: compact destructive actions such as delete.
- `.tool-button`: square utility action using the secondary button tokens.

Button styling is controlled by the `--button-*` tokens in `:root`. Do not add color-named variants such as gold, orange, teal, or plain.

## Interaction

- Standard buttons are at least 38px high on desktop and 44px on touch layouts.
- Focus uses `--color-focus-ring`; selected states use accent background and border roles.
- Disabled opacity uses `--button-disabled-opacity`.

## Overview

Overview answers two questions: what balances are open, and what changed recently. It intentionally avoids a large net-balance hero, duplicate quick actions, an Active Ledgers card, and instructional sidebar copy. Those tasks remain available through Groups, Activity, and Settlements.
