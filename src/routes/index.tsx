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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Info, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Outcomes Calculator — Conversational AI & Contact Center" },
      {
        name: "description",
        content:
          "Executive Outcomes Calculator for Conversational AI and contact center automation. Model cost savings, payback period, and net benefit in real time.",
      },
      { property: "og:title", content: "Outcomes Calculator" },
    ],
  }),
  component: Index,
});

/* ---------- Constants & helpers ---------- */

type DataSource = "actual" | "assumption";
type SupportModel = "in_house" | "onshore" | "nearshore" | "offshore";
type CostMode = "interaction" | "hour";
type UseCaseKey = "automation" | "phone_to_messaging";
type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "BRL";
type AutomationType = "faq" | "api_1_3" | "api_3_5" | "api_5_8";

const HOURLY_DEFAULTS: Record<SupportModel, number> = {
  in_house: 25,
  onshore: 20,
  nearshore: 15,
  offshore: 10,
};

const SUPPORT_MODEL_LABEL: Record<SupportModel, string> = {
  in_house: "In-House",
  onshore: "Onshore",
  nearshore: "Nearshore",
  offshore: "Offshore",
};

const AUTOMATION_TYPES: Record<
  AutomationType,
  { label: string; range: [number, number]; mid: number }
> = {
  faq: { label: "FAQ Bot", range: [15, 20], mid: 17 },
  api_1_3: { label: "Integrations / APIs (1–3 APIs)", range: [30, 50], mid: 40 },
  api_3_5: { label: "Integrations / APIs (3–5 APIs)", range: [50, 60], mid: 55 },
  api_5_8: { label: "Integrations / APIs (5–8 APIs)", range: [70, 75], mid: 72 },
};

// Industry benchmark AHTs in minutes (used when channel-specific values not supplied)
const BENCHMARK_AHT = { voice: 8, email: 12, messaging: 6 };
const BENCHMARK_RANGE = {
  voice: "6–10 min",
  email: "10–15 min",
  messaging: "5–7 min",
};

const CURRENCIES: Record<
  CurrencyCode,
  { symbol: string; locale: string; label: string }
> = {
  USD: { symbol: "$", locale: "en-US", label: "USD ($)" },
  EUR: { symbol: "€", locale: "de-DE", label: "EUR (€)" },
  GBP: { symbol: "£", locale: "en-GB", label: "GBP (£)" },
  CAD: { symbol: "$", locale: "en-CA", label: "CAD ($)" },
  AUD: { symbol: "$", locale: "en-AU", label: "AUD ($)" },
  BRL: { symbol: "R$", locale: "pt-BR", label: "BRL (R$)" },
};

const makeFormatters = (code: CurrencyCode) => {
  const { locale, symbol } = CURRENCIES[code];
  const fmtCurrency = (n: number) =>
    isFinite(n)
      ? n.toLocaleString(locale, {
          style: "currency",
          currency: code,
          maximumFractionDigits: 0,
        })
      : "—";
  const fmtCurrency2 = (n: number) =>
    isFinite(n)
      ? n.toLocaleString(locale, {
          style: "currency",
          currency: code,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "—";
  const compactCurrency = (n: number) => {
    if (!isFinite(n)) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000_000)
      return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000)
      return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${symbol}${abs.toFixed(0)}`;
  };
  return { fmtCurrency, fmtCurrency2, compactCurrency };
};

const fmtPct = (n: number) =>
  isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";
const fmtNumber = (n: number) =>
  isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
const fmtMonths = (n: number) =>
  isFinite(n) && n > 0 ? `${n.toFixed(1)} mo` : "—";

/* ---------- Component ---------- */

function Index() {
  // Opportunity setup
  const [customerName, setCustomerName] = useState("");
  const [dealStage, setDealStage] = useState("Discovery");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [useCases, setUseCases] = useState<Set<UseCaseKey>>(
    new Set(["automation"]),
  );

  const hasAutomation = useCases.has("automation");
  const hasP2M = useCases.has("phone_to_messaging");

  const toggleUseCase = (k: UseCaseKey) => {
    setUseCases((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size > 1) next.delete(k);
      } else next.add(k);
      return next;
    });
  };

  // Data source
  const [dataSource, setDataSource] = useState<DataSource>("actual");

  // Baseline (shared)
  const [numberOfAgents, setNumberOfAgents] = useState(100);
  const [annualVolume, setAnnualVolume] = useState(1_000_000);
  const [voiceVolume, setVoiceVolume] = useState(600_000);
  const [phonePct, setPhonePct] = useState(60);
  const [messagingPct, setMessagingPct] = useState(30);
  const [emailPct, setEmailPct] = useState(10);
  const channelTotal = phonePct + messagingPct + emailPct;
  const channelValid = Math.abs(channelTotal - 100) < 0.01;

  // Cost per Human Agent
  const [costMode, setCostMode] = useState<CostMode>("interaction");
  const [costPerInteraction, setCostPerInteraction] = useState(6.0);
  const [supportModel, setSupportModel] = useState<SupportModel>("in_house");
  const [hourlyCost, setHourlyCost] = useState(HOURLY_DEFAULTS["in_house"]);
  const [aht, setAht] = useState(8);

  // Channel-specific AHTs (optional override of blended AHT for workforce modeling)
  const [useChannelAht, setUseChannelAht] = useState(false);
  const [voiceAht, setVoiceAht] = useState(BENCHMARK_AHT.voice);
  const [emailAht, setEmailAht] = useState(BENCHMARK_AHT.email);
  const [messagingAht, setMessagingAht] = useState(BENCHMARK_AHT.messaging);

  const derivedFromHourly = (hourlyCost / 60) * aht;
  const humanCost =
    costMode === "interaction" ? costPerInteraction : derivedFromHourly;

  // Automation use case
  const [aiCost, setAiCost] = useState(0.8);
  const [softwareInvestment, setSoftwareInvestment] = useState(320_000);
  const [containmentMode, setContainmentMode] = useState<"manual" | "guided">(
    "manual",
  );
  const [resolutionRate, setResolutionRate] = useState(40);
  const [automationType, setAutomationType] = useState<AutomationType>("api_1_3");
  const guidedContainment = AUTOMATION_TYPES[automationType].mid;
  const containment =
    containmentMode === "guided" ? guidedContainment : resolutionRate;

  // Phone-to-Messaging use case
  const [p2mPhoneVolume, setP2mPhoneVolume] = useState(600_000);
  const [p2mDeflection, setP2mDeflection] = useState(25); // % of phone shifted to messaging
  const [p2mPhoneCost, setP2mPhoneCost] = useState(6.0);
  const [p2mMessagingCost, setP2mMessagingCost] = useState(2.5);
  const [p2mSoftware, setP2mSoftware] = useState(120_000);

  // Advanced assumptions
  const [advOpen, setAdvOpen] = useState(false);
  const [occupancy, setOccupancy] = useState(80);
  const [shrinkage, setShrinkage] = useState(20);

  const onSupportModelChange = (m: SupportModel) => {
    setSupportModel(m);
    setHourlyCost(HOURLY_DEFAULTS[m]);
  };

  /* ---------- Calculations ---------- */

  const fmt = useMemo(() => makeFormatters(currency), [currency]);

  const automationCalc = useMemo(() => {
    if (!hasAutomation) return null;
    const volume = annualVolume;
    const rate = Math.min(containment, 100) / 100;
    const baseline = volume * humanCost;
    const aiResolved = volume * rate;
    const remainingHuman = volume - aiResolved;
    const aiAutomationCost = aiResolved * aiCost;
    const remainingHumanCost = remainingHuman * humanCost;
    const finalCost = aiAutomationCost + remainingHumanCost;
    const savings = baseline - finalCost;
    return {
      volume,
      rate,
      baseline,
      aiResolved,
      remainingHuman,
      aiAutomationCost,
      remainingHumanCost,
      finalCost,
      savings,
      software: softwareInvestment,
    };
  }, [hasAutomation, annualVolume, containment, humanCost, aiCost, softwareInvestment]);

  const p2mCalc = useMemo(() => {
    if (!hasP2M) return null;
    const shifted = p2mPhoneVolume * (p2mDeflection / 100);
    const baseline = p2mPhoneVolume * p2mPhoneCost;
    const finalCost =
      (p2mPhoneVolume - shifted) * p2mPhoneCost + shifted * p2mMessagingCost;
    const savings = baseline - finalCost;
    return {
      shifted,
      baseline,
      finalCost,
      savings,
      software: p2mSoftware,
    };
  }, [hasP2M, p2mPhoneVolume, p2mDeflection, p2mPhoneCost, p2mMessagingCost, p2mSoftware]);

  // ---- Workforce model (channel-specific when channel AHTs are provided) ----
  const workforce = useMemo(() => {
    // Total annual workload volume (use automation volume if present, else voice volume)
    const totalVolume = hasAutomation ? annualVolume : voiceVolume;
    const phoneVol = totalVolume * (phonePct / 100);
    const msgVol = totalVolume * (messagingPct / 100);
    const emailVol = totalVolume * (emailPct / 100);

    // Workload hours per channel
    let voiceHours: number;
    let emailHours: number;
    let msgHours: number;
    if (useChannelAht) {
      voiceHours = (phoneVol * voiceAht) / 60;
      emailHours = (emailVol * emailAht) / 60;
      msgHours = (msgVol * messagingAht) / 60;
    } else {
      voiceHours = (phoneVol * aht) / 60;
      emailHours = (emailVol * aht) / 60;
      msgHours = (msgVol * aht) / 60;
    }
    const requiredHours = voiceHours + emailHours + msgHours;

    // Productive hours per agent / year
    // 52 weeks × 40 hrs = 2080 paid hours; productive = paid × (1-shrinkage) × occupancy
    const productiveHoursPerAgent =
      2080 * (1 - shrinkage / 100) * (occupancy / 100);

    const baselineRequiredAgents =
      productiveHoursPerAgent > 0 ? requiredHours / productiveHoursPerAgent : 0;

    // Post-automation: subtract interactions deflected (use channel-weighted AHT)
    const weightedAht = useChannelAht
      ? ((phonePct * voiceAht + messagingPct * messagingAht + emailPct * emailAht) /
          (phonePct + messagingPct + emailPct || 1))
      : aht;
    const aiResolved = automationCalc?.aiResolved ?? 0;
    const p2mShifted = p2mCalc?.shifted ?? 0;
    // P2M shifts voice to messaging — model time saved on the differential
    const p2mHoursSaved = useChannelAht
      ? (p2mShifted * Math.max(0, voiceAht - messagingAht)) / 60
      : 0;
    const postHours = Math.max(
      0,
      requiredHours - (aiResolved * weightedAht) / 60 - p2mHoursSaved,
    );
    const postRequiredAgents =
      productiveHoursPerAgent > 0 ? postHours / productiveHoursPerAgent : 0;

    const fteFreed = Math.max(0, baselineRequiredAgents - postRequiredAgents);
    const hoursFreed = Math.max(0, requiredHours - postHours);

    return {
      voiceHours,
      emailHours,
      msgHours,
      requiredHours,
      productiveHoursPerAgent,
      baselineRequiredAgents,
      postRequiredAgents,
      fteFreed,
      hoursFreed,
      usedChannelAht: useChannelAht,
    };
  }, [
    hasAutomation,
    annualVolume,
    voiceVolume,
    phonePct,
    messagingPct,
    emailPct,
    useChannelAht,
    voiceAht,
    emailAht,
    messagingAht,
    aht,
    occupancy,
    shrinkage,
    automationCalc,
    p2mCalc,
  ]);


  const total = useMemo(() => {
    const baseline = (automationCalc?.baseline ?? 0) + (p2mCalc?.baseline ?? 0);
    const finalCost =
      (automationCalc?.finalCost ?? 0) + (p2mCalc?.finalCost ?? 0);
    const savings = baseline - finalCost;
    const software = (automationCalc?.software ?? 0) + (p2mCalc?.software ?? 0);
    const netBenefit = savings - software;
    const roi = software > 0 ? savings / software : 0;
    const costReduction = baseline > 0 ? savings / baseline : 0;
    const paybackMonths = savings > 0 ? software / (savings / 12) : Infinity;
    return {
      baseline,
      finalCost,
      savings,
      software,
      netBenefit,
      roi,
      costReduction,
      paybackMonths,
    };
  }, [automationCalc, p2mCalc]);

  /* ---------- Executive summary ---------- */

  const advisorSummary = useMemo(() => {
    const lines: string[] = [];
    const ucLabel = [
      hasAutomation && "Automation",
      hasP2M && "Phone-to-Messaging",
    ]
      .filter(Boolean)
      .join(" + ");

    lines.push(
      `Use case scope: ${ucLabel}. Combined baseline operating cost of ${fmt.compactCurrency(total.baseline)} reduces to ${fmt.compactCurrency(total.finalCost)}, generating ${fmt.compactCurrency(total.savings)} in annual savings against ${fmt.compactCurrency(total.software)} of software investment. Projected ROI is ${total.roi.toFixed(1)}x with a payback period of approximately ${total.paybackMonths === Infinity ? "—" : total.paybackMonths.toFixed(1) + " months"}.`,
    );

    if (hasAutomation && automationCalc) {
      lines.push(
        `Automation: ${fmtNumber(automationCalc.volume)} interactions at ${containment.toFixed(0)}% containment deflects ${fmtNumber(automationCalc.aiResolved)} interactions; unit cost shifts from ${fmt.fmtCurrency2(humanCost)} (human) to ${fmt.fmtCurrency2(aiCost)} (AI) on resolved traffic. Annual savings: ${fmt.compactCurrency(automationCalc.savings)}.`,
      );
    }
    if (hasP2M && p2mCalc) {
      lines.push(
        `Phone-to-Messaging: shifting ${p2mDeflection}% of ${fmtNumber(p2mPhoneVolume)} phone interactions to messaging (${fmt.fmtCurrency2(p2mPhoneCost)} → ${fmt.fmtCurrency2(p2mMessagingCost)}) yields ${fmt.compactCurrency(p2mCalc.savings)} in annual savings.`,
      );
    }

    if (hasAutomation && containment > 30) {
      lines.push(
        "Containment above 30% generally requires integrations and APIs to enterprise systems (CRM, OMS, billing, identity).",
      );
    }
    if (hasAutomation && containment > 80) {
      lines.push(
        "This containment rate may not be realistic. To improve accuracy, we recommend reviewing customer intents, transcripts, integration requirements, AHT, and resolution rates.",
      );
      lines.push(
        "To provide better assumptions, ideally we would review customer intents, transcripts, API requirements, average handle times, and resolution complexity.",
      );
    }

    // Customer vs assumed inputs
    const customerInputs: string[] = [];
    const assumedInputs: string[] = [];
    if (dataSource === "actual") {
      customerInputs.push(
        `volume ${fmtNumber(annualVolume)}`,
        `human cost ${fmt.fmtCurrency2(humanCost)}`,
      );
    } else {
      assumedInputs.push(
        `human cost derived from ${SUPPORT_MODEL_LABEL[supportModel]} at ${fmt.fmtCurrency(hourlyCost)}/hr × ${aht} min AHT = ${fmt.fmtCurrency2(derivedFromHourly)}`,
      );
    }
    if (containmentMode === "guided") {
      assumedInputs.push(
        `containment ${guidedContainment}% (${AUTOMATION_TYPES[automationType].label})`,
      );
    } else if (hasAutomation) {
      customerInputs.push(`containment ${containment}%`);
    }
    assumedInputs.push(`occupancy ${occupancy}%, shrinkage ${shrinkage}%`);
    if (useChannelAht) {
      customerInputs.push(
        `channel AHTs (voice ${voiceAht}m, email ${emailAht}m, messaging ${messagingAht}m)`,
      );
    } else {
      assumedInputs.push(
        `blended AHT ${aht} min applied across all channels`,
      );
    }

    lines.push(
      `Customer-provided inputs: ${customerInputs.join("; ") || "none"}. Assumed inputs: ${assumedInputs.join("; ")}.`,
    );

    // Workforce narrative
    lines.push(
      useChannelAht
        ? `Staffing and capacity estimates were calculated using channel-specific workloads across voice, email, and messaging interactions, providing a more accurate representation of operational demand. Baseline required agents: ${workforce.baselineRequiredAgents.toFixed(0)}; post-automation required: ${workforce.postRequiredAgents.toFixed(0)}; FTE capacity freed: ${workforce.fteFreed.toFixed(0)} (${fmtNumber(workforce.hoursFreed)} productive hours).`
        : `Staffing and capacity estimates were calculated using a blended average handle time. Accuracy can be improved by providing channel-specific handling times. Baseline required agents: ${workforce.baselineRequiredAgents.toFixed(0)}; post-automation required: ${workforce.postRequiredAgents.toFixed(0)}; FTE capacity freed: ${workforce.fteFreed.toFixed(0)}.`,
    );
    if (!useChannelAht) {
      lines.push(
        "Workforce calculations use a blended AHT because channel-specific handling times were not provided.",
      );
    }

    // Confidence — weighted by quality of inputs
    let score = 0;
    if (dataSource === "actual") score += 2;
    if (containmentMode === "manual") score += 2;
    if (channelValid) score += 1;
    if (useChannelAht) score += 2;
    if (numberOfAgents > 0) score += 1;
    // occupancy/shrinkage are always set (defaults), small credit if customized
    if (occupancy !== 80 || shrinkage !== 20) score += 1;
    // Penalties
    if (containmentMode === "guided") score -= 1;
    if (dataSource === "assumption") score -= 1;

    const confidence = score >= 7 ? "High" : score >= 4 ? "Medium" : "Low";
    lines.push(
      `${confidence} Confidence. Based on data source (${dataSource === "actual" ? "customer data" : "assumptions"}), containment method (${containmentMode}), channel-mix validity (${channelValid ? "valid" : "invalid — totals " + channelTotal + "%"}), and AHT granularity (${useChannelAht ? "channel-specific" : "blended"}).`,
    );


    return lines;
  }, [
    hasAutomation,
    hasP2M,
    total,
    automationCalc,
    p2mCalc,
    containment,
    humanCost,
    aiCost,
    p2mDeflection,
    p2mPhoneVolume,
    p2mPhoneCost,
    p2mMessagingCost,
    dataSource,
    annualVolume,
    supportModel,
    hourlyCost,
    aht,
    derivedFromHourly,
    containmentMode,
    guidedContainment,
    automationType,
    occupancy,
    shrinkage,
    channelValid,
    channelTotal,
    fmt,
  ]);

  const exportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 56;
    let y = margin;
    const ucLabel = [
      hasAutomation && "Automation",
      hasP2M && "Phone-to-Messaging",
    ]
      .filter(Boolean)
      .join(" + ");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Outcomes Executive Summary", margin, y);
    y += 28;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(
      `${customerName || "Untitled Opportunity"}  ·  ${dealStage}  ·  ${ucLabel}  ·  ${currency}`,
      margin,
      y,
    );
    y += 24;
    doc.setTextColor(20);

    const kpis: [string, string][] = [
      ["Annual Savings", fmt.compactCurrency(total.savings)],
      ["ROI Multiple", `${total.roi.toFixed(1)}x`],
      ["Cost Reduction", fmtPct(total.costReduction)],
      ["Payback", fmtMonths(total.paybackMonths)],
    ];
    const colW = (pageW - margin * 2) / 4;
    kpis.forEach(([label, val], i) => {
      const x = margin + i * colW;
      doc.setDrawColor(220);
      doc.rect(x, y, colW - 8, 70);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(label.toUpperCase(), x + 10, y + 18);
      doc.setFontSize(16);
      doc.setTextColor(20);
      doc.setFont("helvetica", "bold");
      doc.text(val, x + 10, y + 48);
      doc.setFont("helvetica", "normal");
    });
    y += 96;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Outcomes Advisor", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    advisorSummary.forEach((p) => {
      const lines = doc.splitTextToSize(p, pageW - margin * 2);
      if (y + lines.length * 13 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(lines, margin, y);
      y += lines.length * 13 + 8;
    });

    y += 8;
    if (y > doc.internal.pageSize.getHeight() - 200) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Financial Breakdown", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const rows: [string, string][] = [
      ["Total Baseline Cost", fmt.fmtCurrency(total.baseline)],
      ["Total Final Cost", fmt.fmtCurrency(total.finalCost)],
      ["Total Annual Savings", fmt.fmtCurrency(total.savings)],
      ["Total Software Investment", fmt.fmtCurrency(total.software)],
      ["Net Benefit", fmt.fmtCurrency(total.netBenefit)],
    ];
    rows.forEach(([k, v]) => {
      doc.setTextColor(90);
      doc.text(k, margin, y);
      doc.setTextColor(20);
      doc.text(v, pageW - margin, y, { align: "right" });
      y += 16;
    });

    doc.save(
      `Outcomes-${(customerName || "summary").replace(/[^a-z0-9]+/gi, "-")}.pdf`,
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-sm bg-foreground" />
              <div>
                <div className="font-serif text-lg leading-none tracking-tight">
                  Outcomes Calculator
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
              Cost Savings Outcomes Model
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field
                  label="Deal Stage"
                  tooltip="Metadata. It appears in the PDF export header. It does not affect any calculations."
                >
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
                <Field label="Currency">
                  <Select
                    value={currency}
                    onValueChange={(v) => setCurrency(v as CurrencyCode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
                        <SelectItem key={c} value={c}>
                          {CURRENCIES[c].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Use Cases (select one or more)">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <UseCaseCard
                    active={hasAutomation}
                    title="Cost Savings / Automation"
                    desc="AI deflects interactions from human agents."
                    onClick={() => toggleUseCase("automation")}
                  />
                  <UseCaseCard
                    active={hasP2M}
                    title="Cost Savings / Phone to Messaging"
                    desc="Shift volume from voice to lower-cost messaging."
                    onClick={() => toggleUseCase("phone_to_messaging")}
                  />
                </div>
              </Field>
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

              {/* Baseline */}
              <SubHeader title="Baseline" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Number of Agents">
                  <NumberInput value={numberOfAgents} onChange={setNumberOfAgents} />
                </Field>
                {hasAutomation && (
                  <Field label="Annual Interaction Volume">
                    <NumberInput value={annualVolume} onChange={setAnnualVolume} />
                  </Field>
                )}
                {hasP2M && (
                  <Field label="Voice Volume (annual)">
                    <NumberInput value={voiceVolume} onChange={setVoiceVolume} />
                  </Field>
                )}
              </div>

              <Field label="Channel Mix (must total 100%)">
                <div className="grid grid-cols-3 gap-3">
                  <PctInput label="Phone %" value={phonePct} onChange={setPhonePct} />
                  <PctInput
                    label="Messaging %"
                    value={messagingPct}
                    onChange={setMessagingPct}
                  />
                  <PctInput label="Email %" value={emailPct} onChange={setEmailPct} />
                </div>
                <div
                  className={`mt-2 text-xs ${channelValid ? "text-muted-foreground" : "text-destructive"}`}
                >
                  Total: {channelTotal}%{" "}
                  {channelValid ? "" : "— channel mix must equal 100%"}
                </div>
              </Field>

              {/* Cost per Human Agent */}
              <SubHeader title="Cost per Human Agent" />
              <div className="flex flex-wrap gap-3">
                <RadioPill
                  active={costMode === "interaction"}
                  label="Cost per Interaction"
                  onClick={() => setCostMode("interaction")}
                />
                <RadioPill
                  active={costMode === "hour"}
                  label="Cost per Hour"
                  onClick={() => setCostMode("hour")}
                />
              </div>

              {costMode === "interaction" ? (
                <Field label={`Cost per Human Agent / Interaction (${currency})`}>
                  <NumberInput
                    value={costPerInteraction}
                    onChange={setCostPerInteraction}
                    step={0.01}
                  />
                </Field>
              ) : (
                <div className="space-y-4">
                  {dataSource === "assumption" && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label="Support Model">
                        <Select
                          value={supportModel}
                          onValueChange={(v) =>
                            onSupportModelChange(v as SupportModel)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(HOURLY_DEFAULTS) as SupportModel[]).map(
                              (m) => (
                                <SelectItem key={m} value={m}>
                                  {SUPPORT_MODEL_LABEL[m]} ({CURRENCIES[currency].symbol}
                                  {HOURLY_DEFAULTS[m]}/hr)
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={`Hourly Cost (${currency}) — override`}>
                        <NumberInput value={hourlyCost} onChange={setHourlyCost} />
                      </Field>
                    </div>
                  )}
                  {dataSource === "actual" && (
                    <Field label={`Hourly Cost (${currency})`}>
                      <NumberInput value={hourlyCost} onChange={setHourlyCost} />
                    </Field>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Average Handle Time (minutes)">
                      <NumberInput value={aht} onChange={setAht} step={0.1} />
                    </Field>
                    <div className="rounded-lg border border-border bg-secondary/60 px-4 py-3">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        Derived Cost per Interaction
                      </div>
                      <div className="mt-1 font-serif text-2xl tracking-tight">
                        {fmt.fmtCurrency2(derivedFromHourly)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        ({fmt.fmtCurrency(hourlyCost)}/hr ÷ 60) × {aht} min
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Automation use case inputs */}
              {hasAutomation && (
                <>
                  <SubHeader title="Automation Inputs" />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label={`Cost per AI Interaction (${currency})`}>
                      <NumberInput
                        value={aiCost}
                        onChange={setAiCost}
                        step={0.01}
                      />
                    </Field>
                    <Field label={`Software Investment / Annual (${currency})`}>
                      <NumberInput
                        value={softwareInvestment}
                        onChange={setSoftwareInvestment}
                      />
                    </Field>
                  </div>

                  <Field label="Containment / Resolution Rate">
                    <div className="flex flex-wrap gap-3">
                      <RadioPill
                        active={containmentMode === "manual"}
                        label="I know the rate"
                        onClick={() => setContainmentMode("manual")}
                      />
                      <RadioPill
                        active={containmentMode === "guided"}
                        label="Help me estimate"
                        onClick={() => setContainmentMode("guided")}
                      />
                    </div>
                  </Field>

                  {containmentMode === "manual" ? (
                    <Field label="Containment Rate (%)">
                      <NumberInput
                        value={resolutionRate}
                        onChange={setResolutionRate}
                      />
                    </Field>
                  ) : (
                    <Field label="What type of automation are you implementing?">
                      <Select
                        value={automationType}
                        onValueChange={(v) =>
                          setAutomationType(v as AutomationType)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(AUTOMATION_TYPES) as AutomationType[]).map(
                            (k) => (
                              <SelectItem key={k} value={k}>
                                {AUTOMATION_TYPES[k].label} —{" "}
                                {AUTOMATION_TYPES[k].range[0]}–
                                {AUTOMATION_TYPES[k].range[1]}%
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Assumed containment: {guidedContainment}%
                      </div>
                    </Field>
                  )}

                  {containment > 80 && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
                      Containment above 80% is uncommon. Complex customer inquiries
                      are typically better handled by human agents to protect
                      customer experience, CSAT, NPS, and resolution quality.
                    </div>
                  )}
                </>
              )}

              {/* P2M inputs */}
              {hasP2M && (
                <>
                  <SubHeader title="Phone-to-Messaging Inputs" />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Phone Volume (annual)">
                      <NumberInput
                        value={p2mPhoneVolume}
                        onChange={setP2mPhoneVolume}
                      />
                    </Field>
                    <Field label="% Shifted from Phone to Messaging">
                      <NumberInput
                        value={p2mDeflection}
                        onChange={setP2mDeflection}
                      />
                    </Field>
                    <Field label={`Cost per Phone Interaction (${currency})`}>
                      <NumberInput
                        value={p2mPhoneCost}
                        onChange={setP2mPhoneCost}
                        step={0.01}
                      />
                    </Field>
                    <Field label={`Cost per Messaging Interaction (${currency})`}>
                      <NumberInput
                        value={p2mMessagingCost}
                        onChange={setP2mMessagingCost}
                        step={0.01}
                      />
                    </Field>
                    <Field label={`Software Investment / Annual (${currency})`}>
                      <NumberInput value={p2mSoftware} onChange={setP2mSoftware} />
                    </Field>
                  </div>
                </>
              )}

              {/* Advanced */}
              <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3 text-left text-sm"
                  >
                    <span className="font-medium">Advanced Assumptions</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${advOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field
                      label="Occupancy (%)"
                      tooltip="Percentage of logged-in time agents spend handling customer interactions."
                    >
                      <NumberInput value={occupancy} onChange={setOccupancy} />
                    </Field>
                    <Field
                      label="Shrinkage (%)"
                      tooltip="Time unavailable due to breaks, meetings, training, coaching, PTO, and absenteeism."
                    >
                      <NumberInput value={shrinkage} onChange={setShrinkage} />
                    </Field>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Section>

            {/* Controls */}
            <Section title="Calculation Controls" eyebrow="03">
              <div className="flex flex-wrap gap-3">
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
                eyebrow="Outcomes Advisor"
                title="Auto-generated executive narrative"
              />
              <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
                {advisorSummary.map((p, i) => (
                  <p
                    key={i}
                    className={i === 0 ? "text-base text-foreground" : ""}
                  >
                    {p}
                  </p>
                ))}
              </div>
            </Panel>

            {/* KPIs */}
            <Panel>
              <PanelHeader eyebrow="Executive Summary" title="Total Outcomes" />
              <div className="grid grid-cols-2 gap-3">
                <Kpi
                  label="Annual Savings"
                  value={fmt.compactCurrency(total.savings)}
                />
                <Kpi label="ROI Multiple" value={`${total.roi.toFixed(1)}x`} />
                <Kpi label="Cost Reduction" value={fmtPct(total.costReduction)} />
                <Kpi label="Payback Period" value={fmtMonths(total.paybackMonths)} />
              </div>
            </Panel>

            {/* Breakdown */}
            <Panel>
              <PanelHeader
                eyebrow="Results Dashboard"
                title="Financial breakdown"
              />
              <dl className="divide-y divide-border">
                {hasAutomation && automationCalc && (
                  <>
                    <BreakdownRow
                      k="Automation — Baseline"
                      sub="Volume × Human Cost"
                      v={fmt.fmtCurrency(automationCalc.baseline)}
                    />
                    <BreakdownRow
                      k="Automation — Final Cost"
                      sub={`${fmtNumber(automationCalc.aiResolved)} AI-resolved`}
                      v={fmt.fmtCurrency(automationCalc.finalCost)}
                    />
                    <BreakdownRow
                      k="Automation — Savings"
                      v={fmt.fmtCurrency(automationCalc.savings)}
                      emphasis
                    />
                  </>
                )}
                {hasP2M && p2mCalc && (
                  <>
                    <BreakdownRow
                      k="Phone-to-Messaging — Baseline"
                      sub="Phone volume × phone cost"
                      v={fmt.fmtCurrency(p2mCalc.baseline)}
                    />
                    <BreakdownRow
                      k="Phone-to-Messaging — Final Cost"
                      sub={`${fmtNumber(p2mCalc.shifted)} shifted to messaging`}
                      v={fmt.fmtCurrency(p2mCalc.finalCost)}
                    />
                    <BreakdownRow
                      k="Phone-to-Messaging — Savings"
                      v={fmt.fmtCurrency(p2mCalc.savings)}
                      emphasis
                    />
                  </>
                )}
                <BreakdownRow
                  k="Total Annual Savings"
                  v={fmt.fmtCurrency(total.savings)}
                  emphasis
                />
                <BreakdownRow
                  k="Total Software Investment"
                  v={fmt.fmtCurrency(total.software)}
                />
                <BreakdownRow
                  k="Net Benefit"
                  sub="Savings − Software"
                  v={fmt.fmtCurrency(total.netBenefit)}
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
    </TooltipProvider>
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

function SubHeader({ title }: { title: string }) {
  return (
    <div className="pt-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <Separator className="mt-2" />
    </div>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Info"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
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

function PctInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <NumberInput value={value} onChange={onChange} />
    </div>
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

function UseCaseCard({
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
      className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
        active
          ? "border-foreground bg-secondary"
          : "border-border bg-card hover:bg-secondary/60"
      }`}
    >
      <Checkbox checked={active} className="mt-0.5" />
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}

function RadioPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:bg-secondary"
      }`}
    >
      {label}
    </button>
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
