# Warm Ledger Design System

Splitwiser should feel like a carefully kept travel notebook: warm, legible, restrained, and dependable. Financial meaning has priority over decoration.

## Foundation

- Warm charcoal surfaces with parchment text and a muted gold accent
- Green for money owed to the signed-in person; warm red for money they owe
- Serif display type for page titles; Geist for labels, controls, and dense financial content
- Continuous ledger rows for transaction-heavy screens; use containers only where hierarchy benefits
- Destination-aware group icons may vary by group type, but public source assets remain generic and synthetic

## Interaction

- Minimum 44 px touch targets on compact mobile layouts
- Visible keyboard focus on every interactive control
- Dialog focus is trapped and returned to the trigger
- Do not rely on hover to reveal necessary actions
- Reduced-motion preferences disable nonessential transitions
- Offline, empty, conflict, loading, and read-only states use plain language and preserve the next safe action

## Layout

At 320 px and 390 px, primary actions remain reachable without horizontal scrolling. The mobile Add action is central and visually distinct. Dense reconciliation controls belong only in the advanced owner workspace; the default review surface presents one decision at a time.

## Content

Say “You owe,” “Owes you,” “Paid by,” and “Your share” instead of exposing accounting jargon. Explain why a control is unavailable. Never display raw account identifiers, Blob paths, session tokens, or OCR text.
