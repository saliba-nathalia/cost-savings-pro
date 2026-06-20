import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Info, ChevronDown, Check, Pencil, X, Copy, Share2, Save, MessageSquare, Trash2, TrendingDown, BarChart3, Lightbulb } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

type DataSource = "actual" | "assumption" | null;
type SupportModel = "in_house" | "onshore" | "nearshore" | "offshore";
type CostMode = "interaction" | "hour";
type UseCaseKey = "automation" | "phone_to_messaging" | "staffing";
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

const USE_CASE_LABELS: Record<UseCaseKey, string> = {
  automation: "Automation",
  phone_to_messaging: "Phone-to-Messaging",
  staffing: "Workforce Sizing",
};

/* ---------- Component ---------- */

function Index() {
  /* ---------- State ---------- */
  // Step 01
  const [customerName, setCustomerName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [useCases, setUseCases] = useState<Set<UseCaseKey>>(new Set());

  const hasAutomation = useCases.has("automation");
  const hasP2M = useCases.has("phone_to_messaging");
  const hasStaffing = useCases.has("staffing");

  const toggleUseCase = (k: UseCaseKey) => {
    setUseCases((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // Step 02
  const [dataSource, setDataSource] = useState<DataSource>(null);

  // Shared baseline
  const [numberOfAgents, setNumberOfAgents] = useState(100);
  const [annualVolume, setAnnualVolume] = useState(1_000_000);
  const [voiceVolume, setVoiceVolume] = useState(600_000);
  const [phonePct, setPhonePct] = useState(60);
  const [messagingPct, setMessagingPct] = useState(30);
  const [emailPct, setEmailPct] = useState(10);
  const channelTotal = phonePct + messagingPct + emailPct;
  const channelValid = Math.abs(channelTotal - 100) < 0.01;

  // Cost per Human Agent (automation)
  const [costMode, setCostMode] = useState<CostMode>("interaction");
  const [costPerInteraction, setCostPerInteraction] = useState(6.0);
  const [supportModel, setSupportModel] = useState<SupportModel>("in_house");
  const [hourlyCost, setHourlyCost] = useState(HOURLY_DEFAULTS["in_house"]);
  const [aht, setAht] = useState(8);

  // Channel-specific AHTs (staffing)
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

  // P2M
  const [p2mPhoneVolume, setP2mPhoneVolume] = useState(600_000);
  const [p2mDeflection, setP2mDeflection] = useState(25);
  const [p2mPhoneCost, setP2mPhoneCost] = useState(6.0);
  const [p2mMessagingCost, setP2mMessagingCost] = useState(2.5);
  const [p2mSoftware, setP2mSoftware] = useState(120_000);

  // Advanced
  const [advOpen, setAdvOpen] = useState(false);
  const [occupancy, setOccupancy] = useState(80);
  const [shrinkage, setShrinkage] = useState(20);

  const onSupportModelChange = (m: SupportModel) => {
    setSupportModel(m);
    setHourlyCost(HOURLY_DEFAULTS[m]);
  };

  /* ---------- Step gating ---------- */
  const step01Complete = useCases.size > 0;
  const step02Ready = step01Complete && dataSource !== null;
  const [step1Open, setStep1Open] = useState(true);
  const [step2Open, setStep2Open] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);

  // Save-name dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState("");

  // Executive Summary inline editing
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryOverride, setSummaryOverride] = useState<{
    headline?: string;
    whatWeFound?: string[];
    whatThisMeans?: string;
  }>({});
  const [draftHeadline, setDraftHeadline] = useState("");
  const [draftFound, setDraftFound] = useState("");
  const [draftMeans, setDraftMeans] = useState("");

  const showStep3 = step02Ready;

  const handleContinueFromStep1 = () => {
    if (step01Complete) {
      setStep1Open(false);
      setStep2Open(true);
    }
  };
  const handleContinueFromStep2 = () => {
    if (step02Ready) setStep2Open(false);
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

  const workforce = useMemo(() => {
    if (!hasStaffing) return null;
    const totalVolume = hasAutomation ? annualVolume : voiceVolume;
    const phoneVol = totalVolume * (phonePct / 100);
    const msgVol = totalVolume * (messagingPct / 100);
    const emailVol = totalVolume * (emailPct / 100);

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
    const productiveHoursPerAgent =
      2080 * (1 - shrinkage / 100) * (occupancy / 100);
    const baselineRequiredAgents =
      productiveHoursPerAgent > 0 ? requiredHours / productiveHoursPerAgent : 0;

    const weightedAht = useChannelAht
      ? (phonePct * voiceAht + messagingPct * messagingAht + emailPct * emailAht) /
        (phonePct + messagingPct + emailPct || 1)
      : aht;
    const aiResolved = automationCalc?.aiResolved ?? 0;
    const p2mShifted = p2mCalc?.shifted ?? 0;
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
    hasStaffing,
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

  /* ---------- Executive summary (structured) ---------- */
  const advisor = useMemo(() => {
    const ucList = Array.from(useCases).map((k) => USE_CASE_LABELS[k]);

    // Headline (plain English)
    let headline = "";
    if (total.savings > 0 && total.software > 0) {
      headline = `You could save about ${fmt.compactCurrency(total.savings)} per year and recover your investment in roughly ${total.paybackMonths === Infinity ? "—" : total.paybackMonths.toFixed(1) + " months"}.`;
    } else if (total.savings > 0) {
      headline = `Your estimated annual savings are about ${fmt.compactCurrency(total.savings)}.`;
    } else if (hasStaffing && workforce) {
      headline = `Your contact center would need about ${workforce.baselineRequiredAgents.toFixed(0)} agents to handle today's workload.`;
    } else {
      headline = "Add a few more inputs to see your outcome.";
    }

    // What we found
    const whatWeFound: string[] = [];
    if (hasAutomation && automationCalc) {
      whatWeFound.push(
        `AI handles about ${fmtNumber(automationCalc.aiResolved)} of ${fmtNumber(automationCalc.volume)} interactions a year (${containment.toFixed(0)}% containment), saving ${fmt.compactCurrency(automationCalc.savings)}.`,
      );
    }
    if (hasP2M && p2mCalc) {
      whatWeFound.push(
        `Shifting ${p2mDeflection}% of phone calls to messaging saves ${fmt.compactCurrency(p2mCalc.savings)} a year.`,
      );
    }
    if (hasStaffing && workforce) {
      if (hasAutomation || hasP2M) {
        whatWeFound.push(
          `Staffing model: ${workforce.baselineRequiredAgents.toFixed(0)} agents needed today, ${workforce.postRequiredAgents.toFixed(0)} after automation — freeing ${workforce.fteFreed.toFixed(0)} FTE.`,
        );
      } else {
        whatWeFound.push(
          `Staffing model: about ${workforce.baselineRequiredAgents.toFixed(0)} agents needed to handle today's workload (~${fmtNumber(workforce.requiredHours)} productive hours/year).`,
        );
      }
    }

    // What this means
    let whatThisMeans = "";
    if (total.savings > 0 && total.software > 0) {
      whatThisMeans = `For every ${fmt.compactCurrency(total.software)} invested in software, you get back about ${fmt.compactCurrency(total.savings)} in annual savings — a ${total.roi.toFixed(1)}× return and a ${fmtPct(total.costReduction)} cost reduction overall.`;
    } else if (total.savings > 0) {
      whatThisMeans = `That's roughly a ${fmtPct(total.costReduction)} reduction in your annual contact center cost base.`;
    } else if (hasStaffing) {
      whatThisMeans = "Add automation or phone-to-messaging to model how those changes would reduce your staffing needs.";
    }
    if (hasAutomation && containment > 80) {
      whatThisMeans +=
        " Heads up: a containment rate above 80% is uncommon — complex cases usually still need a human to protect CSAT.";
    } else if (hasAutomation && containment > 30) {
      whatThisMeans +=
        " Reaching this containment level usually requires integrations with your CRM, OMS, billing, or identity systems.";
    }

    // What we assumed
    const customerInputs: string[] = [];
    const assumedInputs: string[] = [];
    if (dataSource === "actual") {
      if (hasAutomation) customerInputs.push(`Annual volume: ${fmtNumber(annualVolume)}`);
      if (hasP2M) customerInputs.push(`Phone volume: ${fmtNumber(p2mPhoneVolume)}`);
      customerInputs.push(`Human cost per interaction: ${fmt.fmtCurrency2(humanCost)}`);
    } else {
      assumedInputs.push(
        `Human cost from ${SUPPORT_MODEL_LABEL[supportModel]} (${fmt.fmtCurrency(hourlyCost)}/hr × ${aht} min AHT = ${fmt.fmtCurrency2(derivedFromHourly)})`,
      );
    }
    if (hasAutomation) {
      if (containmentMode === "guided") {
        assumedInputs.push(
          `Containment: ${guidedContainment}% (${AUTOMATION_TYPES[automationType].label})`,
        );
      } else {
        customerInputs.push(`Containment: ${containment}%`);
      }
    }
    if (hasStaffing) {
      assumedInputs.push(`Occupancy ${occupancy}%, shrinkage ${shrinkage}%`);
      if (useChannelAht) {
        customerInputs.push(
          `Channel AHTs — voice ${voiceAht}m, email ${emailAht}m, messaging ${messagingAht}m`,
        );
      } else {
        assumedInputs.push(`Blended AHT of ${aht} min across all channels`);
      }
    }

    // Confidence
    let score = 0;
    if (dataSource === "actual") score += 2;
    else score -= 1;
    if (hasAutomation) {
      if (containmentMode === "manual") score += 2;
      else score -= 1;
    }
    if (hasStaffing) {
      if (useChannelAht) score += 2;
      if (channelValid) score += 1;
      if (occupancy !== 80 || shrinkage !== 20) score += 1;
    }
    if (numberOfAgents > 0) score += 1;
    const level: "High" | "Medium" | "Low" =
      score >= 5 ? "High" : score >= 2 ? "Medium" : "Low";
    const confidenceExplanation =
      level === "High"
        ? "Most of your inputs are real customer data, so this estimate is reliable for planning."
        : level === "Medium"
          ? "A few key numbers are still assumptions — directionally right, worth validating before contracting."
          : "Many inputs are assumptions. Treat this as a rough starting point and refine with customer data.";

    return {
      headline,
      useCases: ucList,
      whatWeFound,
      whatThisMeans,
      customerInputs,
      assumedInputs,
      confidence: { level, explanation: confidenceExplanation },
    };
  }, [
    useCases,
    total,
    hasAutomation,
    hasP2M,
    hasStaffing,
    automationCalc,
    p2mCalc,
    workforce,
    containment,
    humanCost,
    aiCost,
    p2mDeflection,
    p2mPhoneVolume,
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
    useChannelAht,
    voiceAht,
    emailAht,
    messagingAht,
    numberOfAgents,
    fmt,
  ]);

  /* ---------- PDF Export ---------- */
  const exportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 56;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Outcomes Executive Summary", margin, y);
    y += 28;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(
      `${customerName || "Untitled Opportunity"}  ·  ${advisor.useCases.join(" + ") || "—"}  ·  ${currency}`,
      margin,
      y,
    );
    y += 24;
    doc.setTextColor(20);

    // Headline
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    const headLines = doc.splitTextToSize(advisor.headline, pageW - margin * 2);
    doc.text(headLines, margin, y);
    y += headLines.length * 18 + 12;

    // KPIs — financial only when an automation/P2M use case is selected
    const hasFinancial = hasAutomation || hasP2M;
    const kpis: [string, string][] = hasFinancial
      ? [
          ["Annual Savings", fmt.compactCurrency(total.savings)],
          ["ROI Multiple", `${total.roi.toFixed(1)}x`],
          ["Cost Reduction", fmtPct(total.costReduction)],
          ["Payback", fmtMonths(total.paybackMonths)],
        ]
      : workforce
      ? [
          ["Productive Hours", fmtNumber(workforce.requiredHours)],
          ["Baseline Agents", workforce.baselineRequiredAgents.toFixed(0)],
          ["Post-Automation", workforce.postRequiredAgents.toFixed(0)],
          ["FTE Freed", workforce.fteFreed.toFixed(0)],
        ]
      : [];
    if (kpis.length) {
      const colW = (pageW - margin * 2) / kpis.length;
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
    }

    const section = (title: string) => {
      if (y > doc.internal.pageSize.getHeight() - 120) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    };

    const writePara = (text: string) => {
      const lines = doc.splitTextToSize(text, pageW - margin * 2);
      if (y + lines.length * 13 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(lines, margin, y);
      y += lines.length * 13 + 6;
    };

    const writeBullets = (items: string[]) => {
      items.forEach((it) => writePara(`• ${it}`));
    };

    if (advisor.whatWeFound.length) {
      section("What we found");
      writeBullets(advisor.whatWeFound);
      y += 4;
    }
    if (advisor.whatThisMeans) {
      section("What this means");
      writePara(advisor.whatThisMeans);
      y += 4;
    }
    section("What we assumed");
    if (advisor.customerInputs.length) {
      doc.setFont("helvetica", "bold");
      doc.text("From your data:", margin, y);
      doc.setFont("helvetica", "normal");
      y += 14;
      writeBullets(advisor.customerInputs);
    }
    if (advisor.assumedInputs.length) {
      doc.setFont("helvetica", "bold");
      doc.text("Assumed defaults:", margin, y);
      doc.setFont("helvetica", "normal");
      y += 14;
      writeBullets(advisor.assumedInputs);
    }
    y += 4;
    section(`Confidence: ${advisor.confidence.level}`);
    writePara(advisor.confidence.explanation);

    y += 8;
    if (y > doc.internal.pageSize.getHeight() - 200) {
      doc.addPage();
      y = margin;
    }
    if (hasFinancial) {
      section("Financial Breakdown");
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
    }

    doc.save(
      `Outcomes-${(customerName || "summary").replace(/[^a-z0-9]+/gi, "-")}.pdf`,
    );
  };

  /* ---------- Snapshot / Save / Share / Comments ---------- */
  const snapshot = () => ({
    customerName, currency, useCases: Array.from(useCases),
    dataSource, numberOfAgents, annualVolume, voiceVolume,
    phonePct, messagingPct, emailPct,
    costMode, costPerInteraction, supportModel, hourlyCost, aht,
    useChannelAht, voiceAht, emailAht, messagingAht,
    aiCost, softwareInvestment, containmentMode, resolutionRate, automationType,
    p2mPhoneVolume, p2mDeflection, p2mPhoneCost, p2mMessagingCost, p2mSoftware,
    occupancy, shrinkage,
  });
  const applySnapshot = (s: any) => {
    if (!s || typeof s !== "object") return;
    const set = <T,>(v: T | undefined, fn: (x: T) => void) => {
      if (v !== undefined && v !== null) fn(v);
    };
    set(s.customerName, setCustomerName);
    set(s.currency, setCurrency);
    if (Array.isArray(s.useCases)) setUseCases(new Set(s.useCases));
    set(s.dataSource, setDataSource);
    set(s.numberOfAgents, setNumberOfAgents);
    set(s.annualVolume, setAnnualVolume);
    set(s.voiceVolume, setVoiceVolume);
    set(s.phonePct, setPhonePct);
    set(s.messagingPct, setMessagingPct);
    set(s.emailPct, setEmailPct);
    set(s.costMode, setCostMode);
    set(s.costPerInteraction, setCostPerInteraction);
    set(s.supportModel, setSupportModel);
    set(s.hourlyCost, setHourlyCost);
    set(s.aht, setAht);
    set(s.useChannelAht, setUseChannelAht);
    set(s.voiceAht, setVoiceAht);
    set(s.emailAht, setEmailAht);
    set(s.messagingAht, setMessagingAht);
    set(s.aiCost, setAiCost);
    set(s.softwareInvestment, setSoftwareInvestment);
    set(s.containmentMode, setContainmentMode);
    set(s.resolutionRate, setResolutionRate);
    set(s.automationType, setAutomationType);
    set(s.p2mPhoneVolume, setP2mPhoneVolume);
    set(s.p2mDeflection, setP2mDeflection);
    set(s.p2mPhoneCost, setP2mPhoneCost);
    set(s.p2mMessagingCost, setP2mMessagingCost);
    set(s.p2mSoftware, setP2mSoftware);
    set(s.occupancy, setOccupancy);
    set(s.shrinkage, setShrinkage);
    if (s.customerName && s.useCases?.length) {
      setStep1Open(false);
      setStep2Open(false);
    }
  };

  // Hydrate from URL hash on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const m = hash.match(/[#&]s=([^&]+)/);
    if (!m) return;
    try {
      const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))));
      applySnapshot(JSON.parse(json));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [savedList, setSavedList] = useState<{ name: string; ts: number }[]>([]);
  const [saveMsg, setSaveMsg] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("outcomes-saves-index");
      if (raw) setSavedList(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  const performSave = (rawName: string) => {
    try {
      const name = rawName.trim();
      if (!name) return false;
      const ts = Date.now();
      const key = `outcomes-save-${name}`;
      localStorage.setItem(key, JSON.stringify(snapshot()));
      const next = [
        { name, ts },
        ...savedList.filter((s) => s.name !== name),
      ].slice(0, 20);
      localStorage.setItem("outcomes-saves-index", JSON.stringify(next));
      setSavedList(next);
      setSaveMsg(`Saved “${name}”`);
      setTimeout(() => setSaveMsg(""), 2200);
      return true;
    } catch {
      setSaveMsg("Could not save");
      setTimeout(() => setSaveMsg(""), 2200);
      return false;
    }
  };
  const handleSave = () => {
    if (customerName.trim()) {
      performSave(customerName);
    } else {
      setSaveDialogName("");
      setSaveDialogOpen(true);
    }
  };
  const confirmSaveDialog = () => {
    const name = saveDialogName.trim();
    if (!name) return;
    setCustomerName(name);
    if (performSave(name)) setSaveDialogOpen(false);
  };
  const handleLoad = (name: string) => {
    try {
      const raw = localStorage.getItem(`outcomes-save-${name}`);
      if (raw) applySnapshot(JSON.parse(raw));
    } catch { /* ignore */ }
  };
  const handleDeleteSave = (name: string) => {
    localStorage.removeItem(`outcomes-save-${name}`);
    const next = savedList.filter((s) => s.name !== name);
    localStorage.setItem("outcomes-saves-index", JSON.stringify(next));
    setSavedList(next);
  };
  const handleShare = async () => {
    try {
      const json = JSON.stringify(snapshot());
      const b64 = btoa(unescape(encodeURIComponent(json)));
      const url = `${window.location.origin}${window.location.pathname}#s=${encodeURIComponent(b64)}`;
      await navigator.clipboard.writeText(url);
      setShareMsg("Share link copied");
    } catch {
      setShareMsg("Could not copy link");
    }
    setTimeout(() => setShareMsg(""), 2200);
  };

  // Comments — scoped to customer name, persisted in localStorage
  type Comment = { id: string; author: string; text: string; ts: number };
  const commentsKey = `outcomes-comments-${customerName.trim() || "_default"}`;
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentText, setCommentText] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(commentsKey);
      setComments(raw ? JSON.parse(raw) : []);
    } catch {
      setComments([]);
    }
  }, [commentsKey]);
  const addComment = () => {
    const text = commentText.trim();
    if (!text) return;
    const next: Comment[] = [
      ...comments,
      {
        id: Math.random().toString(36).slice(2),
        author: commentAuthor.trim() || "Anonymous",
        text,
        ts: Date.now(),
      },
    ];
    setComments(next);
    localStorage.setItem(commentsKey, JSON.stringify(next));
    setCommentText("");
  };
  const removeComment = (id: string) => {
    const next = comments.filter((c) => c.id !== id);
    setComments(next);
    localStorage.setItem(commentsKey, JSON.stringify(next));
  };

  /* ---------- Render ---------- */
  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5 lg:px-10">
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleSave} className="rounded-full gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {saveMsg || "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare} className="rounded-full gap-1.5">
                <Share2 className="h-3.5 w-3.5" />
                {shareMsg || "Share"}
              </Button>
              {showStep3 && (
                <Button variant="outline" size="sm" onClick={exportPdf} className="rounded-full">
                  Download PDF
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 pb-12 pt-16 lg:px-10 lg:pt-20">
          <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-foreground md:text-5xl">
            Quantify the economic impact of Conversational AI.
          </h1>
        </section>

        {/* Single-column wizard */}
        <main className="mx-auto max-w-4xl space-y-8 px-6 pb-24 lg:px-10">
          {/* Step 01 */}
          <Section
            title="Opportunity Setup"
            eyebrow="01"
            collapsible={step01Complete}
            open={step1Open}
            onToggle={() => setStep1Open((o) => !o)}
            summary={
              step01Complete
                ? `${customerName || "Untitled"} · ${currency} · ${advisor.useCases.join(" + ")}`
                : undefined
            }
            complete={step01Complete}
          >
            <Field
              label="Customer Name"
              tooltip="Optional for running the calculator. Required when saving a scenario."
            >
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Acme Corporation (optional)"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <div className="grid grid-cols-1 gap-3">
                <UseCaseCard
                  active={hasAutomation}
                  icon={<TrendingDown className="h-4 w-4" />}
                  category="Cost reduction"
                  title="Cost Savings / Automation"
                  desc="AI deflects interactions from human agents."
                  onClick={() => toggleUseCase("automation")}
                />
                <UseCaseCard
                  active={hasP2M}
                  icon={<TrendingDown className="h-4 w-4" />}
                  category="Cost reduction"
                  title="Cost Savings / Phone to Messaging"
                  desc="Shift volume from voice to lower-cost messaging."
                  onClick={() => toggleUseCase("phone_to_messaging")}
                />
                <UseCaseCard
                  active={hasStaffing}
                  icon={<BarChart3 className="h-4 w-4" />}
                  category="Analysis"
                  title="Workforce Sizing & Staffing Analysis"
                  desc="Current-state contact center sizing using AHT, occupancy, and shrinkage. Not for ROI or savings — combine with other use cases to model efficiencies."
                  onClick={() => toggleUseCase("staffing")}
                />
              </div>
            </Field>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleContinueFromStep1}
                disabled={!step01Complete}
              >
                Continue
              </Button>
            </div>
          </Section>

          {/* Step 02 */}
          {step01Complete && (
            <Section
              title="Data Inputs"
              eyebrow="02"
              collapsible={step02Ready}
              open={step2Open}
              onToggle={() => setStep2Open((o) => !o)}
              summary={
                step02Ready
                  ? dataSource === "actual"
                    ? "Using customer data"
                    : "Using assumptions"
                  : undefined
              }
              complete={step02Ready}
            >
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

              {dataSource !== null && (
                <div className="space-y-6 pt-2">
                  {/* Volume — only what's needed */}
                  {(hasAutomation || hasStaffing || hasP2M) && (
                    <>
                      <SubHeader title="Volume" />
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {hasAutomation && (
                          <Field label="Annual Interaction Volume">
                            <NumberInput
                              value={annualVolume}
                              onChange={setAnnualVolume}
                            />
                          </Field>
                        )}
                        {hasP2M && (
                          <Field label="Phone Volume (annual)">
                            <NumberInput
                              value={p2mPhoneVolume}
                              onChange={setP2mPhoneVolume}
                            />
                          </Field>
                        )}
                        {hasStaffing && !hasAutomation && (
                          <Field label="Total Annual Volume">
                            <NumberInput
                              value={voiceVolume}
                              onChange={setVoiceVolume}
                            />
                          </Field>
                        )}
                        {hasStaffing && (
                          <Field label="Number of Agents">
                            <NumberInput
                              value={numberOfAgents}
                              onChange={setNumberOfAgents}
                            />
                          </Field>
                        )}
                      </div>
                    </>
                  )}

                  {/* Channel mix — only when staffing */}
                  {hasStaffing && (
                    <Field label="Channel Mix (must total 100%)">
                      <div className="grid grid-cols-3 gap-3">
                        <PctInput
                          label="Phone %"
                          value={phonePct}
                          onChange={setPhonePct}
                        />
                        <PctInput
                          label="Messaging %"
                          value={messagingPct}
                          onChange={setMessagingPct}
                        />
                        <PctInput
                          label="Email %"
                          value={emailPct}
                          onChange={setEmailPct}
                        />
                      </div>
                      <div
                        className={`mt-2 text-xs ${channelValid ? "text-muted-foreground" : "text-destructive"}`}
                      >
                        Total: {channelTotal}%{" "}
                        {channelValid ? "" : "— channel mix must equal 100%"}
                      </div>
                    </Field>
                  )}

                  {/* Cost per Human Agent — only for automation */}
                  {hasAutomation && (
                    <>
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
                        <Field
                          label={`Cost per Human Agent / Interaction (${currency})`}
                        >
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
                                          {SUPPORT_MODEL_LABEL[m]} (
                                          {CURRENCIES[currency].symbol}
                                          {HOURLY_DEFAULTS[m]}/hr)
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field
                                label={`Hourly Cost (${currency}) — override`}
                              >
                                <NumberInput
                                  value={hourlyCost}
                                  onChange={setHourlyCost}
                                />
                              </Field>
                            </div>
                          )}
                          {dataSource === "actual" && (
                            <Field label={`Hourly Cost (${currency})`}>
                              <NumberInput
                                value={hourlyCost}
                                onChange={setHourlyCost}
                              />
                            </Field>
                          )}
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Field label="Average Handle Time (minutes)">
                              <NumberInput
                                value={aht}
                                onChange={setAht}
                                step={0.1}
                              />
                            </Field>
                            <div className="rounded-lg border border-border bg-secondary/60 px-4 py-3">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                Derived Cost per Interaction
                              </div>
                              <div className="mt-1 font-serif text-2xl tracking-tight">
                                {fmt.fmtCurrency2(derivedFromHourly)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                ({fmt.fmtCurrency(hourlyCost)}/hr ÷ 60) × {aht}{" "}
                                min
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Automation-only inputs */}
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
                        <Field
                          label={`Software Investment / Annual (${currency})`}
                        >
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
                          Containment above 80% is uncommon. Complex inquiries
                          are typically better handled by human agents to
                          protect CSAT, NPS, and resolution quality.
                        </div>
                      )}
                    </>
                  )}

                  {/* P2M inputs */}
                  {hasP2M && (
                    <>
                      <SubHeader title="Phone-to-Messaging Inputs" />
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="% Shifted from Phone to Messaging">
                          <NumberInput
                            value={p2mDeflection}
                            onChange={setP2mDeflection}
                          />
                        </Field>
                        <Field
                          label={`Cost per Phone Interaction (${currency})`}
                        >
                          <NumberInput
                            value={p2mPhoneCost}
                            onChange={setP2mPhoneCost}
                            step={0.01}
                          />
                        </Field>
                        <Field
                          label={`Cost per Messaging Interaction (${currency})`}
                        >
                          <NumberInput
                            value={p2mMessagingCost}
                            onChange={setP2mMessagingCost}
                            step={0.01}
                          />
                        </Field>
                        <Field
                          label={`Software Investment / Annual (${currency})`}
                        >
                          <NumberInput
                            value={p2mSoftware}
                            onChange={setP2mSoftware}
                          />
                        </Field>
                      </div>
                    </>
                  )}

                  {/* Staffing-only: AHT + advanced assumptions */}
                  {hasStaffing && (
                    <>
                      <SubHeader title="Workforce Modeling" />
                      <div className="flex flex-wrap gap-3">
                        <RadioPill
                          active={!useChannelAht}
                          label="Use blended AHT"
                          onClick={() => setUseChannelAht(false)}
                        />
                        <RadioPill
                          active={useChannelAht}
                          label="Use channel-specific AHTs"
                          onClick={() => setUseChannelAht(true)}
                        />
                      </div>
                      {useChannelAht ? (
                        <>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <Field
                              label="Voice AHT (min)"
                              tooltip={`Industry benchmark: ${BENCHMARK_RANGE.voice}.`}
                            >
                              <NumberInput
                                value={voiceAht}
                                onChange={setVoiceAht}
                                step={0.1}
                              />
                            </Field>
                            <Field
                              label="Email AHT (min)"
                              tooltip={`Industry benchmark: ${BENCHMARK_RANGE.email}.`}
                            >
                              <NumberInput
                                value={emailAht}
                                onChange={setEmailAht}
                                step={0.1}
                              />
                            </Field>
                            <Field
                              label="Messaging AHT (min)"
                              tooltip={`Industry benchmark: ${BENCHMARK_RANGE.messaging}.`}
                            >
                              <NumberInput
                                value={messagingAht}
                                onChange={setMessagingAht}
                                step={0.1}
                              />
                            </Field>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Defaults are industry benchmarks. Override with
                            customer-specific values for highest accuracy.
                          </div>
                        </>
                      ) : (
                        <Field label="Average Handle Time (minutes)">
                          <NumberInput
                            value={aht}
                            onChange={setAht}
                            step={0.1}
                          />
                        </Field>
                      )}

                      <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3 text-left text-sm"
                          >
                            <span className="font-medium">
                              Advanced Assumptions
                            </span>
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
                              <NumberInput
                                value={occupancy}
                                onChange={setOccupancy}
                              />
                            </Field>
                            <Field
                              label="Shrinkage (%)"
                              tooltip="Time unavailable due to breaks, meetings, training, PTO, and absenteeism."
                            >
                              <NumberInput
                                value={shrinkage}
                                onChange={setShrinkage}
                              />
                            </Field>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button onClick={handleContinueFromStep2}>
                      See Results
                    </Button>
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Step 03 — Results */}
          {showStep3 && (() => {
            const effHeadline = summaryOverride.headline ?? advisor.headline;
            const effFound = summaryOverride.whatWeFound ?? advisor.whatWeFound;
            const effMeans = summaryOverride.whatThisMeans ?? advisor.whatThisMeans;
            const staffingOnly = hasStaffing && !hasAutomation && !hasP2M;
            const startEditing = () => {
              setDraftHeadline(effHeadline);
              setDraftFound((effFound as string[]).join("\n"));
              setDraftMeans(effMeans || "");
              setEditingSummary(true);
            };
            const saveEditing = () => {
              setSummaryOverride({
                headline: draftHeadline.trim() || advisor.headline,
                whatWeFound: draftFound
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
                whatThisMeans: draftMeans.trim(),
              });
              setEditingSummary(false);
            };
            const resetEditing = () => {
              setSummaryOverride({});
              setEditingSummary(false);
            };
            return (
            <Section title="Executive Summary" eyebrow="03">
              {/* Headline */}
              {editingSummary ? (
                <Textarea
                  value={draftHeadline}
                  onChange={(e) => setDraftHeadline(e.target.value)}
                  rows={2}
                  className="font-serif text-xl"
                />
              ) : (
                <p className="font-serif text-2xl leading-snug tracking-tight text-foreground md:text-3xl">
                  {effHeadline}
                </p>
              )}

              {/* KPIs — financial metrics only when Automation or P2M is selected */}
              {(hasAutomation || hasP2M) && (
                <div className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-4">
                  <Kpi
                    label="Annual Savings"
                    value={fmt.compactCurrency(total.savings)}
                  />
                  <Kpi label="ROI Multiple" value={`${total.roi.toFixed(1)}x`} />
                  <Kpi
                    label="Cost Reduction"
                    value={fmtPct(total.costReduction)}
                  />
                  <Kpi
                    label="Payback Period"
                    value={fmtMonths(total.paybackMonths)}
                  />
                </div>
              )}

              {/* What we found */}
              {(editingSummary || effFound.length > 0) && (
                <SummaryBlock title="What we found">
                  {editingSummary ? (
                    <Textarea
                      value={draftFound}
                      onChange={(e) => setDraftFound(e.target.value)}
                      rows={6}
                      placeholder="One bullet per line"
                    />
                  ) : (
                    <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
                      {effFound.map((s: string, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-foreground/60" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SummaryBlock>
              )}

              {/* Staffing-only callout */}
              {staffingOnly && !editingSummary && (
                <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-4">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                  <div className="text-sm leading-relaxed text-foreground/90">
                    This use case is for current-state sizing only — it doesn't
                    produce ROI or savings on its own. Add{" "}
                    <span className="font-medium">Cost Savings / Automation</span>{" "}
                    or{" "}
                    <span className="font-medium">Phone to Messaging</span> to
                    model the efficiencies and FTE capacity you could free up.
                  </div>
                </div>
              )}

              {/* What this means */}
              {(editingSummary || effMeans) && (
                <SummaryBlock title="What this means">
                  {editingSummary ? (
                    <Textarea
                      value={draftMeans}
                      onChange={(e) => setDraftMeans(e.target.value)}
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {effMeans}
                    </p>
                  )}
                </SummaryBlock>
              )}


              {/* What we assumed */}
              <SummaryBlock title="What we assumed">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      From your data
                    </div>
                    {advisor.customerInputs.length > 0 ? (
                      <ul className="space-y-1.5 text-sm text-foreground/90">
                        {advisor.customerInputs.map((s, i) => (
                          <li key={i}>· {s}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No customer-provided inputs.
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Assumed defaults
                    </div>
                    {advisor.assumedInputs.length > 0 ? (
                      <ul className="space-y-1.5 text-sm text-foreground/90">
                        {advisor.assumedInputs.map((s, i) => (
                          <li key={i}>· {s}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        None — all inputs are customer-provided.
                      </div>
                    )}
                  </div>
                </div>
              </SummaryBlock>

              {/* Confidence */}
              <SummaryBlock title={`Confidence: ${advisor.confidence.level}`}>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {advisor.confidence.explanation}
                </p>
              </SummaryBlock>

              {/* Workforce extras when staffing */}
              {hasStaffing && workforce && (
                <SummaryBlock title="Staffing snapshot">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <MiniStat
                      label="Required Productive Hours"
                      value={fmtNumber(workforce.requiredHours)}
                    />
                    <MiniStat
                      label="Baseline Required Agents"
                      value={workforce.baselineRequiredAgents.toFixed(0)}
                    />
                    <MiniStat
                      label="FTE Capacity Freed"
                      value={workforce.fteFreed.toFixed(0)}
                    />
                  </div>
                </SummaryBlock>
              )}

              {/* Breakdown */}
              {(hasAutomation || hasP2M) && (
                <SummaryBlock title="Financial breakdown">
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
                </SummaryBlock>
              )}

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                {editingSummary ? (
                  <>
                    <Button variant="ghost" onClick={resetEditing} className="gap-1.5">
                      <X className="h-3.5 w-3.5" />
                      Reset to generated
                    </Button>
                    <Button variant="outline" onClick={() => setEditingSummary(false)}>
                      Cancel
                    </Button>
                    <Button onClick={saveEditing} className="gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      Save changes
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => {
                        setStep2Open(true);
                        setTimeout(
                          () =>
                            document
                              .getElementById("step-02")
                              ?.scrollIntoView({ behavior: "smooth" }),
                          50,
                        );
                      }}
                    >
                      Edit inputs
                    </Button>
                    <Button variant="outline" className="gap-1.5" onClick={startEditing}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit summary
                    </Button>
                    <Button variant="outline" onClick={() => setPresentationOpen(true)}>
                      Presentation View
                    </Button>
                    <Button onClick={exportPdf}>Download PDF</Button>
                  </>
                )}
              </div>
            </Section>
            );
          })()}


          {/* Comments */}
          {showStep3 && (
            <section id="comments">
              <div className="mb-5 flex items-baseline gap-3">
                <span className="text-xs font-medium tracking-[0.18em] text-muted-foreground">
                  04
                </span>
                <h2 className="font-serif text-2xl tracking-tight text-foreground">
                  Comments
                </h2>
                <span className="text-xs text-muted-foreground">
                  · {comments.length} {comments.length === 1 ? "note" : "notes"}
                </span>
              </div>
              <div className="space-y-4 rounded-xl border border-border bg-card p-6 lg:p-8">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px,1fr]">
                  <Input
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    placeholder="Your name"
                  />
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Share context, questions, or assumptions to discuss with your team…"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={addComment} disabled={!commentText.trim()} className="gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Post comment
                  </Button>
                </div>
                {comments.length > 0 && (
                  <>
                    <Separator />
                    <ul className="space-y-4">
                      {comments
                        .slice()
                        .sort((a, b) => b.ts - a.ts)
                        .map((c) => (
                          <li key={c.id} className="flex gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground">
                              {(c.author || "?").slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium text-foreground">
                                  {c.author}
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    {new Date(c.ts).toLocaleString()}
                                  </span>
                                </div>
                                <button
                                  onClick={() => removeComment(c.id)}
                                  className="text-muted-foreground hover:text-foreground"
                                  aria-label="Delete comment"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                                {c.text}
                              </p>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Comments are scoped to this customer name and stored in your
                  browser. Share the link (top right) to invite teammates to add
                  their own notes.
                </p>
              </div>
            </section>
          )}

          {/* Saved scenarios */}
          {savedList.length > 0 && (
            <section>
              <div className="mb-5 flex items-baseline gap-3">
                <span className="text-xs font-medium tracking-[0.18em] text-muted-foreground">
                  ★
                </span>
                <h2 className="font-serif text-2xl tracking-tight text-foreground">
                  Saved scenarios
                </h2>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {savedList.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.ts).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleLoad(s.name)}>
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteSave(s.name)}
                        aria-label="Delete saved scenario"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground lg:px-10">
            Model assumes steady-state annual operations. Figures are estimates
            and should be validated with customer-specific data before
            contracting.
          </div>
        </footer>

        {presentationOpen && showStep3 && (
          <PresentationView
            onClose={() => setPresentationOpen(false)}
            onEdit={() => {
              setPresentationOpen(false);
              setStep2Open(true);
              setTimeout(
                () =>
                  document
                    .getElementById("step-02")
                    ?.scrollIntoView({ behavior: "smooth" }),
                80,
              );
            }}
            customerName={customerName}
            currency={currency}
            advisor={advisor}
            total={total}
            fmt={fmt}
            setup={{
              useCaseLabels: advisor.useCases,
              dataSource,
            }}
            inputs={{
              hasAutomation,
              hasP2M,
              hasStaffing,
              annualVolume,
              voiceVolume,
              phonePct,
              messagingPct,
              emailPct,
              humanCost,
              aiCost,
              softwareInvestment,
              containment,
              automationTypeLabel: AUTOMATION_TYPES[automationType].label,
              containmentMode,
              p2mPhoneVolume,
              p2mDeflection,
              p2mPhoneCost,
              p2mMessagingCost,
              p2mSoftware,
              supportModelLabel: SUPPORT_MODEL_LABEL[supportModel],
              hourlyCost,
              aht,
              useChannelAht,
              voiceAht,
              emailAht,
              messagingAht,
              occupancy,
              shrinkage,
            }}
            automationCalc={automationCalc}
            p2mCalc={p2mCalc}
            workforce={workforce}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

/* ---------- Building blocks ---------- */

function Section({
  title,
  eyebrow,
  children,
  collapsible,
  open = true,
  onToggle,
  summary,
  complete,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  summary?: string;
  complete?: boolean;
}) {
  return (
    <section id={`step-${eyebrow}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-xs font-medium tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </span>
          <h2 className="font-serif text-2xl tracking-tight text-foreground">
            {title}
          </h2>
          {complete && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="h-3 w-3" />
            </span>
          )}
        </div>
        {collapsible && (
          <button
            type="button"
            onClick={onToggle}
            className="flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-expanded={open}
            aria-label={open ? "Collapse section" : "Expand section"}
          >
            {!open && summary && (
              <span className="hidden max-w-[16rem] truncate md:inline">
                {summary}
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-5 rounded-xl border border-border bg-card p-6 lg:p-8">
          {children}
        </div>
      )}
      {!open && summary && (
        <div className="truncate rounded-xl border border-dashed border-border bg-card/40 px-5 py-3 text-xs text-muted-foreground md:hidden">
          {summary}
        </div>
      )}
    </section>
  );
}

function SummaryChip({
  eyebrow,
  title,
  summary,
  onEdit,
  dim,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  onEdit: () => void;
  dim?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-opacity ${dim ? "opacity-60" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </span>
            <span className="font-serif text-base tracking-tight text-foreground">
              {title}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {summary}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onEdit}
        className="shrink-0 gap-1.5"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
    </div>
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

function SummaryBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-2">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      {children}
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
  icon,
  category,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
  icon?: React.ReactNode;
  category?: string;
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
      {icon && (
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
            active ? "bg-foreground text-background" : "bg-secondary text-foreground"
          }`}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <div className="flex-1">
        {category && (
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {category}
          </div>
        )}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-serif text-lg tracking-tight text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-serif text-2xl leading-none tracking-tight text-foreground tabular-nums md:text-3xl">
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

/* ---------- Presentation View (deck-friendly, copy-paste) ---------- */

function PresentationView({
  onClose,
  onEdit,
  customerName,
  currency,
  advisor,
  total,
  fmt,
  setup,
  inputs,
  automationCalc,
  p2mCalc,
  workforce,
}: {
  onClose: () => void;
  onEdit: () => void;
  customerName: string;
  currency: string;
  advisor: any;
  total: any;
  fmt: any;
  setup: { useCaseLabels: string[]; dataSource: DataSource };
  inputs: any;
  automationCalc: any;
  p2mCalc: any;
  workforce: any;
}) {
  const [copied, setCopied] = useState(false);

  const buildPlainText = () => {
    const lines: string[] = [];
    lines.push(`${customerName || "Untitled Opportunity"} — Outcomes Summary`);
    lines.push(`${currency} · ${setup.useCaseLabels.join(" + ") || "—"}`);
    lines.push("");
    lines.push("OPPORTUNITY SETUP");
    lines.push(`• Customer: ${customerName || "Untitled"}`);
    lines.push(`• Currency: ${currency}`);
    lines.push(`• Use cases: ${setup.useCaseLabels.join(", ") || "—"}`);
    lines.push(`• Data source: ${setup.dataSource === "actual" ? "Actual customer data" : setup.dataSource === "assumption" ? "Assumptions / benchmarks" : "—"}`);
    lines.push("");
    lines.push("DATA INPUTS");
    if (inputs.hasAutomation) {
      lines.push(`• Annual volume: ${fmtNumber(inputs.annualVolume)}`);
      lines.push(`• Containment: ${inputs.containment}% (${inputs.containmentMode === "guided" ? inputs.automationTypeLabel : "manual"})`);
      lines.push(`• Human cost / interaction: ${fmt.fmtCurrency2(inputs.humanCost)}`);
      lines.push(`• AI cost / interaction: ${fmt.fmtCurrency2(inputs.aiCost)}`);
      lines.push(`• Software investment: ${fmt.fmtCurrency(inputs.softwareInvestment)}`);
    }
    if (inputs.hasP2M) {
      lines.push(`• Phone volume: ${fmtNumber(inputs.p2mPhoneVolume)}`);
      lines.push(`• Deflection to messaging: ${inputs.p2mDeflection}%`);
      lines.push(`• Phone cost: ${fmt.fmtCurrency2(inputs.p2mPhoneCost)} · Messaging cost: ${fmt.fmtCurrency2(inputs.p2mMessagingCost)}`);
      lines.push(`• P2M software: ${fmt.fmtCurrency(inputs.p2mSoftware)}`);
    }
    if (inputs.hasStaffing) {
      lines.push(`• Channel mix — phone ${inputs.phonePct}% / messaging ${inputs.messagingPct}% / email ${inputs.emailPct}%`);
      if (inputs.useChannelAht) {
        lines.push(`• Channel AHT — voice ${inputs.voiceAht}m, email ${inputs.emailAht}m, messaging ${inputs.messagingAht}m`);
      } else {
        lines.push(`• Blended AHT: ${inputs.aht} min`);
      }
      lines.push(`• Occupancy ${inputs.occupancy}% · Shrinkage ${inputs.shrinkage}%`);
      lines.push(`• Hourly cost: ${fmt.fmtCurrency(inputs.hourlyCost)} (${inputs.supportModelLabel})`);
    }
    lines.push("");
    lines.push("HEADLINE");
    lines.push(advisor.headline);
    lines.push("");
    const hasFinancial = !!(automationCalc || p2mCalc);
    if (hasFinancial) {
      lines.push("KEY OUTCOMES");
      lines.push(`• Annual Savings: ${fmt.compactCurrency(total.savings)}`);
      lines.push(`• ROI Multiple: ${total.roi.toFixed(1)}x`);
      lines.push(`• Cost Reduction: ${fmtPct(total.costReduction)}`);
      lines.push(`• Payback Period: ${fmtMonths(total.paybackMonths)}`);
      lines.push(`• Net Benefit: ${fmt.fmtCurrency(total.netBenefit)}`);
    }
    if (advisor.whatWeFound.length) {
      lines.push("");
      lines.push("WHAT WE FOUND");
      advisor.whatWeFound.forEach((s: string) => lines.push(`• ${s}`));
    }
    if (advisor.whatThisMeans) {
      lines.push("");
      lines.push("WHAT THIS MEANS");
      lines.push(advisor.whatThisMeans);
    }
    if (workforce) {
      lines.push("");
      lines.push("STAFFING SNAPSHOT");
      lines.push(`• Required productive hours: ${fmtNumber(workforce.requiredHours)}`);
      lines.push(`• Baseline agents: ${workforce.baselineRequiredAgents.toFixed(0)}`);
      lines.push(`• Post-automation agents: ${workforce.postRequiredAgents.toFixed(0)}`);
      lines.push(`• FTE capacity freed: ${workforce.fteFreed.toFixed(0)}`);
    }
    lines.push("");
    lines.push("ASSUMPTIONS");
    if (advisor.customerInputs.length) {
      lines.push("From your data:");
      advisor.customerInputs.forEach((s: string) => lines.push(`  • ${s}`));
    }
    if (advisor.assumedInputs.length) {
      lines.push("Assumed defaults:");
      advisor.assumedInputs.forEach((s: string) => lines.push(`  • ${s}`));
    }
    lines.push("");
    lines.push(`Confidence: ${advisor.confidence.level}`);
    lines.push(advisor.confidence.explanation);
    return lines.join("\n");
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const InputRow = ({ k, v }: { k: string; v: string }) => (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium tabular-nums text-foreground">{v}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 lg:px-10">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Presentation View
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={copyAll} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy all"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-10 lg:px-10">
        {/* Slide — Title */}
        <Slide>
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Outcomes Summary
          </div>
          <h2 className="mt-4 font-serif text-4xl tracking-tight text-foreground md:text-5xl">
            {customerName || "Untitled Opportunity"}
          </h2>
          <div className="mt-4 text-sm text-muted-foreground">
            {currency} · {setup.useCaseLabels.join(" + ") || "—"}
          </div>
        </Slide>

        {/* Slide — Opportunity Setup */}
        <Slide>
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            01 · Opportunity setup
          </div>
          <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-1 md:grid-cols-2">
            <InputRow k="Customer" v={customerName || "—"} />
            <InputRow k="Currency" v={currency} />
            <InputRow k="Use cases" v={setup.useCaseLabels.join(", ") || "—"} />
            <InputRow
              k="Data source"
              v={
                setup.dataSource === "actual"
                  ? "Actual customer data"
                  : setup.dataSource === "assumption"
                    ? "Assumptions / benchmarks"
                    : "—"
              }
            />
          </div>
        </Slide>

        {/* Slide — Data Inputs */}
        <Slide>
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            02 · Data inputs
          </div>
          <div className="mt-6 space-y-6">
            {inputs.hasAutomation && (
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Automation
                </div>
                <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                  <InputRow k="Annual volume" v={fmtNumber(inputs.annualVolume)} />
                  <InputRow
                    k="Containment"
                    v={`${inputs.containment}%${inputs.containmentMode === "guided" ? ` · ${inputs.automationTypeLabel}` : ""}`}
                  />
                  <InputRow k="Human cost / interaction" v={fmt.fmtCurrency2(inputs.humanCost)} />
                  <InputRow k="AI cost / interaction" v={fmt.fmtCurrency2(inputs.aiCost)} />
                  <InputRow k="Software investment" v={fmt.fmtCurrency(inputs.softwareInvestment)} />
                </div>
              </div>
            )}
            {inputs.hasP2M && (
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Phone to Messaging
                </div>
                <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                  <InputRow k="Phone volume" v={fmtNumber(inputs.p2mPhoneVolume)} />
                  <InputRow k="Deflection to messaging" v={`${inputs.p2mDeflection}%`} />
                  <InputRow k="Phone cost" v={fmt.fmtCurrency2(inputs.p2mPhoneCost)} />
                  <InputRow k="Messaging cost" v={fmt.fmtCurrency2(inputs.p2mMessagingCost)} />
                  <InputRow k="P2M software" v={fmt.fmtCurrency(inputs.p2mSoftware)} />
                </div>
              </div>
            )}
            {inputs.hasStaffing && (
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Workforce
                </div>
                <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                  <InputRow
                    k="Channel mix"
                    v={`Phone ${inputs.phonePct}% · Msg ${inputs.messagingPct}% · Email ${inputs.emailPct}%`}
                  />
                  {inputs.useChannelAht ? (
                    <InputRow
                      k="Channel AHTs"
                      v={`V ${inputs.voiceAht}m · E ${inputs.emailAht}m · M ${inputs.messagingAht}m`}
                    />
                  ) : (
                    <InputRow k="Blended AHT" v={`${inputs.aht} min`} />
                  )}
                  <InputRow k="Occupancy / Shrinkage" v={`${inputs.occupancy}% / ${inputs.shrinkage}%`} />
                  <InputRow
                    k="Hourly cost"
                    v={`${fmt.fmtCurrency(inputs.hourlyCost)} · ${inputs.supportModelLabel}`}
                  />
                </div>
              </div>
            )}
          </div>
        </Slide>

        {/* Slide — Headline + KPIs */}
        <Slide>
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            03 · Executive summary
          </div>
          <p className="mt-4 font-serif text-2xl leading-snug tracking-tight text-foreground md:text-3xl">
            {advisor.headline}
          </p>
          {(automationCalc || p2mCalc) && (
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              <DeckKpi label="Annual Savings" value={fmt.compactCurrency(total.savings)} />
              <DeckKpi label="ROI Multiple" value={`${total.roi.toFixed(1)}x`} />
              <DeckKpi label="Cost Reduction" value={fmtPct(total.costReduction)} />
              <DeckKpi label="Payback Period" value={fmtMonths(total.paybackMonths)} />
            </div>
          )}
        </Slide>

        {/* Slide — What we found */}
        {advisor.whatWeFound.length > 0 && (
          <Slide>
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              What we found
            </div>
            <ul className="mt-6 space-y-4">
              {advisor.whatWeFound.map((s: string, i: number) => (
                <li key={i} className="flex gap-3 text-lg leading-relaxed text-foreground">
                  <span className="mt-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </Slide>
        )}

        {/* Slide — What this means */}
        {advisor.whatThisMeans && (
          <Slide>
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              What this means
            </div>
            <p className="mt-6 text-lg leading-relaxed text-foreground">
              {advisor.whatThisMeans}
            </p>
          </Slide>
        )}

        {/* Slide — Financial breakdown */}
        {(automationCalc || p2mCalc) && (
          <Slide>
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Financial breakdown
            </div>
            <div className="mt-6 space-y-1">
              {automationCalc && (
                <>
                  <InputRow k="Automation — Baseline" v={fmt.fmtCurrency(automationCalc.baseline)} />
                  <InputRow k="Automation — Final cost" v={fmt.fmtCurrency(automationCalc.finalCost)} />
                  <InputRow k="Automation — Savings" v={fmt.fmtCurrency(automationCalc.savings)} />
                </>
              )}
              {p2mCalc && (
                <>
                  <InputRow k="P2M — Baseline" v={fmt.fmtCurrency(p2mCalc.baseline)} />
                  <InputRow k="P2M — Final cost" v={fmt.fmtCurrency(p2mCalc.finalCost)} />
                  <InputRow k="P2M — Savings" v={fmt.fmtCurrency(p2mCalc.savings)} />
                </>
              )}
              <InputRow k="Total annual savings" v={fmt.fmtCurrency(total.savings)} />
              <InputRow k="Total software investment" v={fmt.fmtCurrency(total.software)} />
              <InputRow k="Net benefit" v={fmt.fmtCurrency(total.netBenefit)} />
            </div>
          </Slide>
        )}

        {/* Slide — Staffing snapshot */}
        {workforce && (
          <Slide>
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Staffing snapshot
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <DeckKpi label="Productive Hours" value={fmtNumber(workforce.requiredHours)} />
              <DeckKpi label="Baseline Agents" value={workforce.baselineRequiredAgents.toFixed(0)} />
              <DeckKpi label="Post-Automation" value={workforce.postRequiredAgents.toFixed(0)} />
              <DeckKpi label="FTE Freed" value={workforce.fteFreed.toFixed(0)} />
            </div>
          </Slide>
        )}

        {/* Slide — Assumptions & Confidence */}
        <Slide>
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Assumptions & confidence
          </div>
          <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
            <div>
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                From your data
              </div>
              {advisor.customerInputs.length > 0 ? (
                <ul className="space-y-2 text-sm text-foreground">
                  {advisor.customerInputs.map((s: string, i: number) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No customer-provided inputs.
                </div>
              )}
            </div>
            <div>
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Assumed defaults
              </div>
              {advisor.assumedInputs.length > 0 ? (
                <ul className="space-y-2 text-sm text-foreground">
                  {advisor.assumedInputs.map((s: string, i: number) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">
                  None — all inputs are customer-provided.
                </div>
              )}
            </div>
          </div>
          <Separator className="my-8" />
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Confidence: {advisor.confidence.level}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            {advisor.confidence.explanation}
          </p>
        </Slide>

        <div className="pb-8 text-center text-xs text-muted-foreground">
          Tip: click “Edit” to update inputs — slides recalc live. Use “Copy all”
          to paste a plain-text summary into your deck.
        </div>
      </div>
    </div>
  );
}

function Slide({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 shadow-sm lg:p-14">
      {children}
    </div>
  );
}

function DeckKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-serif text-3xl leading-none tracking-tight text-foreground tabular-nums md:text-4xl">
        {value}
      </div>
    </div>
  );
}
