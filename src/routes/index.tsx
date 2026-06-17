import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI ROI Calculator — Conversational AI & Contact Center" },
      {
        name: "description",
        content:
          "Executive ROI calculator for Conversational AI and contact center automation. Model cost savings, payback period, and net benefit in real time.",
      },
      { property: "og:title", content: "AI ROI Calculator" },
      {
        property: "og:description",
        content:
          "Model cost savings, payback period, and net benefit for Conversational AI deployments.",
      },
    ],
  }),
  component: Index,
});

type DataSource = "actual" | "assumption";
type SupportModel = "in_house" | "onshore" | "offshore";

const HOURLY_DEFAULTS: Record<SupportModel, number> = {
  in_house: 20,
  onshore: 15,
  offshore: 10,
};

const SUPPORT_MODEL_LABEL: Record<SupportModel, string> = {
  in_house: "In-House",
  onshore: "Outsourced Onshore",
  offshore: "Outsourced Offshore",
};

const fmtCurrency = (n: number) =>
  isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "—";

const fmtCurrency2 = (n: number) =>
  isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";

const fmtPct = (n: number) =>
  isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";

const fmtNumber = (n: number) =>
  isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";

const fmtMonths = (n: number) =>
  isFinite(n) && n > 0 ? `${n.toFixed(1)} mo` : "—";

const compactCurrency = (n: number) => {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

function Index() {
  // Opportunity setup
  const [customerName, setCustomerName] = useState("");
  const [dealStage, setDealStage] = useState("Discovery");
  const [useCase] = useState("Cost Savings");

  // Mode
  const [dataSource, setDataSource] = useState<DataSource>("actual");

  // Actual data fields
  const [annualVolume, setAnnualVolume] = useState(1_000_000);
  const [humanCost, setHumanCost] = useState(6.0);
  const [aiCost, setAiCost] = useState(0.8);
  const [resolutionRate, setResolutionRate] = useState(40);
  const [softwareInvestment, setSoftwareInvestment] = useState(320_000);

  // Assumption mode
  const [supportModel, setSupportModel] = useState<SupportModel>("in_house");
  const [hourlyCost, setHourlyCost] = useState(HOURLY_DEFAULTS["in_house"]);
  const [aht, setAht] = useState(8); // minutes
  const [aVolume, setAVolume] = useState(1_000_000);
  const [aAiCost, setAAiCost] = useState(0.8);
  const [aResolutionRate, setAResolutionRate] = useState(40);
  const [aSoftwareInvestment, setASoftwareInvestment] = useState(320_000);

  const onModelChange = (m: SupportModel) => {
    setSupportModel(m);
    setHourlyCost(HOURLY_DEFAULTS[m]);
  };

  const derivedHumanCost = useMemo(
    () => (hourlyCost / 60) * aht,
    [hourlyCost, aht],
  );

  const inputs = useMemo(() => {
    if (dataSource === "actual") {
      return {
        volume: annualVolume,
        humanCost,
        aiCost,
        resolutionRate: resolutionRate / 100,
        software: softwareInvestment,
      };
    }
    return {
      volume: aVolume,
      humanCost: derivedHumanCost,
      aiCost: aAiCost,
      resolutionRate: aResolutionRate / 100,
      software: aSoftwareInvestment,
    };
  }, [
    dataSource,
    annualVolume,
    humanCost,
    aiCost,
    resolutionRate,
    softwareInvestment,
    aVolume,
    derivedHumanCost,
    aAiCost,
    aResolutionRate,
    aSoftwareInvestment,
  ]);

  const calc = useMemo(() => {
    const baseline = inputs.volume * inputs.humanCost;
    const aiResolved = inputs.volume * inputs.resolutionRate;
    const remainingHuman = inputs.volume - aiResolved;
    const aiAutomationCost = aiResolved * inputs.aiCost;
    const remainingHumanCost = remainingHuman * inputs.humanCost;
    const finalCost = aiAutomationCost + remainingHumanCost;
    const annualSavings = baseline - finalCost;
    const costReduction = baseline > 0 ? annualSavings / baseline : 0;
    const roi = inputs.software > 0 ? annualSavings / inputs.software : 0;
    const netBenefit = annualSavings - inputs.software;
    const monthlySavings = annualSavings / 12;
    const paybackMonths =
      monthlySavings > 0 ? inputs.software / monthlySavings : Infinity;

    return {
      baseline,
      aiResolved,
      remainingHuman,
      aiAutomationCost,
      remainingHumanCost,
      finalCost,
      annualSavings,
      costReduction,
      roi,
      netBenefit,
      monthlySavings,
      paybackMonths,
    };
  }, [inputs]);

  const advisorSummary = useMemo(() => {
    const sens5 = inputs.volume * 0.05 * (inputs.humanCost - inputs.aiCost);
    return [
      `Based on an annual volume of ${fmtNumber(inputs.volume)} interactions and a ${(inputs.resolutionRate * 100).toFixed(0)}% AI containment rate, approximately ${fmtNumber(calc.aiResolved)} interactions can be automated annually. Operating costs decrease from ${compactCurrency(calc.baseline)} to ${compactCurrency(calc.finalCost)}, generating annual savings of ${compactCurrency(calc.annualSavings)}. Based on a software investment of ${fmtCurrency(inputs.software)}, the projected ROI is ${calc.roi.toFixed(1)}x with a payback period of approximately ${calc.paybackMonths.toFixed(1)} months.`,
      `Main savings drivers: the ${(inputs.resolutionRate * 100).toFixed(0)}% containment rate displaces human-handled volume at ${fmtCurrency2(inputs.humanCost)} per interaction, replaced by AI at ${fmtCurrency2(inputs.aiCost)} — a ${fmtPct(1 - inputs.aiCost / Math.max(inputs.humanCost, 0.0001))} unit-cost reduction on resolved traffic.`,
      `Key assumptions: human cost per interaction ${fmtCurrency2(inputs.humanCost)}${dataSource === "assumption" ? ` (derived from ${SUPPORT_MODEL_LABEL[supportModel]} at ${fmtCurrency(hourlyCost)}/hr × ${aht} min AHT)` : ""}, AI cost per interaction ${fmtCurrency2(inputs.aiCost)}, software investment ${fmtCurrency(inputs.software)}.`,
      `Financial impact: ${compactCurrency(calc.annualSavings)} annual savings, ${compactCurrency(calc.netBenefit)} net benefit after software, ${fmtPct(calc.costReduction)} total cost reduction.`,
      `Sensitivity: each additional 5 percentage points of containment is worth approximately ${compactCurrency(sens5)} in annual savings at the current volume and unit costs.`,
    ];
  }, [inputs, calc, dataSource, supportModel, hourlyCost, aht]);

  const exportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 56;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("AI ROI Executive Summary", margin, y);
    y += 28;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(
      `${customerName || "Untitled Opportunity"}  ·  ${dealStage}  ·  ${useCase}`,
      margin,
      y,
    );
    y += 24;
    doc.setTextColor(20);

    const kpis: [string, string][] = [
      ["Annual Savings", compactCurrency(calc.annualSavings)],
      ["ROI Multiple", `${calc.roi.toFixed(1)}x`],
      ["Cost Reduction", fmtPct(calc.costReduction)],
      ["Payback", fmtMonths(calc.paybackMonths)],
    ];
    const colW = (pageW - margin * 2) / 4;
    kpis.forEach(([label, val], i) => {
      const x = margin + i * colW;
      doc.setDrawColor(220);
      doc.rect(x, y, colW - 8, 70);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(label.toUpperCase(), x + 10, y + 18);
      doc.setFontSize(18);
      doc.setTextColor(20);
      doc.setFont("helvetica", "bold");
      doc.text(val, x + 10, y + 48);
      doc.setFont("helvetica", "normal");
    });
    y += 96;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("ROI Advisor", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    advisorSummary.forEach((p) => {
      const lines = doc.splitTextToSize(p, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 13 + 8;
    });

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Financial Breakdown", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const rows: [string, string][] = [
      ["Baseline Cost", fmtCurrency(calc.baseline)],
      ["AI Automation Cost", fmtCurrency(calc.aiAutomationCost)],
      ["Remaining Human Cost", fmtCurrency(calc.remainingHumanCost)],
      ["Final Cost", fmtCurrency(calc.finalCost)],
      ["Annual Savings", fmtCurrency(calc.annualSavings)],
      ["Software Investment", fmtCurrency(inputs.software)],
      ["Net Benefit", fmtCurrency(calc.netBenefit)],
    ];
    rows.forEach(([k, v]) => {
      doc.setTextColor(90);
      doc.text(k, margin, y);
      doc.setTextColor(20);
      doc.text(v, pageW - margin, y, { align: "right" });
      y += 16;
    });

    doc.save(
      `ROI-${(customerName || "summary").replace(/[^a-z0-9]+/gi, "-")}.pdf`,
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-sm bg-foreground" />
            <div>
              <div className="font-serif text-lg leading-none tracking-tight">
                AI ROI Calculator
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Conversational AI & Contact Center Automation
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={exportPdf} className="rounded-full">
            Download Executive Summary
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pb-10 pt-16 lg:px-10 lg:pt-24">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Cost Savings ROI Model
          </p>
          <h1 className="mt-5 font-serif text-4xl leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Quantify the economic impact of Conversational AI.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            A boardroom-ready model for cost reduction, payback period, and net
            benefit across contact center automation deployments.
          </p>
        </div>
      </section>

      {/* Body */}
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 pb-24 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:px-10">
        {/* LEFT */}
        <div className="space-y-10">
          {/* Opportunity */}
          <Section title="Opportunity Setup" eyebrow="01">
            <Field label="Customer Name">
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Acme Corporation"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Deal Stage">
                <Select value={dealStage} onValueChange={setDealStage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Discovery", "Qualification", "Evaluation", "Proposal"].map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Use Case">
                <Select value={useCase}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cost Savings">Cost Savings</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          {/* Data source */}
          <Section title="Data Inputs" eyebrow="02">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Do you have actual customer data?
              </Label>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <ToggleCard
                  active={dataSource === "actual"}
                  title="Yes, use customer data"
                  desc="Plug in measured volumes and unit economics."
                  onClick={() => setDataSource("actual")}
                />
                <ToggleCard
                  active={dataSource === "assumption"}
                  title="No, use assumptions"
                  desc="Estimate from support model and AHT."
                  onClick={() => setDataSource("assumption")}
                />
              </div>
            </div>

            {dataSource === "actual" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Annual Interaction Volume">
                  <NumberInput value={annualVolume} onChange={setAnnualVolume} />
                </Field>
                <Field label="Cost Per Human Interaction ($)">
                  <NumberInput
                    value={humanCost}
                    onChange={setHumanCost}
                    step={0.01}
                  />
                </Field>
                <Field label="Cost Per AI Interaction ($)">
                  <NumberInput value={aiCost} onChange={setAiCost} step={0.01} />
                </Field>
                <Field label="Resolution / Containment Rate (%)">
                  <NumberInput
                    value={resolutionRate}
                    onChange={setResolutionRate}
                  />
                </Field>
                <Field label="Software Investment (Annual)">
                  <NumberInput
                    value={softwareInvestment}
                    onChange={setSoftwareInvestment}
                  />
                </Field>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Support Model">
                    <Select
                      value={supportModel}
                      onValueChange={(v) => onModelChange(v as SupportModel)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(HOURLY_DEFAULTS) as SupportModel[]).map(
                          (m) => (
                            <SelectItem key={m} value={m}>
                              {SUPPORT_MODEL_LABEL[m]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Hourly Cost ($)">
                    <NumberInput value={hourlyCost} onChange={setHourlyCost} />
                  </Field>
                  <Field label="Annual Interaction Volume">
                    <NumberInput value={aVolume} onChange={setAVolume} />
                  </Field>
                  <Field label="Average Handle Time (minutes)">
                    <NumberInput value={aht} onChange={setAht} step={0.1} />
                  </Field>
                  <Field label="Cost Per AI Interaction ($)">
                    <NumberInput
                      value={aAiCost}
                      onChange={setAAiCost}
                      step={0.01}
                    />
                  </Field>
                  <Field label="Resolution / Containment Rate (%)">
                    <NumberInput
                      value={aResolutionRate}
                      onChange={setAResolutionRate}
                    />
                  </Field>
                  <Field label="Software Investment (Annual)">
                    <NumberInput
                      value={aSoftwareInvestment}
                      onChange={setASoftwareInvestment}
                    />
                  </Field>
                </div>
                <div className="rounded-lg border border-border bg-secondary/60 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Derived Cost Per Human Interaction
                  </div>
                  <div className="mt-1 font-serif text-2xl tracking-tight">
                    {fmtCurrency2(derivedHumanCost)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    ({fmtCurrency(hourlyCost)}/hr ÷ 60) × {aht} min AHT
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* Assumptions display */}
          <Section title="Assumptions" eyebrow="03">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SubPanel title="Customer Inputs">
                <Row k="Annual Volume" v={fmtNumber(inputs.volume)} />
                <Row k="Human Cost / Interaction" v={fmtCurrency2(inputs.humanCost)} />
                <Row k="AI Cost / Interaction" v={fmtCurrency2(inputs.aiCost)} />
                <Row
                  k="Containment Rate"
                  v={`${(inputs.resolutionRate * 100).toFixed(1)}%`}
                />
                <Row k="Software Investment" v={fmtCurrency(inputs.software)} />
              </SubPanel>
              <SubPanel title="Assumptions Used">
                {dataSource === "assumption" ? (
                  <>
                    <Row k="Support Model" v={SUPPORT_MODEL_LABEL[supportModel]} />
                    <Row k="Hourly Cost" v={`${fmtCurrency(hourlyCost)}/hr`} />
                    <Row k="AHT" v={`${aht} min`} />
                    <Row
                      k="Derived Human Cost"
                      v={fmtCurrency2(derivedHumanCost)}
                    />
                    <Row
                      k="Resolution Rate"
                      v={`${aResolutionRate.toFixed(1)}%`}
                    />
                    <Row k="AI Cost / Interaction" v={fmtCurrency2(aAiCost)} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Using actual customer data. Switch to assumption mode to model
                    from support staffing.
                  </p>
                )}
              </SubPanel>
            </div>
          </Section>

          {/* Controls */}
          <Section title="Calculation Controls" eyebrow="04">
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setAnnualVolume(1_000_000);
                  setHumanCost(6);
                  setAiCost(0.8);
                  setResolutionRate(40);
                  setSoftwareInvestment(320_000);
                  setAVolume(1_000_000);
                  setAAiCost(0.8);
                  setAResolutionRate(40);
                  setASoftwareInvestment(320_000);
                  setAht(8);
                  onModelChange("in_house");
                }}
              >
                Reset to defaults
              </Button>
              <Button onClick={exportPdf}>Export PDF</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              All calculations update in real time as inputs change.
            </p>
          </Section>
        </div>

        {/* RIGHT */}
        <div className="space-y-8 lg:sticky lg:top-8 lg:self-start">
          {/* Advisor */}
          <Panel>
            <PanelHeader
              eyebrow="ROI Advisor"
              title="Auto-generated executive narrative"
            />
            <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
              {advisorSummary.map((p, i) => (
                <p key={i} className={i === 0 ? "text-base text-foreground" : ""}>
                  {p}
                </p>
              ))}
            </div>
          </Panel>

          {/* Executive Summary KPIs */}
          <Panel>
            <PanelHeader
              eyebrow="Executive Summary"
              title="Headline metrics"
            />
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Annual Savings" value={compactCurrency(calc.annualSavings)} />
              <Kpi label="ROI Multiple" value={`${calc.roi.toFixed(1)}x`} />
              <Kpi label="Cost Reduction" value={fmtPct(calc.costReduction)} />
              <Kpi label="Payback Period" value={fmtMonths(calc.paybackMonths)} />
            </div>
          </Panel>

          {/* Results Dashboard / Financial Breakdown */}
          <Panel>
            <PanelHeader
              eyebrow="Results Dashboard"
              title="Financial breakdown"
            />
            <dl className="divide-y divide-border">
              <BreakdownRow
                k="Baseline Cost"
                sub="Volume × Human Cost"
                v={fmtCurrency(calc.baseline)}
              />
              <BreakdownRow
                k="AI Automation Cost"
                sub={`${fmtNumber(calc.aiResolved)} resolved × ${fmtCurrency2(inputs.aiCost)}`}
                v={fmtCurrency(calc.aiAutomationCost)}
              />
              <BreakdownRow
                k="Remaining Human Cost"
                sub={`${fmtNumber(calc.remainingHuman)} interactions`}
                v={fmtCurrency(calc.remainingHumanCost)}
              />
              <BreakdownRow
                k="Final Cost"
                sub="AI + remaining human"
                v={fmtCurrency(calc.finalCost)}
                emphasis
              />
              <BreakdownRow
                k="Annual Savings"
                sub="Baseline − Final"
                v={fmtCurrency(calc.annualSavings)}
              />
              <BreakdownRow
                k="Software Investment"
                sub="Annual platform spend"
                v={fmtCurrency(inputs.software)}
              />
              <BreakdownRow
                k="Net Benefit"
                sub="Savings − Software"
                v={fmtCurrency(calc.netBenefit)}
                emphasis
              />
            </dl>
          </Panel>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 text-xs text-muted-foreground lg:px-10">
          Model assumes steady-state annual operations. Figures are estimates and
          should be validated with customer-specific data before contracting.
        </div>
      </footer>
    </div>
  );
}

/* ---------- Building blocks ---------- */

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <span className="text-xs font-medium tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </span>
        <h2 className="font-serif text-2xl tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

function ToggleCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card hover:bg-secondary"
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div
        className={`mt-1 text-xs ${
          active ? "text-background/70" : "text-muted-foreground"
        }`}
      >
        {desc}
      </div>
    </button>
  );
}

function SubPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-5">
      <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium tabular-nums text-foreground">{v}</span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 lg:p-8">
      {children}
    </div>
  );
}

function PanelHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </div>
      <h3 className="mt-2 font-serif text-2xl tracking-tight text-foreground">
        {title}
      </h3>
      <Separator className="mt-5" />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-serif text-3xl leading-none tracking-tight text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}

function BreakdownRow({
  k,
  sub,
  v,
  emphasis,
}: {
  k: string;
  sub?: string;
  v: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div>
        <div
          className={`text-sm ${emphasis ? "font-medium text-foreground" : "text-foreground/90"}`}
        >
          {k}
        </div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div
        className={`tabular-nums ${
          emphasis
            ? "font-serif text-xl tracking-tight text-foreground"
            : "text-sm font-medium text-foreground"
        }`}
      >
        {v}
      </div>
    </div>
  );
}
