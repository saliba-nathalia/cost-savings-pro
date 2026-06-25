## Scope

Expand the Outcomes Calculator with three new Cost Savings use cases, a centralized Benchmark Library, dynamic input rendering, and a shared Workforce Engine that aggregates time savings across all selected use cases.

## 1. Use case model

Extend `UseCaseKey`:

```
"automation" | "phone_to_messaging" | "staffing"
| "agent_assist" | "repeat_contact" | "transfer_reduction"
```

Add to `USE_CASE_LABELS` and the Step 01 picker, grouped under a **💰 Cost Savings** category with an icon per card (Lightbulb = Agent Assist, TrendingDown = Repeat Contact, Share2/GitBranch = Transfer Reduction). Existing 3 keep their current icons; the category badge "Cost Savings" appears on all six cards.

## 2. Centralized Benchmark Library

Move all defaults into one `BENCHMARK_LIBRARY` constant alongside the existing `INDUSTRY_BENCHMARKS` so they're updated in one place:

```ts
export const BENCHMARK_LIBRARY = {
  containmentRate: { ...industry-driven (existing) },
  deflectionRate: { ...industry-driven (existing) },
  ahtByChannel:    { ...industry-driven (existing) },
  agentAssistAhtReduction:  { value: 15, range: "10–20%", source: "McKinsey/Gartner GenAI in CX, 2024" },
  agentAssistDocReduction:  { value: 40, range: "30–50%", source: "Salesforce State of Service 2024" },
  agentAssistKnowledgeReduction: { value: 50, range: "40–60%", source: "Salesforce State of Service 2024" },
  repeatContactRate:  { value: 22, range: "15–30%", source: "CCW Digital, 2024 (FCR ~75–80%)" },
  repeatContactReduction: { value: 25, range: "20–35%", source: "Gartner FCR uplift via AI assist, 2024" },
  transferRate:           { value: 18, range: "10–25%", source: "ICMI Contact Center Benchmark, 2024" },
  transferReduction:      { value: 30, range: "20–40%", source: "Forrester routing optimization, 2024" },
  averageTransferTimeMin: { value: 2, range: "1–3 min", source: "ICMI Contact Center Benchmark, 2024" },
  qaAutomationTimeSavings:{ value: 70, range: "60–80%", source: "Observe.AI / Level AI vendor benchmarks, 2024" },
  waitTimeReduction:      { value: 25, range: "15–35%", source: "Zendesk CX Trends 2025" },
};
```

Each entry exposes `{ value, range, source, url? }` so the existing `BenchmarkBadge` + override popover work without changes. The Benchmark Library disclosure on Step 01 reads from this single object.

## 3. Dynamic input engine

Replace today's "always render all inputs" Step 02 with a render map. A `Field` is shown if **any** selected use case lists it:

```
sharedFields:
  annualVolume        → automation, p2m, staffing, agent_assist, repeat_contact, transfer_reduction
  aht                 → automation, staffing, agent_assist
  numberOfAgents      → staffing, agent_assist
  hourlyCost / costMode → automation, agent_assist, repeat_contact, transfer_reduction
  occupancy, shrinkage → staffing, agent_assist (Advanced)

automation: aiCost, softwareInvestment, containmentMode, resolutionRate / automationType
p2m: p2mPhoneVolume, p2mDeflection, p2mPhoneCost, p2mMessagingCost, p2mSoftware
staffing: voiceVolume, channel mix, useChannelAht + channel AHTs

agent_assist: ahtReductionPct, docTimeMin (opt), docReductionPct (opt),
              knowledgeTimeMin (opt), knowledgeReductionPct (opt),
              acwTimeMin (opt), acwReductionPct (opt)

repeat_contact: repeatRatePct, repeatReductionPct

transfer_reduction: transferRatePct, avgTransferMin, transferReductionPct
```

Implementation: a `visibleFields` Set computed from `useCases`. Each input block is wrapped in `{visibleFields.has("aht") && (...)}`. Inputs already used by another selected use case stay mounted (no duplication, no remount).

## 4. New calculations

```ts
agentAssistCalc = {
  ahtMinutesSaved = aht * (ahtReductionPct/100)
  docMinutesSaved = docTimeMin * (docReductionPct/100)
  knowledgeMinutesSaved = knowledgeTimeMin * (knowledgeReductionPct/100)
  acwMinutesSaved = acwTimeMin * (acwReductionPct/100)
  perInteractionMinutesSaved = sum above
  hoursSaved = annualVolume * perInteractionMinutesSaved / 60
  capacityFreedPct = perInteractionMinutesSaved / aht
  equivalentAgents = hoursSaved / productiveHoursPerAgent
  savings = hoursSaved * hourlyCost
}

repeatContactCalc = {
  repeatsToday = annualVolume * (repeatRatePct/100)
  repeatsEliminated = repeatsToday * (repeatReductionPct/100)
  hoursSaved = repeatsEliminated * aht / 60
  savings = costMode==="interaction"
            ? repeatsEliminated * humanCost
            : hoursSaved * hourlyCost
}

transferReductionCalc = {
  transfersToday = annualVolume * (transferRatePct/100)
  transfersEliminated = transfersToday * (transferReductionPct/100)
  minutesSaved = transfersEliminated * avgTransferMin
  hoursSaved = minutesSaved / 60
  savings = hoursSaved * hourlyCost
}
```

All three feed `scenarioDelta` like existing calcs.

## 5. Shared Workforce Engine

Replace today's "automation + p2m only" workforce math with an aggregator:

```
totalHoursSaved = (automation: aiResolved*weightedAht/60)
                + (p2m: p2mHoursSaved)
                + (agentAssist.hoursSaved)
                + (repeatContact.hoursSaved)
                + (transferReduction.hoursSaved)

productiveHoursPerAgent = 2080 * (1 - shrinkage) * occupancy
fteCapacityFreed = totalHoursSaved / productiveHoursPerAgent
equivalentAgentsFreed = fteCapacityFreed   // same number, labeled for execs
```

Each use case still reports its own `hoursSaved` for its summary card, but the aggregate Workforce row in the Executive Summary sums them once — no double counting. The existing `workforce` block stays for the staffing use case (required hours, baseline agents) and gains an "Aggregate freed capacity" row.

## 6. Executive Summary cards

Add per-use-case summary blocks in Step 03 following the existing pattern:

- Agent Assist: Hours Saved · Capacity Freed % · Equivalent Agents · Annual Savings
- Repeat Contact Reduction: Repeats Eliminated · Hours Saved · Annual Savings
- Transfer Reduction: Transfers Eliminated · Minutes Saved · Annual Savings

Each block only renders when its use case is selected. Findings bullets, copy-all text, and PDF rows mirror today's automation/p2m treatment.

## 7. PDF, copy, and chat context

- `exportPdf`: add a row per new use case in the summary table; the existing Sources & Assumptions appendix loops over the new Benchmark Library entries automatically.
- Copy-all text: append bullets per selected use case.
- `CalculatorChat` context: include the new inputs, benchmarks, and calc results so the assistant stays grounded.

## Out of scope

- No DB persistence changes.
- No header changes (Board Summary / Proposal / Theme already removed).
- No new icons beyond what `lucide-react` already exposes.

## Files touched

- `src/routes/index.tsx` (single file: types, library, state, calc memos, dynamic rendering, summary cards, PDF, chat context)
