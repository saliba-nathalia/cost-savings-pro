## Problem

When the user picks only **Workforce Sizing & Staffing** (third use case), the Executive Summary still renders the four financial KPI cards (Annual Savings, ROI Multiple, Cost Reduction, Payback Period) showing `$0 / 0.0x / 0.0% / —`. That math depends on automation or phone-to-messaging savings, which staffing alone doesn't produce — so the zeros read as a broken state.

The workforce/staffing data already has its own dedicated KPI row right below (Required Hours, Baseline Agents, FTE Freed), so the financial row is purely noise in this case.

## Change (frontend-only, no math edits)

Treat the financial KPI row as conditional: only show it when at least one revenue-impacting use case is selected (`hasAutomation || hasP2M`). When only `hasStaffing` is on, lead the Executive Summary with the workforce KPIs instead.

### 1. Executive Summary (Step 03), around line 1419

Wrap the 4-card financial KPI grid in `{(hasAutomation || hasP2M) && ( ... )}`. The existing headline + "What we found" copy already adapts to staffing-only, so no text changes needed.

The workforce KPI block at line 1505 (`hasStaffing && workforce`) stays as-is and becomes the primary KPI row when staffing-only is selected.

### 2. Presentation / Deck view

- Line ~2441 `DeckKpi` financial row: wrap in the same `(hasAutomation || hasP2M)` condition so the deck slide doesn't show $0 cards either.
- Line ~2249 copy-all text (`Annual Savings / ROI / Cost Reduction / Payback`): only append those bullets when a financial use case is active. Keep the workforce bullets unconditional when `workforce` exists.
- The workforce deck block at line 2506 already renders only when `workforce` exists — leaves it as the headline KPI row for staffing-only decks.

### 3. PDF export (line ~566, ~652)

Same conditional: skip the Annual Savings / ROI / Cost Reduction / Payback rows in the PDF summary table when neither automation nor P2M is selected. Keep workforce rows.

## Out of scope

- No changes to calculation logic, advisor headline/findings text, channel mix inputs, or workforce math.
- No changes to the input steps (01/02).
- "ROI Multiple" stays as the label everywhere it's shown — only its visibility changes.

## Files touched

- `src/routes/index.tsx` (single file, three conditional wraps + PDF/copy text guards)
