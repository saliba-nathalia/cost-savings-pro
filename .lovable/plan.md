# Build Prompt: Collapsible Steps + Presentation-Friendly View

Enhance the Outcomes Calculator with two improvements. Frontend/presentation only — preserve all existing calculation logic, formulas, confidence scoring, and currency formatting.

## 1. Collapsible Step Sections (01 and 02)

Currently, once Step 03 (Results) becomes available, Steps 01 (Opportunity Setup) and 02 (Data Inputs) auto-collapse and can only be reopened by clicking "Edit". Change this so:

- Each completed step (01 and 02) shows a chevron/caret toggle in its header next to the summary chips.
- Users can freely expand or collapse 01 and 02 at any time, independent of which step is "active".
- Step 03 remains visible alongside expanded 01/02 — they coexist rather than replace each other.
- Default state when Step 03 first becomes available: both 01 and 02 collapsed (current behavior), but the toggle is now always visible and clickable.
- Smooth expand/collapse transition consistent with current Anthropic-minimalist styling (light gray dividers, generous whitespace).
- Editing a field in an expanded section recalculates results live in Step 03 — no "Save" or "Apply" required.

## 2. Presentation / Copy-to-Deck View

Add a button at the bottom of the Results section labeled **"Presentation View"** (or **"Copy to Deck"**) alongside the existing PDF export.

Clicking it opens a clean, slide-styled read-only summary optimized for copy-paste into PowerPoint, Google Slides, or Keynote:

- Opens in a modal/overlay (or a dedicated `/presentation` route — pick the simpler option) with a white background, large black typography, generous whitespace, no app chrome.
- Content is structured as discrete "slide-like" blocks the user can select and copy individually or all at once:
  1. **Title slide**: Client name, deal stage, currency, date.
  2. **Headline outcomes**: 2–4 large KPI tiles (annual savings, payback period, FTE freed, ROI %).
  3. **What we found**: plain-language summary paragraph.
  4. **What this means**: business impact paragraph.
  5. **Assumptions & confidence**: bullet list distinguishing customer-provided vs. assumed inputs, plus confidence level.
- Each block is a clean rectangular section with comfortable padding so a user can screenshot or select-and-copy a single block.
- Provide a **"Copy all"** button (copies formatted plain text / rich text to clipboard) and **"Copy as image"** is NOT required.
- Include a **"Back to Calculator"** button to return to the editable view.

### Editability on the deck — recommendation

True bi-directional editing inside PowerPoint/Google Slides is not possible without a custom add-in (out of scope). Instead, the Presentation View itself remains **live and editable** within the app: numeric KPI tiles and key inputs (volumes, AHT, containment %, hourly cost) are click-to-edit inline. The user can sit with the customer in the Presentation View, adjust assumptions live, and watch the KPIs recalc — without ever leaving the page or returning to the dense calculator UI. When done, they copy-paste the polished result into their deck.

- Inline-editable fields are visually subtle (dotted underline on hover) so the view still looks like a finished slide.
- All edits flow through the same state as the main calculator — closing Presentation View returns the user to Step 03 with all changes persisted.

## Constraints

- No new dependencies.
- Reuse existing formatting helpers (currency, percentage, confidence labels).
- Preserve Anthropic-style aesthetic: white bg, black type, light gray dividers, no gradients or bright colors.
- PDF export remains unchanged.
