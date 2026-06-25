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
import { Info, ChevronDown, Check, Pencil, X, Copy, Share2, Save, MessageSquare, Trash2, TrendingDown, BarChart3, Lightbulb, Wand2, Repeat, GitBranch } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalculatorChat } from "@/components/CalculatorChat";

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
type UseCaseKey =
  | "automation"
  | "phone_to_messaging"
  | "staffing"
  | "agent_assist"
  | "repeat_contact"
  | "transfer_reduction";
type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "BRL";
type AutomationType = "faq" | "api_1_3" | "api_3_5" | "api_5_8";

/* ---------- Centralized Benchmark Library ----------
 * Single source of truth for non-industry-specific assumptions. Update
 * values/sources here and they flow into tooltips, summaries, and PDFs.
 */
export const BENCHMARK_LIBRARY = {
  agentAssistAhtReduction: {
    value: 15,
    range: "10–20%",
    source: "McKinsey, The economic potential of generative AI in customer ops (2024)",
  },
  agentAssistDocReduction: {
    value: 40,
    range: "30–50%",
    source: "Salesforce State of Service 2024 (AI summarization)",
  },
  agentAssistKnowledgeReduction: {
    value: 50,
    range: "40–60%",
    source: "Salesforce State of Service 2024 (AI knowledge surfacing)",
  },
  repeatContactRate: {
    value: 22,
    range: "15–30%",
    source: "CCW Digital 2024 (FCR ~70–80%)",
  },
  repeatContactReduction: {
    value: 25,
    range: "20–35%",
    source: "Gartner — FCR uplift via AI assist (2024)",
  },
  transferRate: {
    value: 18,
    range: "10–25%",
    source: "ICMI Contact Center Benchmark (2024)",
  },
  transferReduction: {
    value: 30,
    range: "20–40%",
    source: "Forrester — routing optimization (2024)",
  },
  averageTransferTimeMin: {
    value: 2,
    range: "1–3 min",
    source: "ICMI Contact Center Benchmark (2024)",
  },
  qaAutomationTimeSavings: {
    value: 70,
    range: "60–80%",
    source: "Observe.AI / Level AI vendor benchmarks (2024)",
  },
  waitTimeReduction: {
    value: 25,
    range: "15–35%",
    source: "Zendesk CX Trends 2025",
  },
};

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

/* ---------- Industry benchmarks (publicly sourced) ----------
 * Phone AHT medians come from "Average Handle Time Benchmarks by Industry"
 * (Supp, 2026 update) — https://supp.support/blog/average-handle-time-benchmarks
 * Email / Live-chat medians use the same source's cross-industry channel medians
 * (live chat 8–11 min, email 12–18 min) when no industry-specific number is
 * published. Containment & deflection draw on Gartner's 2024 chatbot
 * containment outlook (≈30% Tier-1 deflection) and Zendesk CX Trends 2025
 * (self-service deflection 20–35%). Where no defensible public number exists
 * we mark the row "Estimate — verify with customer data".
 */
type IndustryKey =
  | "banking"
  | "insurance"
  | "retail"
  | "travel"
  | "airlines"
  | "utilities"
  | "telco"
  | "gaming"
  | "healthcare"
  | "other";

type BenchmarkValue = {
  value: number;
  range: string;
  source: string;
  url?: string;
};

type IndustryBenchmark = {
  label: string;
  voiceAht: BenchmarkValue;
  emailAht: BenchmarkValue;
  messagingAht: BenchmarkValue;
  containment: BenchmarkValue;
  deflection: BenchmarkValue;
} | null;

const SUPP_URL =
  "https://supp.support/blog/average-handle-time-benchmarks";
const GARTNER_NOTE =
  "Gartner, Predicts 2024: CX & Conversational AI (chatbot Tier-1 containment ~30%)";
const ZENDESK_NOTE =
  "Zendesk CX Trends 2025 (self-service deflection 20–35%)";

const EMAIL_DEFAULT: BenchmarkValue = {
  value: 15,
  range: "12–18 min",
  source: "Supp 2026 (cross-industry email median)",
  url: SUPP_URL,
};
const CHAT_DEFAULT: BenchmarkValue = {
  value: 9,
  range: "8–11 min",
  source: "Supp 2026 (cross-industry live-chat median)",
  url: SUPP_URL,
};

const INDUSTRY_BENCHMARKS: Record<IndustryKey, IndustryBenchmark> = {
  banking: {
    label: "Banking",
    voiceAht: { value: 10, range: "8–12 min", source: "Supp 2026 — Financial Services / Banking", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 30, range: "25–35%", source: GARTNER_NOTE },
    deflection: { value: 25, range: "20–30%", source: ZENDESK_NOTE },
  },
  insurance: {
    label: "Insurance",
    voiceAht: { value: 10, range: "8–12 min", source: "Estimate aligned to Financial Services band (Supp 2026)", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 28, range: "20–35%", source: GARTNER_NOTE },
    deflection: { value: 22, range: "18–28%", source: ZENDESK_NOTE },
  },
  retail: {
    label: "Retail / E-commerce",
    voiceAht: { value: 6, range: "5–7 min", source: "Supp 2026 — E-Commerce / Retail", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 40, range: "30–50%", source: GARTNER_NOTE },
    deflection: { value: 30, range: "25–40%", source: ZENDESK_NOTE },
  },
  travel: {
    label: "Travel & Hospitality",
    voiceAht: { value: 7, range: "6–9 min", source: "Estimate — Travel typically tracks between Retail and Telecom (Supp 2026 bands)", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 30, range: "25–40%", source: GARTNER_NOTE },
    deflection: { value: 25, range: "20–35%", source: ZENDESK_NOTE },
  },
  airlines: {
    label: "Airlines",
    voiceAht: { value: 9, range: "7–11 min", source: "Estimate — disruption & rebooking calls push above Travel median (Supp 2026 channel median)", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 25, range: "20–30%", source: GARTNER_NOTE },
    deflection: { value: 22, range: "18–28%", source: ZENDESK_NOTE },
  },
  utilities: {
    label: "Utilities",
    voiceAht: { value: 7, range: "6–9 min", source: "Estimate — billing & outage mix sits near cross-industry phone median (Supp 2026)", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 35, range: "25–45%", source: GARTNER_NOTE },
    deflection: { value: 28, range: "20–35%", source: ZENDESK_NOTE },
  },
  telco: {
    label: "Telecommunications",
    voiceAht: { value: 8, range: "7–10 min", source: "Supp 2026 — Telecommunications", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 32, range: "25–40%", source: GARTNER_NOTE },
    deflection: { value: 28, range: "20–35%", source: ZENDESK_NOTE },
  },
  gaming: {
    label: "Gaming & Betting",
    voiceAht: { value: 6, range: "5–8 min", source: "Estimate — high-volume digital support, no public median available", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 40, range: "30–50%", source: GARTNER_NOTE },
    deflection: { value: 35, range: "25–45%", source: ZENDESK_NOTE },
  },
  healthcare: {
    label: "Healthcare",
    voiceAht: { value: 12, range: "10–15 min", source: "Supp 2026 — Healthcare", url: SUPP_URL },
    emailAht: EMAIL_DEFAULT,
    messagingAht: CHAT_DEFAULT,
    containment: { value: 22, range: "15–30%", source: GARTNER_NOTE },
    deflection: { value: 18, range: "12–25%", source: ZENDESK_NOTE },
  },
  other: null,
};

const BENCHMARK_KEYS = [
  "voiceAht",
  "emailAht",
  "messagingAht",
  "containment",
  "deflection",
] as const;
type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];
const BENCHMARK_LABELS: Record<BenchmarkKey, string> = {
  voiceAht: "Voice AHT",
  emailAht: "Email AHT",
  messagingAht: "Messaging AHT",
  containment: "Automation containment",
  deflection: "Phone-to-messaging deflection",
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
  agent_assist: "Agent Assist / Copilot",
  repeat_contact: "Repeat Contact Reduction",
  transfer_reduction: "Routing / Transfer Reduction",
};

/* ---------- Component ---------- */

function Index() {
  /* ---------- State ---------- */
  // Step 01
  const [customerName, setCustomerName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [industry, setIndustry] = useState<IndustryKey>("retail");
  const [customIndustry, setCustomIndustry] = useState("");
  // Per-benchmark customer overrides ({ source, url } — value lives in its own input)
  const [benchmarkOverrides, setBenchmarkOverrides] = useState<
    Partial<Record<BenchmarkKey, { source: string; url?: string }>>
  >({});
  const setBenchmarkOverride = (
    k: BenchmarkKey,
    v: { source: string; url?: string } | null,
  ) =>
    setBenchmarkOverrides((prev) => {
      const next = { ...prev };
      if (!v || !v.source.trim()) delete next[k];
      else next[k] = v;
      return next;
    });
  const benchmarks = INDUSTRY_BENCHMARKS[industry];
  const activeBenchmark = (k: BenchmarkKey): BenchmarkValue | null => {
    const base = benchmarks?.[k] ?? null;
    const ov = benchmarkOverrides[k];
    if (!ov) return base;
    return {
      value: base?.value ?? 0,
      range: base?.range ?? "—",
      source: ov.source,
      url: ov.url,
    };
  };
  const [useCases, setUseCases] = useState<Set<UseCaseKey>>(new Set());

  const hasAutomation = useCases.has("automation");
  const hasP2M = useCases.has("phone_to_messaging");
  const hasStaffing = useCases.has("staffing");
  const hasAgentAssist = useCases.has("agent_assist");
  const hasRepeat = useCases.has("repeat_contact");
  const hasTransfer = useCases.has("transfer_reduction");
  // Convenience: any use case that produces $ savings
  const hasFinancial = hasAutomation || hasP2M || hasAgentAssist || hasRepeat || hasTransfer;
  // Convenience: any use case that needs shared inputs
  const needsAnnualVolume = hasAutomation || hasAgentAssist || hasRepeat || hasTransfer;
  const needsAht = hasAutomation || hasAgentAssist || hasStaffing;
  const needsCost = hasAutomation || hasAgentAssist || hasRepeat || hasTransfer;
  const needsAgents = hasStaffing || hasAgentAssist;
  const needsOccupancyShrinkage = hasStaffing || hasAgentAssist;

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
  const [voiceAht, setVoiceAht] = useState(8);
  const [emailAht, setEmailAht] = useState(12);
  const [messagingAht, setMessagingAht] = useState(6);

  // Sync AHT defaults when the customer hasn't overridden them yet — when
  // industry changes, push the new industry benchmark into the AHT inputs.
  useEffect(() => {
    const b = INDUSTRY_BENCHMARKS[industry];
    if (!b) return;
    setVoiceAht(b.voiceAht.value);
    setEmailAht(b.emailAht.value);
    setMessagingAht(b.messagingAht.value);
    setAht(b.voiceAht.value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry]);

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

  // Agent Assist / Copilot
  const [ahtReductionPct, setAhtReductionPct] = useState(
    BENCHMARK_LIBRARY.agentAssistAhtReduction.value,
  );
  const [docTimeMin, setDocTimeMin] = useState(0);
  const [docReductionPct, setDocReductionPct] = useState(
    BENCHMARK_LIBRARY.agentAssistDocReduction.value,
  );
  const [knowledgeTimeMin, setKnowledgeTimeMin] = useState(0);
  const [knowledgeReductionPct, setKnowledgeReductionPct] = useState(
    BENCHMARK_LIBRARY.agentAssistKnowledgeReduction.value,
  );
  const [acwTimeMin, setAcwTimeMin] = useState(0);
  const [acwReductionPct, setAcwReductionPct] = useState(30);
  const [agentAssistSoftware, setAgentAssistSoftware] = useState(50000);

  // Repeat Contact Reduction
  const [repeatRatePct, setRepeatRatePct] = useState(
    BENCHMARK_LIBRARY.repeatContactRate.value,
  );
  const [repeatReductionPct, setRepeatReductionPct] = useState(
    BENCHMARK_LIBRARY.repeatContactReduction.value,
  );

  // Routing / Transfer Reduction
  const [transferRatePct, setTransferRatePct] = useState(
    BENCHMARK_LIBRARY.transferRate.value,
  );
  const [avgTransferMin, setAvgTransferMin] = useState(
    BENCHMARK_LIBRARY.averageTransferTimeMin.value,
  );
  const [transferReductionPct, setTransferReductionPct] = useState(
    BENCHMARK_LIBRARY.transferReduction.value,
  );

  // Advanced
  const [advOpen, setAdvOpen] = useState(false);
  const [occupancy, setOccupancy] = useState(80);
  const [shrinkage, setShrinkage] = useState(20);

  // Scenario, multi-year, theme
  type ScenarioMode = "conservative" | "expected" | "aggressive";
  const [scenarioMode, setScenarioMode] = useState<ScenarioMode>("expected");
  const scenarioDelta =
    scenarioMode === "conservative" ? -10 : scenarioMode === "aggressive" ? 10 : 0;
  const [rampMonths, setRampMonths] = useState(3);
  type PdfTheme = "minimal" | "corporate" | "warm";
  const [pdfTheme, setPdfTheme] = useState<PdfTheme>("minimal");
  const THEME_ACCENT: Record<PdfTheme, [number, number, number]> = {
    minimal: [20, 20, 20],
    corporate: [13, 71, 161],
    warm: [183, 86, 33],
  };

  // Compare versions
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareWith, setCompareWith] = useState<string>("");

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
    const adjContainment = Math.max(0, Math.min(100, containment + scenarioDelta));
    const rate = adjContainment / 100;
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
      adjContainment,
      baseline,
      aiResolved,
      remainingHuman,
      aiAutomationCost,
      remainingHumanCost,
      finalCost,
      savings,
      software: softwareInvestment,
    };
  }, [hasAutomation, annualVolume, containment, scenarioDelta, humanCost, aiCost, softwareInvestment]);

  const p2mCalc = useMemo(() => {
    if (!hasP2M) return null;
    const adjDeflection = Math.max(0, Math.min(100, p2mDeflection + scenarioDelta));
    const shifted = p2mPhoneVolume * (adjDeflection / 100);
    const baseline = p2mPhoneVolume * p2mPhoneCost;
    const finalCost =
      (p2mPhoneVolume - shifted) * p2mPhoneCost + shifted * p2mMessagingCost;
    const savings = baseline - finalCost;
    return {
      shifted,
      adjDeflection,
      baseline,
      finalCost,
      savings,
      software: p2mSoftware,
    };
  }, [hasP2M, p2mPhoneVolume, p2mDeflection, scenarioDelta, p2mPhoneCost, p2mMessagingCost, p2mSoftware]);

  // Productive hours per agent — shared, used by workforce + capacity outputs
  const productiveHoursPerAgent = useMemo(
    () => 2080 * (1 - shrinkage / 100) * (occupancy / 100),
    [shrinkage, occupancy],
  );

  // Agent Assist / Copilot Productivity
  const agentAssistCalc = useMemo(() => {
    if (!hasAgentAssist) return null;
    const ahtMinSaved = aht * (ahtReductionPct / 100);
    const docMinSaved = docTimeMin * (docReductionPct / 100);
    const knowledgeMinSaved = knowledgeTimeMin * (knowledgeReductionPct / 100);
    const acwMinSaved = acwTimeMin * (acwReductionPct / 100);
    const perInteractionMinSaved =
      ahtMinSaved + docMinSaved + knowledgeMinSaved + acwMinSaved;
    const hoursSaved = (annualVolume * perInteractionMinSaved) / 60;
    const capacityFreedPct = aht > 0 ? perInteractionMinSaved / aht : 0;
    const equivalentAgents =
      productiveHoursPerAgent > 0 ? hoursSaved / productiveHoursPerAgent : 0;
    const effectiveHourly =
      costMode === "interaction" && aht > 0
        ? (costPerInteraction / aht) * 60
        : hourlyCost;
    const savings = hoursSaved * effectiveHourly;
    return {
      ahtMinSaved,
      docMinSaved,
      knowledgeMinSaved,
      acwMinSaved,
      perInteractionMinSaved,
      hoursSaved,
      capacityFreedPct,
      equivalentAgents,
      savings,
    };
  }, [
    hasAgentAssist, annualVolume, aht, ahtReductionPct,
    docTimeMin, docReductionPct, knowledgeTimeMin, knowledgeReductionPct,
    acwTimeMin, acwReductionPct, productiveHoursPerAgent,
    costMode, costPerInteraction, hourlyCost,
  ]);

  // Repeat Contact Reduction
  const repeatCalc = useMemo(() => {
    if (!hasRepeat) return null;
    const repeatsToday = annualVolume * (repeatRatePct / 100);
    const repeatsEliminated = repeatsToday * (repeatReductionPct / 100);
    const hoursSaved = (repeatsEliminated * aht) / 60;
    const savings =
      costMode === "interaction"
        ? repeatsEliminated * humanCost
        : hoursSaved * hourlyCost;
    return { repeatsToday, repeatsEliminated, hoursSaved, savings };
  }, [hasRepeat, annualVolume, repeatRatePct, repeatReductionPct, aht, costMode, humanCost, hourlyCost]);

  // Routing / Transfer Reduction
  const transferCalc = useMemo(() => {
    if (!hasTransfer) return null;
    const transfersToday = annualVolume * (transferRatePct / 100);
    const transfersEliminated = transfersToday * (transferReductionPct / 100);
    const minutesSaved = transfersEliminated * avgTransferMin;
    const hoursSaved = minutesSaved / 60;
    const savings = hoursSaved * hourlyCost;
    return { transfersToday, transfersEliminated, minutesSaved, hoursSaved, savings };
  }, [hasTransfer, annualVolume, transferRatePct, transferReductionPct, avgTransferMin, hourlyCost]);

  // Shared Workforce Engine — aggregates hours saved across all selected use cases
  const sharedWorkforce = useMemo(() => {
    const automationHours = automationCalc
      ? (automationCalc.aiResolved * aht) / 60
      : 0;
    const p2mHours = p2mCalc
      ? useChannelAht
        ? (p2mCalc.shifted * Math.max(0, voiceAht - messagingAht)) / 60
        : 0
      : 0;
    const agentAssistHours = agentAssistCalc?.hoursSaved ?? 0;
    const repeatHours = repeatCalc?.hoursSaved ?? 0;
    const transferHours = transferCalc?.hoursSaved ?? 0;
    const totalHoursSaved =
      automationHours + p2mHours + agentAssistHours + repeatHours + transferHours;
    const fteCapacityFreed =
      productiveHoursPerAgent > 0 ? totalHoursSaved / productiveHoursPerAgent : 0;
    return {
      automationHours,
      p2mHours,
      agentAssistHours,
      repeatHours,
      transferHours,
      totalHoursSaved,
      fteCapacityFreed,
      equivalentAgentsFreed: fteCapacityFreed,
    };
  }, [
    automationCalc, p2mCalc, agentAssistCalc, repeatCalc, transferCalc,
    aht, useChannelAht, voiceAht, messagingAht, productiveHoursPerAgent,
  ]);



  const workforce = useMemo(() => {
    if (!hasStaffing) return null;
    const totalVolume = needsAnnualVolume ? annualVolume : voiceVolume;
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
    const baselineRequiredAgents =
      productiveHoursPerAgent > 0 ? requiredHours / productiveHoursPerAgent : 0;

    // Shared workforce engine: aggregate hours saved from all selected use cases
    const postHours = Math.max(0, requiredHours - sharedWorkforce.totalHoursSaved);
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
    needsAnnualVolume,
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
    productiveHoursPerAgent,
    sharedWorkforce,
  ]);


  const total = useMemo(() => {
    // Baseline only meaningful for use cases with a defined baseline cost
    const baseline = (automationCalc?.baseline ?? 0) + (p2mCalc?.baseline ?? 0);
    const finalCost =
      (automationCalc?.finalCost ?? 0) + (p2mCalc?.finalCost ?? 0);
    const extraSavings =
      (agentAssistCalc?.savings ?? 0) +
      (repeatCalc?.savings ?? 0) +
      (transferCalc?.savings ?? 0);
    const savings = baseline - finalCost + extraSavings;
    const software = (automationCalc?.software ?? 0) + (p2mCalc?.software ?? 0);
    const netBenefit = savings - software;
    const roi = software > 0 ? savings / software : 0;
    const effectiveBaseline = baseline + extraSavings; // for cost-reduction %
    const costReduction = effectiveBaseline > 0 ? savings / effectiveBaseline : 0;
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
  }, [automationCalc, p2mCalc, agentAssistCalc, repeatCalc, transferCalc]);

  // Multi-year projection with ramp-up: Year 1 prorated by ramp curve, Years 2+ full run-rate
  const multiYear = useMemo(() => {
    if (!hasFinancial) return null;
    const fullSavings = total.savings;
    const baseline = total.baseline;
    // Average attainment in Year 1 with linear ramp over `rampMonths` (capped at 12)
    const r = Math.max(0, Math.min(12, rampMonths));
    const year1Attainment = r <= 0 ? 1 : Math.max(0, (12 - r / 2) / 12);
    const y1Savings = fullSavings * year1Attainment;
    const y2Savings = fullSavings;
    const y3Savings = fullSavings;
    const rows = [
      { year: 1, baseline, savings: y1Savings, finalCost: baseline - y1Savings, software: total.software, net: y1Savings - total.software, attainment: year1Attainment },
      { year: 2, baseline, savings: y2Savings, finalCost: baseline - y2Savings, software: 0, net: y2Savings, attainment: 1 },
      { year: 3, baseline, savings: y3Savings, finalCost: baseline - y3Savings, software: 0, net: y3Savings, attainment: 1 },
    ];
    let cum = 0;
    const withCum = rows.map((r) => {
      cum += r.net;
      return { ...r, cumulative: cum };
    });
    const cumulativeRoi = total.software > 0 ? (y1Savings + y2Savings + y3Savings) / total.software : 0;
    return { rows: withCum, cumulativeRoi };
  }, [hasFinancial, total, rampMonths]);


  /* ---------- Executive summary (structured) ---------- */
  const advisor = useMemo(() => {
    const ucList = Array.from(useCases).map((k) => USE_CASE_LABELS[k]);

    // Headline (plain English)
    let headline = "";
    if (total.savings > 0 && total.software > 0) {
      const paybackCalc =
        total.paybackMonths === Infinity
          ? "—"
          : `${total.paybackMonths.toFixed(1)} months (${fmt.compactCurrency(total.software)} ÷ (${fmt.compactCurrency(total.savings)} ÷ 12))`;
      headline = `You could save about ${fmt.compactCurrency(total.savings)} per year (${fmt.compactCurrency(total.baseline)} baseline − ${fmt.compactCurrency(total.finalCost)} final cost) and recover your investment in roughly ${paybackCalc}.`;
    } else if (total.savings > 0) {
      headline = `Your estimated annual savings are about ${fmt.compactCurrency(total.savings)} (${fmt.compactCurrency(total.baseline)} baseline − ${fmt.compactCurrency(total.finalCost)} final cost).`;
    } else if (hasStaffing && workforce) {
      headline = `Your contact center would need about ${workforce.baselineRequiredAgents.toFixed(0)} agents to handle today's workload.`;
    } else {
      headline = "Add a few more inputs to see your outcome.";
    }

    // What we found
    const whatWeFound: string[] = [];
    if (hasAutomation && automationCalc) {
      whatWeFound.push(
        `AI handles about ${fmtNumber(automationCalc.aiResolved)} of ${fmtNumber(automationCalc.volume)} interactions a year (${containment.toFixed(0)}% containment), saving ${fmt.compactCurrency(automationCalc.savings)} (${fmtNumber(automationCalc.volume)} × ${fmt.fmtCurrency2(humanCost)} baseline − [${fmtNumber(automationCalc.aiResolved)} × ${fmt.fmtCurrency2(aiCost)} AI + ${fmtNumber(automationCalc.remainingHuman)} × ${fmt.fmtCurrency2(humanCost)} human]).`,
      );
    }
    if (hasP2M && p2mCalc) {
      whatWeFound.push(
        `Shifting ${p2mDeflection}% of phone calls to messaging saves ${fmt.compactCurrency(p2mCalc.savings)} a year (${fmtNumber(p2mCalc.shifted)} calls shifted × (${fmt.fmtCurrency2(p2mPhoneCost)} phone − ${fmt.fmtCurrency2(p2mMessagingCost)} messaging)).`,
      );
    }
    if (hasAgentAssist && agentAssistCalc) {
      whatWeFound.push(
        `Agent Assist trims about ${agentAssistCalc.perInteractionMinSaved.toFixed(1)} min per interaction (${(agentAssistCalc.capacityFreedPct * 100).toFixed(0)}% capacity freed), saving ~${fmtNumber(agentAssistCalc.hoursSaved)} hours/year — roughly ${agentAssistCalc.equivalentAgents.toFixed(0)} equivalent agents and ${fmt.compactCurrency(agentAssistCalc.savings)} in annual labor savings.`,
      );
    }
    if (hasRepeat && repeatCalc) {
      whatWeFound.push(
        `Reducing repeat contacts by ${repeatReductionPct}% eliminates ~${fmtNumber(repeatCalc.repeatsEliminated)} interactions/year (${repeatRatePct}% repeat rate × ${repeatReductionPct}% reduction), saving ${fmtNumber(repeatCalc.hoursSaved)} hours and ${fmt.compactCurrency(repeatCalc.savings)}.`,
      );
    }
    if (hasTransfer && transferCalc) {
      whatWeFound.push(
        `Better routing eliminates ~${fmtNumber(transferCalc.transfersEliminated)} transfers/year (${transferRatePct}% transfer rate × ${transferReductionPct}% reduction), saving ${fmtNumber(transferCalc.minutesSaved)} minutes / ${fmtNumber(transferCalc.hoursSaved)} hours and ${fmt.compactCurrency(transferCalc.savings)}.`,
      );
    }
    if (hasStaffing && workforce) {
      if (hasFinancial && (hasAutomation || hasP2M || hasAgentAssist || hasRepeat || hasTransfer)) {
        whatWeFound.push(
          `Staffing model: ${workforce.baselineRequiredAgents.toFixed(0)} agents needed today, ${workforce.postRequiredAgents.toFixed(0)} after AI — freeing ${workforce.fteFreed.toFixed(0)} FTE across selected use cases.`,
        );
      } else {
        whatWeFound.push(
          `Staffing model: about ${workforce.baselineRequiredAgents.toFixed(0)} agents needed to handle today's workload (~${fmtNumber(workforce.requiredHours)} productive hours/year).`,
        );
      }
    }
    if (!hasStaffing && hasFinancial && sharedWorkforce.totalHoursSaved > 0) {
      whatWeFound.push(
        `Across selected use cases, AI frees ~${fmtNumber(sharedWorkforce.totalHoursSaved)} agent hours per year — equivalent to ${sharedWorkforce.equivalentAgentsFreed.toFixed(0)} full-time agents of capacity.`,
      );
    }

    // What this means
    let whatThisMeans = "";
    if (total.savings > 0 && total.software > 0) {
      whatThisMeans = `For every ${fmt.compactCurrency(total.software)} invested in software, you get back about ${fmt.compactCurrency(total.savings)} in annual savings — a ${total.roi.toFixed(1)}× return (${fmt.compactCurrency(total.savings)} ÷ ${fmt.compactCurrency(total.software)}) and a ${fmtPct(total.costReduction)} cost reduction overall (${fmt.compactCurrency(total.savings)} ÷ ${fmt.compactCurrency(total.baseline)}).`;
    } else if (total.savings > 0) {
      whatThisMeans = `That's roughly a ${fmtPct(total.costReduction)} reduction in your annual contact center cost base (${fmt.compactCurrency(total.savings)} ÷ ${fmt.compactCurrency(total.baseline)}).`;
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


    // What we assumed — each assumption is paired with what to validate to raise confidence
    const customerInputs: string[] = [];
    const assumedInputs: string[] = [];
    const toValidate: string[] = [];
    if (dataSource === "actual") {
      if (hasAutomation) customerInputs.push(`Annual volume: ${fmtNumber(annualVolume)}`);
      if (hasP2M) customerInputs.push(`Phone volume: ${fmtNumber(p2mPhoneVolume)}`);
      customerInputs.push(`Human cost per interaction: ${fmt.fmtCurrency2(humanCost)}`);
    } else {
      assumedInputs.push(
        `Human cost from ${SUPPORT_MODEL_LABEL[supportModel]} (${fmt.fmtCurrency(hourlyCost)}/hr × ${aht} min AHT = ${fmt.fmtCurrency2(derivedFromHourly)})`,
      );
      toValidate.push(
        `Confirm actual per-interaction human cost from finance/WFM (currently derived from ${fmt.fmtCurrency(hourlyCost)}/hr × ${aht} min AHT = ${fmt.fmtCurrency2(derivedFromHourly)}).`,
      );
      toValidate.push(
        `Confirm actual annual interaction volume${hasP2M ? " and phone volume" : ""} from contact-center reporting instead of benchmarks.`,
      );
    }
    if (hasAutomation) {
      if (containmentMode === "guided") {
        assumedInputs.push(
          `Containment: ${guidedContainment}% (${AUTOMATION_TYPES[automationType].label})`,
        );
        toValidate.push(
          `Replace the guided ${guidedContainment}% containment estimate with a measured rate from a pilot or comparable deployment.`,
        );
      } else {
        customerInputs.push(`Containment: ${containment}%`);
      }
      if (containment > 80) {
        toValidate.push(
          `Pressure-test the ${containment}% containment — anything above 80% is uncommon and usually requires deep CRM/OMS/billing integrations.`,
        );
      }
    }
    if (hasStaffing) {
      assumedInputs.push(`Occupancy ${occupancy}%, shrinkage ${shrinkage}%`);
      if (occupancy === 80 && shrinkage === 20) {
        toValidate.push(
          `Replace default occupancy (80%) and shrinkage (20%) with the customer's actual WFM figures.`,
        );
      }
      if (useChannelAht) {
        customerInputs.push(
          `Channel AHTs — voice ${voiceAht}m, email ${emailAht}m, messaging ${messagingAht}m`,
        );
      } else {
        assumedInputs.push(`Blended AHT of ${aht} min across all channels`);
        toValidate.push(
          `Provide per-channel AHTs (voice / email / messaging) instead of the single blended ${aht}-minute figure.`,
        );
      }
    }

    // Confidence — visual segmented score 0-10
    type Segment = { label: string; unlocked: boolean; hint: string };
    const segments: Segment[] = [];
    segments.push({ label: "Customer data", unlocked: dataSource === "actual", hint: "Switch Step 02 to 'Yes, use customer data'." });
    segments.push({ label: "Customer data (vol/cost)", unlocked: dataSource === "actual", hint: "Enter measured volumes and unit economics in Step 02." });
    if (hasAutomation) {
      segments.push({ label: "Known containment", unlocked: containmentMode === "manual", hint: "Enter a measured containment rate instead of using the guided estimate." });
      segments.push({ label: "Containment realistic (<=80%)", unlocked: containment <= 80, hint: "Containment above 80% is uncommon — pressure-test with pilot data." });
    }
    if (hasStaffing) {
      segments.push({ label: "Per-channel AHTs", unlocked: useChannelAht, hint: "Switch to per-channel AHTs (voice / email / messaging)." });
      segments.push({ label: "Channel mix totals 100%", unlocked: channelValid, hint: "Adjust channel mix percentages to total 100%." });
      segments.push({ label: "Custom occupancy/shrinkage", unlocked: occupancy !== 80 || shrinkage !== 20, hint: "Replace default 80/20 with the customer's WFM figures." });
    }
    segments.push({ label: "Headcount entered", unlocked: numberOfAgents > 0, hint: "Enter the current number of agents." });
    // Pad to exactly 10 segments
    while (segments.length < 10) segments.push({ label: "Bonus signal", unlocked: false, hint: "Add another use case or refine inputs to unlock." });
    const totalSegments = segments.length;
    const unlockedCount = segments.filter((s) => s.unlocked).length;
    const score10 = Math.round((unlockedCount / totalSegments) * 10);
    const level: "High" | "Medium" | "Low" =
      score10 >= 8 ? "High" : score10 >= 4 ? "Medium" : "Low";
    const confidenceExplanation =
      level === "High"
        ? toValidate.length === 0
          ? "All key inputs come from customer data, so this estimate is reliable for planning."
          : "Most inputs come from customer data. Validate the items below to lock the estimate in for contracting."
        : level === "Medium"
          ? "Several key numbers are still assumptions — directionally right, but validate the items below before contracting."
          : "Most inputs are assumptions. Treat this as a rough starting point and validate the items below with the customer.";


    return {
      headline,
      useCases: ucList,
      whatWeFound,
      whatThisMeans,
      customerInputs,
      assumedInputs,
      toValidate,
      confidence: { level, explanation: confidenceExplanation, score10, segments },
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
    p2mPhoneCost,
    p2mMessagingCost,
    fmt,
    hasAgentAssist, hasRepeat, hasTransfer, hasFinancial,
    agentAssistCalc, repeatCalc, transferCalc, sharedWorkforce,
    repeatRatePct, repeatReductionPct, transferRatePct, transferReductionPct,
  ]);

  // Apply user edits from the Executive Summary across PDF and Presentation View
  const effectiveAdvisor = useMemo(
    () => ({
      ...advisor,
      headline: summaryOverride.headline ?? advisor.headline,
      whatWeFound: summaryOverride.whatWeFound ?? advisor.whatWeFound,
      whatThisMeans: summaryOverride.whatThisMeans ?? advisor.whatThisMeans,
    }),
    [advisor, summaryOverride],
  );

  /* ---------- PDF Export ---------- */
  const exportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 56;
    const accent = THEME_ACCENT[pdfTheme];
    let y = margin;

    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(0, 0, pageW, 6, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text("Outcomes Executive Summary", margin, y);
    doc.setTextColor(20);
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
    const headLines = doc.splitTextToSize(effectiveAdvisor.headline, pageW - margin * 2);
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

    if (effectiveAdvisor.whatWeFound.length) {
      section("What we found");
      writeBullets(effectiveAdvisor.whatWeFound);
      y += 4;
    }
    if (effectiveAdvisor.whatThisMeans) {
      section("What this means");
      writePara(effectiveAdvisor.whatThisMeans);
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

    // Sources & Assumptions appendix
    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text("Sources & Assumptions", margin, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    const industryLabel =
      benchmarks?.label ?? (customIndustry || "Industry not specified");
    doc.text(`Industry: ${industryLabel}`, margin, y);
    y += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text("Benchmarks used", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (benchmarks) {
      BENCHMARK_KEYS.forEach((k) => {
        const b = activeBenchmark(k);
        if (!b) return;
        const overridden = benchmarkOverrides[k] ? " [Customer-provided]" : "";
        const line = `${BENCHMARK_LABELS[k]}: ${b.range} — ${b.source}${overridden}`;
        const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
        if (y + wrapped.length * 12 > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.setTextColor(20);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 12 + 4;
      });
    } else {
      const note = doc.splitTextToSize(
        "No public benchmarks available for the selected industry. All AHT, containment, and deflection values should be validated with customer data.",
        pageW - margin * 2,
      );
      doc.text(note, margin, y);
      y += note.length * 12 + 4;
    }

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Primary references", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const refs = [
      "• Supp 2026 — AHT Benchmarks by Industry: https://supp.support/blog/average-handle-time-benchmarks",
      "• Gartner — Predicts 2024: CX & Conversational AI (chatbot Tier-1 containment outlook)",
      "• Zendesk CX Trends 2025 — Self-service deflection benchmarks",
    ];
    refs.forEach((r) => {
      const w = doc.splitTextToSize(r, pageW - margin * 2);
      if (y + w.length * 12 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += w.length * 12 + 2;
    });

    y += 10;
    const disclaimer = doc.splitTextToSize(
      "Rows tagged 'Estimate' are interpolated where no industry-specific public median exists. Customer-provided rows reflect benchmarks supplied directly by the customer and override our defaults in this report.",
      pageW - margin * 2,
    );
    doc.setTextColor(120);
    doc.setFontSize(8);
    doc.text(disclaimer, margin, y);

    doc.save(
      `Outcomes-${(customerName || "summary").replace(/[^a-z0-9]+/gi, "-")}.pdf`,
    );
  };

  /* ---------- Board summary (one-page) ---------- */
  const exportBoardPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 56;
    const accent = THEME_ACCENT[pdfTheme];
    let y = margin;

    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(0, 0, pageW, 6, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("BOARD SUMMARY", margin, y);
    y += 14;
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(customerName || "Untitled Opportunity", margin, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`${advisor.useCases.join(" + ") || "—"} · ${currency} · Scenario: ${scenarioMode}`, margin, y);
    y += 28;

    // Hero savings number
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(46);
    const hero = (hasAutomation || hasP2M) ? fmt.compactCurrency(total.savings) : `${workforce?.baselineRequiredAgents.toFixed(0) ?? "—"} FTE`;
    doc.text(hero, margin, y);
    y += 14;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text((hasAutomation || hasP2M) ? "estimated annual savings" : "baseline required agents", margin, y);
    y += 28;
    doc.setTextColor(20);

    // KPI row
    if (hasAutomation || hasP2M) {
      const kpis: [string, string][] = [
        ["Annual Savings", fmt.compactCurrency(total.savings)],
        ["ROI", `${total.roi.toFixed(1)}x`],
        ["Cost Reduction", fmtPct(total.costReduction)],
        ["Payback", fmtMonths(total.paybackMonths)],
      ];
      const colW = (pageW - margin * 2) / kpis.length;
      kpis.forEach(([label, val], i) => {
        const x = margin + i * colW;
        doc.setDrawColor(220);
        doc.rect(x, y, colW - 8, 60);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(label.toUpperCase(), x + 10, y + 16);
        doc.setFontSize(15);
        doc.setTextColor(20);
        doc.setFont("helvetica", "bold");
        doc.text(val, x + 10, y + 42);
        doc.setFont("helvetica", "normal");
      });
      y += 80;
    }

    // What this means (one sentence)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("What this means", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const meansLines = doc.splitTextToSize(effectiveAdvisor.whatThisMeans || "—", pageW - margin * 2);
    doc.text(meansLines.slice(0, 3), margin, y);
    y += meansLines.slice(0, 3).length * 13 + 14;

    // What to validate (top 2)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("What to validate", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    (advisor.toValidate.slice(0, 2).length ? advisor.toValidate.slice(0, 2) : ["All key inputs verified."]).forEach((t) => {
      const ls = doc.splitTextToSize(`• ${t}`, pageW - margin * 2);
      doc.text(ls, margin, y);
      y += ls.length * 13 + 4;
    });
    y += 8;

    // Confidence bar
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Confidence: ${advisor.confidence.level} (${advisor.confidence.score10}/10)`, margin, y);
    y += 10;
    const barW = pageW - margin * 2;
    const segW = barW / 10;
    for (let i = 0; i < 10; i++) {
      if (i < advisor.confidence.score10) {
        doc.setFillColor(accent[0], accent[1], accent[2]);
      } else {
        doc.setFillColor(230, 230, 230);
      }
      doc.rect(margin + i * segW + 2, y, segW - 4, 8, "F");
    }
    y += 24;

    // Next step CTA at bottom
    const ctaY = pageH - margin - 36;
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(1);
    doc.rect(margin, ctaY, pageW - margin * 2, 36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text("Recommended next step:", margin + 12, ctaY + 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40);
    doc.text("Run a 90-day pilot with measured containment & per-channel AHT capture.", margin + 12, ctaY + 30);

    doc.save(`Board-${(customerName || "summary").replace(/[^a-z0-9]+/gi, "-")}.pdf`);
  };

  /* ---------- Proposal generator (multi-section) ---------- */
  const exportProposalPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 56;
    const accent = THEME_ACCENT[pdfTheme];
    let y = margin;

    const ensureSpace = (h: number) => {
      if (y + h > pageH - margin) {
        doc.addPage();
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.rect(0, 0, pageW, 6, "F");
        y = margin;
      }
    };
    const h1 = (t: string) => {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(accent[0], accent[1], accent[2]);
      doc.text(t, margin, y);
      doc.setTextColor(20);
      y += 22;
    };
    const h2 = (t: string) => {
      ensureSpace(28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(t, margin, y);
      y += 16;
    };
    const para = (t: string) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(t, pageW - margin * 2);
      ensureSpace(lines.length * 13 + 6);
      doc.text(lines, margin, y);
      y += lines.length * 13 + 6;
    };
    const bullets = (items: string[]) => items.forEach((it) => para(`• ${it}`));

    // Cover
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(0, 0, pageW, 6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("PROPOSAL", margin, y);
    y += 16;
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.text(customerName || "Untitled Opportunity", margin, y);
    y += 30;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(`Conversational AI & Contact Center Outcomes · ${currency}`, margin, y);
    y += 12;
    doc.text(new Date().toLocaleDateString(), margin, y);
    y += 30;
    doc.setTextColor(20);

    h1("1. Executive Summary");
    para(effectiveAdvisor.headline);
    if (effectiveAdvisor.whatThisMeans) para(effectiveAdvisor.whatThisMeans);

    h1("2. Current State");
    bullets(advisor.customerInputs.length ? advisor.customerInputs : ["No customer-provided inputs; all figures derived from benchmarks."]);

    h1("3. Recommended Solution");
    bullets(advisor.useCases.map((u) => `${u} — addressing scope per Step 01 selection.`));

    h1("4. Financial Impact");
    if (hasAutomation || hasP2M) {
      const rows: [string, string][] = [
        ["Total Baseline Cost", fmt.fmtCurrency(total.baseline)],
        ["Total Final Cost", fmt.fmtCurrency(total.finalCost)],
        ["Annual Savings", fmt.fmtCurrency(total.savings)],
        ["Software Investment", fmt.fmtCurrency(total.software)],
        ["Net Benefit (Year 1)", fmt.fmtCurrency(total.netBenefit)],
        ["ROI Multiple", `${total.roi.toFixed(1)}x`],
        ["Payback", fmtMonths(total.paybackMonths)],
      ];
      rows.forEach(([k, v]) => {
        ensureSpace(16);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(90);
        doc.text(k, margin, y);
        doc.setTextColor(20);
        doc.text(v, pageW - margin, y, { align: "right" });
        y += 16;
      });
      if (multiYear) {
        y += 8;
        h2("3-year outlook (Scenario: " + scenarioMode + ")");
        ensureSpace(20);
        doc.setFontSize(9);
        doc.setTextColor(120);
        const cols = ["Year", "Savings", "Software", "Net", "Cumulative"];
        const colW = (pageW - margin * 2) / cols.length;
        cols.forEach((c, i) => doc.text(c, margin + i * colW, y));
        y += 12;
        doc.setTextColor(20);
        doc.setFont("helvetica", "normal");
        multiYear.rows.forEach((r) => {
          ensureSpace(14);
          const vals = [`Y${r.year}`, fmt.compactCurrency(r.savings), fmt.compactCurrency(r.software), fmt.compactCurrency(r.net), fmt.compactCurrency(r.cumulative)];
          vals.forEach((v, i) => doc.text(v, margin + i * colW, y));
          y += 14;
        });
      }
    } else {
      para("This scope focuses on workforce sizing analysis; ROI is not modeled. Add a cost-reduction use case to quantify financial impact.");
    }

    h1("5. Implementation Roadmap");
    bullets([
      "Phase 1 (Weeks 1–4): Discovery, data validation, baseline confirmation.",
      "Phase 2 (Weeks 5–10): Pilot deployment with measured containment.",
      `Phase 3 (Weeks 11–${10 + Math.max(4, rampMonths * 4)}): Phased rollout, ramping over ${rampMonths} months.`,
      "Phase 4 (Ongoing): KPI tracking, optimization, expansion to adjacent use cases.",
    ]);

    h1("6. Risk & Mitigation");
    bullets(advisor.toValidate.length ? advisor.toValidate : ["No material risks identified — all inputs validated."]);

    h1("7. Next Steps");
    bullets([
      "Confirm scope and success metrics with executive sponsor.",
      "Schedule discovery sessions with WFM and operations leads.",
      "Define pilot cohort and measurement plan.",
      "Approve commercials and kick off Phase 1.",
    ]);

    doc.save(`Proposal-${(customerName || "summary").replace(/[^a-z0-9]+/gi, "-")}.pdf`);
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
    scenarioMode, rampMonths, pdfTheme,
    industry, customIndustry, benchmarkOverrides,
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
    set(s.scenarioMode, setScenarioMode);
    set(s.rampMonths, setRampMonths);
    set(s.pdfTheme, setPdfTheme);
    set(s.industry, setIndustry);
    set(s.customIndustry, setCustomIndustry);
    set(s.benchmarkOverrides, setBenchmarkOverrides);
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
              <Field
                label="Industry"
                tooltip="Sets the default benchmarks (AHT, containment, deflection) shown in Step 02."
              >
                <Select
                  value={industry}
                  onValueChange={(v) => setIndustry(v as IndustryKey)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banking">Banking</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="retail">Retail / E-commerce</SelectItem>
                    <SelectItem value="travel">Travel & Hospitality</SelectItem>
                    <SelectItem value="airlines">Airlines</SelectItem>
                    <SelectItem value="utilities">Utilities</SelectItem>
                    <SelectItem value="telco">Telco</SelectItem>
                    <SelectItem value="gaming">Gaming & Betting</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="other">Other…</SelectItem>
                  </SelectContent>
                </Select>
                {industry === "other" && (
                  <>
                    <Input
                      value={customIndustry}
                      onChange={(e) => setCustomIndustry(e.target.value)}
                      placeholder="Industry name"
                      className="mt-2"
                    />
                    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      No benchmarks available for this industry. All AHT,
                      containment, and deflection defaults will need to be
                      validated with the customer.
                    </div>
                  </>
                )}
              </Field>
            </div>

            {/* Benchmark sources disclosure */}
            <details className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-xs">
              <summary className="cursor-pointer font-medium">
                Benchmark sources for {benchmarks?.label ?? (customIndustry || "your industry")}
              </summary>
              {benchmarks ? (
                <ul className="mt-3 space-y-1.5 text-muted-foreground">
                  {BENCHMARK_KEYS.map((k) => {
                    const b = activeBenchmark(k);
                    if (!b) return null;
                    const overridden = !!benchmarkOverrides[k];
                    return (
                      <li key={k} className="flex flex-wrap gap-x-2">
                        <span className="font-medium text-foreground">
                          {BENCHMARK_LABELS[k]}:
                        </span>
                        <span>{b.range}</span>
                        <span>·</span>
                        <span>
                          {b.url ? (
                            <a
                              href={b.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {b.source}
                            </a>
                          ) : (
                            b.source
                          )}
                          {overridden ? " (Customer-provided)" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-3 text-muted-foreground">
                  No public benchmarks for this industry. Use customer-provided
                  values and add a source label via the "Override" button on
                  each Step 02 benchmark.
                </div>
              )}
              <div className="mt-3 text-[11px] text-muted-foreground">
                Phone AHT figures: Supp 2026 AHT Benchmarks{" "}
                (<a className="underline" href={SUPP_URL} target="_blank" rel="noopener noreferrer">supp.support</a>).
                Containment/deflection: Gartner 2024 CX & Conversational AI predictions, Zendesk CX Trends 2025.
                Rows tagged "Estimate" are interpolated where no industry-specific public median exists — please validate with customer data.
              </div>
            </details>


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
                  active={hasAgentAssist}
                  icon={<Wand2 className="h-4 w-4" />}
                  category="Cost reduction"
                  title="Agent Assist / Copilot Productivity"
                  desc="AI copilot shortens AHT, documentation, and knowledge search per interaction."
                  onClick={() => toggleUseCase("agent_assist")}
                />
                <UseCaseCard
                  active={hasRepeat}
                  icon={<Repeat className="h-4 w-4" />}
                  category="Cost reduction"
                  title="Repeat Contact Reduction"
                  desc="Lift first-contact resolution to eliminate repeat interactions."
                  onClick={() => toggleUseCase("repeat_contact")}
                />
                <UseCaseCard
                  active={hasTransfer}
                  icon={<GitBranch className="h-4 w-4" />}
                  category="Cost reduction"
                  title="Routing / Transfer Reduction"
                  desc="Smarter routing reduces transfers and the minutes lost handing off contacts."
                  onClick={() => toggleUseCase("transfer_reduction")}
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
                  {(needsAnnualVolume || hasStaffing || hasP2M) && (
                    <>
                      <SubHeader title="Volume" />
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {needsAnnualVolume && (
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
                        {hasStaffing && !needsAnnualVolume && (
                          <Field label="Total Annual Volume">
                            <NumberInput
                              value={voiceVolume}
                              onChange={setVoiceVolume}
                            />
                          </Field>
                        )}
                        {needsAgents && (
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

                  {/* Cost per Human Agent — needed for any cost-savings use case */}
                  {needsCost && (

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
                              tooltip={`Industry benchmark: ${activeBenchmark("voiceAht")?.range ?? "no benchmark for this industry"}.`}
                            >
                              <NumberInput
                                value={voiceAht}
                                onChange={setVoiceAht}
                                step={0.1}
                              />
                              <BenchmarkBadge
                                benchmark={activeBenchmark("voiceAht")}
                                value={voiceAht}
                                bkey="voiceAht"
                                overrideSet={setBenchmarkOverride}
                                override={benchmarkOverrides.voiceAht}
                              />
                            </Field>
                            <Field
                              label="Email AHT (min)"
                              tooltip={`Industry benchmark: ${activeBenchmark("emailAht")?.range ?? "no benchmark for this industry"}.`}
                            >
                              <NumberInput
                                value={emailAht}
                                onChange={setEmailAht}
                                step={0.1}
                              />
                              <BenchmarkBadge
                                benchmark={activeBenchmark("emailAht")}
                                value={emailAht}
                                bkey="emailAht"
                                overrideSet={setBenchmarkOverride}
                                override={benchmarkOverrides.emailAht}
                              />
                            </Field>
                            <Field
                              label="Messaging AHT (min)"
                              tooltip={`Industry benchmark: ${activeBenchmark("messagingAht")?.range ?? "no benchmark for this industry"}.`}
                            >
                              <NumberInput
                                value={messagingAht}
                                onChange={setMessagingAht}
                                step={0.1}
                              />
                              <BenchmarkBadge
                                benchmark={activeBenchmark("messagingAht")}
                                value={messagingAht}
                                bkey="messagingAht"
                                overrideSet={setBenchmarkOverride}
                                override={benchmarkOverrides.messagingAht}
                              />
                            </Field>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Defaults are industry benchmarks for{" "}
                            <span className="font-medium text-foreground">
                              {benchmarks?.label ?? (customIndustry || "your industry")}
                            </span>
                            . Override with customer-specific values for highest accuracy.
                          </div>
                        </>
                      ) : (
                        <Field label="Average Handle Time (minutes)">
                          <NumberInput
                            value={aht}
                            onChange={setAht}
                            step={0.1}
                          />
                          <BenchmarkBadge
                            benchmark={activeBenchmark("voiceAht")}
                            value={aht}
                            bkey="voiceAht"
                            overrideSet={setBenchmarkOverride}
                            override={benchmarkOverrides.voiceAht}
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

                  {/* Agent Assist inputs */}
                  {hasAgentAssist && (
                    <>
                      <SubHeader title="Agent Assist / Copilot" />
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field
                          label="AHT Reduction (%)"
                          tooltip={`${BENCHMARK_LIBRARY.agentAssistAhtReduction.range} typical. Source: ${BENCHMARK_LIBRARY.agentAssistAhtReduction.source}`}
                        >
                          <NumberInput value={ahtReductionPct} onChange={setAhtReductionPct} />
                        </Field>
                        <Field
                          label={`Software Investment / Annual (${currency})`}
                        >
                          <NumberInput value={agentAssistSoftware} onChange={setAgentAssistSoftware} />
                        </Field>
                      </div>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <button type="button" className="mt-1 text-xs text-muted-foreground underline underline-offset-4">
                            Optional: documentation & knowledge search time
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                          <Field label="Doc time / interaction (min)">
                            <NumberInput value={docTimeMin} onChange={setDocTimeMin} step={0.1} />
                          </Field>
                          <Field label="Knowledge search / interaction (min)">
                            <NumberInput value={knowledgeTimeMin} onChange={setKnowledgeTimeMin} step={0.1} />
                          </Field>
                          <Field label="After-call work (min)">
                            <NumberInput value={acwTimeMin} onChange={setAcwTimeMin} step={0.1} />
                          </Field>
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  )}

                  {/* Repeat Contact Reduction */}
                  {hasRepeat && (
                    <>
                      <SubHeader title="Repeat Contact Reduction" />
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field
                          label="Current Repeat Contact Rate (%)"
                          tooltip={`Benchmark ${BENCHMARK_LIBRARY.repeatContactRate.range}. Source: ${BENCHMARK_LIBRARY.repeatContactRate.source}`}
                        >
                          <NumberInput value={repeatRatePct} onChange={setRepeatRatePct} />
                        </Field>
                        <Field
                          label="Expected Reduction (%)"
                          tooltip={`Benchmark ${BENCHMARK_LIBRARY.repeatContactReduction.range}. Source: ${BENCHMARK_LIBRARY.repeatContactReduction.source}`}
                        >
                          <NumberInput value={repeatReductionPct} onChange={setRepeatReductionPct} />
                        </Field>
                      </div>
                    </>
                  )}

                  {/* Routing / Transfer Reduction */}
                  {hasTransfer && (
                    <>
                      <SubHeader title="Routing / Transfer Reduction" />
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Field
                          label="Current Transfer Rate (%)"
                          tooltip={`Benchmark ${BENCHMARK_LIBRARY.transferRate.range}. Source: ${BENCHMARK_LIBRARY.transferRate.source}`}
                        >
                          <NumberInput value={transferRatePct} onChange={setTransferRatePct} />
                        </Field>
                        <Field
                          label="Expected Reduction (%)"
                          tooltip={`Benchmark ${BENCHMARK_LIBRARY.transferReduction.range}. Source: ${BENCHMARK_LIBRARY.transferReduction.source}`}
                        >
                          <NumberInput value={transferReductionPct} onChange={setTransferReductionPct} />
                        </Field>
                        <Field
                          label="Avg Transfer Time (min)"
                          tooltip={`Benchmark ${BENCHMARK_LIBRARY.averageTransferTimeMin.range}. Source: ${BENCHMARK_LIBRARY.averageTransferTimeMin.source}`}
                        >
                          <NumberInput value={avgTransferMin} onChange={setAvgTransferMin} step={0.1} />
                        </Field>
                      </div>
                    </>
                  )}

                  {/* Advanced Assumptions for agent_assist when staffing not selected */}
                  {needsOccupancyShrinkage && !hasStaffing && (
                    <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
                      <CollapsibleTrigger asChild>
                        <button type="button" className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3 text-left text-sm">
                          <span className="font-medium">Advanced Assumptions</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${advOpen ? "rotate-180" : ""}`} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Occupancy (%)" tooltip="Productive talk/handle time as % of logged-in time.">
                          <NumberInput value={occupancy} onChange={setOccupancy} />
                        </Field>
                        <Field label="Shrinkage (%)" tooltip="Breaks, training, PTO, absenteeism.">
                          <NumberInput value={shrinkage} onChange={setShrinkage} />
                        </Field>
                      </CollapsibleContent>
                    </Collapsible>
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

              {/* Scenario & ramp controls — only meaningful when a financial use case is selected */}
              {(hasAutomation || hasP2M) && (
                <div className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Scenario
                      </div>
                      <div className="mt-2 flex gap-2">
                        <RadioPill active={scenarioMode === "conservative"} label="Conservative (−10pp)" onClick={() => setScenarioMode("conservative")} />
                        <RadioPill active={scenarioMode === "expected"} label="Expected" onClick={() => setScenarioMode("expected")} />
                        <RadioPill active={scenarioMode === "aggressive"} label="Aggressive (+10pp)" onClick={() => setScenarioMode("aggressive")} />
                      </div>
                    </div>
                    <div className="w-full md:w-auto">
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Ramp to full run-rate
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <NumberInput value={rampMonths} onChange={(n) => setRampMonths(Math.max(0, Math.min(12, n)))} />
                        <span className="text-xs text-muted-foreground">months</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Scenario adjusts containment & deflection by ±10pp. Ramp prorates Year 1 savings.
                  </div>
                </div>
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


              {/* What we used from the customer */}
              <SummaryBlock title="What we used from your data">
                {advisor.customerInputs.length > 0 ? (
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    {advisor.customerInputs.map((s, i) => (
                      <li key={i}>· {s}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No customer-provided inputs — every number below is an assumption.
                  </div>
                )}
              </SummaryBlock>

              {/* Confidence + assumptions to validate (consolidated) */}
              <SummaryBlock title={`Confidence: ${advisor.confidence.level} (${advisor.confidence.score10}/10)`}>
                {/* Segmented meter */}
                <div className="mb-3 flex gap-1">
                  {advisor.confidence.segments.map((seg, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-2 flex-1 rounded-sm transition-colors ${
                            seg.unlocked
                              ? advisor.confidence.score10 >= 8
                                ? "bg-emerald-500"
                                : advisor.confidence.score10 >= 4
                                  ? "bg-amber-500"
                                  : "bg-rose-500"
                              : "bg-border"
                          }`}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        <div className="font-medium">{seg.label}</div>
                        <div className="mt-1 text-muted-foreground">
                          {seg.unlocked ? "Unlocked." : seg.hint}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {advisor.confidence.explanation}
                </p>

                {advisor.assumedInputs.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Currently assumed
                    </div>
                    <ul className="space-y-1.5 text-sm text-foreground/90">
                      {advisor.assumedInputs.map((s, i) => (
                        <li key={i}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {advisor.toValidate.length > 0 && (
                  <div className="mt-4 rounded-lg border border-dashed border-border bg-secondary/40 p-4">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      To increase confidence, validate
                    </div>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-foreground/90">
                      {advisor.toValidate.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-foreground/60" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                          sub={`${fmtNumber(automationCalc.volume)} interactions × ${fmt.fmtCurrency2(humanCost)} human cost = ${fmt.fmtCurrency(automationCalc.baseline)}`}
                          v={fmt.fmtCurrency(automationCalc.baseline)}
                        />
                        <BreakdownRow
                          k="Automation — Final Cost"
                          sub={`${fmtNumber(automationCalc.aiResolved)} × ${fmt.fmtCurrency2(aiCost)} (AI) + ${fmtNumber(automationCalc.remainingHuman)} × ${fmt.fmtCurrency2(humanCost)} (human) = ${fmt.fmtCurrency(automationCalc.finalCost)}`}
                          v={fmt.fmtCurrency(automationCalc.finalCost)}
                        />
                        <BreakdownRow
                          k="Automation — Savings"
                          sub={`${fmt.fmtCurrency(automationCalc.baseline)} − ${fmt.fmtCurrency(automationCalc.finalCost)} = ${fmt.fmtCurrency(automationCalc.savings)}`}
                          v={fmt.fmtCurrency(automationCalc.savings)}
                          emphasis
                        />
                      </>
                    )}
                    {hasP2M && p2mCalc && (
                      <>
                        <BreakdownRow
                          k="Phone-to-Messaging — Baseline"
                          sub={`${fmtNumber(p2mPhoneVolume)} phone calls × ${fmt.fmtCurrency2(p2mPhoneCost)} = ${fmt.fmtCurrency(p2mCalc.baseline)}`}
                          v={fmt.fmtCurrency(p2mCalc.baseline)}
                        />
                        <BreakdownRow
                          k="Phone-to-Messaging — Final Cost"
                          sub={`${fmtNumber(p2mPhoneVolume - p2mCalc.shifted)} × ${fmt.fmtCurrency2(p2mPhoneCost)} (phone) + ${fmtNumber(p2mCalc.shifted)} × ${fmt.fmtCurrency2(p2mMessagingCost)} (messaging) = ${fmt.fmtCurrency(p2mCalc.finalCost)}`}
                          v={fmt.fmtCurrency(p2mCalc.finalCost)}
                        />
                        <BreakdownRow
                          k="Phone-to-Messaging — Savings"
                          sub={`${fmtNumber(p2mCalc.shifted)} shifted calls × (${fmt.fmtCurrency2(p2mPhoneCost)} − ${fmt.fmtCurrency2(p2mMessagingCost)}) = ${fmt.fmtCurrency(p2mCalc.savings)}`}
                          v={fmt.fmtCurrency(p2mCalc.savings)}
                          emphasis
                        />
                      </>
                    )}
                    <BreakdownRow
                      k="Total Annual Savings"
                      sub={
                        hasAutomation && hasP2M && automationCalc && p2mCalc
                          ? `${fmt.fmtCurrency(automationCalc.savings)} + ${fmt.fmtCurrency(p2mCalc.savings)} = ${fmt.fmtCurrency(total.savings)}`
                          : `${fmt.fmtCurrency(total.baseline)} − ${fmt.fmtCurrency(total.finalCost)} = ${fmt.fmtCurrency(total.savings)}`
                      }
                      v={fmt.fmtCurrency(total.savings)}
                      emphasis
                    />
                    <BreakdownRow
                      k="Total Software Investment"
                      sub={
                        hasAutomation && hasP2M
                          ? `${fmt.fmtCurrency(automationCalc?.software ?? 0)} (automation) + ${fmt.fmtCurrency(p2mCalc?.software ?? 0)} (P2M) = ${fmt.fmtCurrency(total.software)}`
                          : undefined
                      }
                      v={fmt.fmtCurrency(total.software)}
                    />
                    <BreakdownRow
                      k="Net Benefit"
                      sub={`${fmt.fmtCurrency(total.savings)} savings − ${fmt.fmtCurrency(total.software)} software = ${fmt.fmtCurrency(total.netBenefit)}`}
                      v={fmt.fmtCurrency(total.netBenefit)}
                      emphasis
                    />
                  </dl>
                </SummaryBlock>
              )}

              {/* Multi-year outlook */}
              {multiYear && (
                <SummaryBlock title="3-year outlook">
                  <div className="text-[11px] text-muted-foreground mb-3">
                    Year 1 prorated by ramp-up ({rampMonths} mo, {(multiYear.rows[0].attainment * 100).toFixed(0)}% attainment). Years 2–3 at full run-rate. Software cost in Year 1 only.
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm tabular-nums">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="py-2 font-medium">Year</th>
                          <th className="py-2 font-medium">Savings</th>
                          <th className="py-2 font-medium">Software</th>
                          <th className="py-2 font-medium">Net</th>
                          <th className="py-2 text-right font-medium">Cumulative</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiYear.rows.map((r) => (
                          <tr key={r.year} className="border-b border-border/60">
                            <td className="py-2.5">Year {r.year}</td>
                            <td className="py-2.5">{fmt.compactCurrency(r.savings)}</td>
                            <td className="py-2.5 text-muted-foreground">{r.software > 0 ? fmt.compactCurrency(r.software) : "—"}</td>
                            <td className="py-2.5">{fmt.compactCurrency(r.net)}</td>
                            <td className="py-2.5 text-right font-medium">{fmt.compactCurrency(r.cumulative)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    3-year cumulative ROI: <span className="font-medium text-foreground">{multiYear.cumulativeRoi.toFixed(1)}×</span>
                  </div>
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
                        onClick={() => { setCompareWith(s.name); setCompareOpen(true); }}
                      >
                        Compare
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

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Name this scenario</DialogTitle>
              <DialogDescription>
                A customer name is required to save. We'll use it as the
                scenario's label and to scope comments.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="save-name">Customer Name</Label>
              <Input
                id="save-name"
                autoFocus
                value={saveDialogName}
                onChange={(e) => setSaveDialogName(e.target.value)}
                placeholder="Acme Corporation"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveDialogName.trim()) confirmSaveDialog();
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={confirmSaveDialog} disabled={!saveDialogName.trim()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          currentSnapshot={snapshot()}
          otherName={compareWith}
        />



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
            advisor={effectiveAdvisor}
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
      <CalculatorChat
        context={{
          customerName,
          currency,
          industry,
          customIndustry,
          useCases: Array.from(useCases),
          dataSource,
          inputs: {
            numberOfAgents,
            annualVolume,
            voiceVolume,
            channelMix: { phonePct, messagingPct, emailPct },
            costMode,
            costPerInteraction,
            supportModel,
            hourlyCost,
            aht,
            useChannelAht,
            voiceAht,
            emailAht,
            messagingAht,
            aiCost,
            softwareInvestment,
            containmentMode,
            resolutionRate,
            automationType,
            p2m: {
              phoneVolume: p2mPhoneVolume,
              deflection: p2mDeflection,
              phoneCost: p2mPhoneCost,
              messagingCost: p2mMessagingCost,
              software: p2mSoftware,
            },
            occupancy,
            shrinkage,
            scenarioMode,
            rampMonths,
          },
          benchmarks,
          benchmarkOverrides,
          results: { automationCalc, p2mCalc, workforce },
        }}
      />
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

function BenchmarkBadge({
  benchmark,
  value,
  bkey,
  overrideSet,
  override,
}: {
  benchmark: BenchmarkValue | null;
  value: number;
  bkey: BenchmarkKey;
  overrideSet: (k: BenchmarkKey, v: { source: string; url?: string } | null) => void;
  override?: { source: string; url?: string };
}) {
  const [draftSource, setDraftSource] = useState(override?.source ?? "");
  const [draftUrl, setDraftUrl] = useState(override?.url ?? "");
  const [open, setOpen] = useState(false);

  // No benchmark available for this industry
  if (!benchmark) {
    return (
      <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
        <span>
          No public benchmark for this industry — please validate this value with the customer.
        </span>
        <OverrideTrigger
          open={open}
          setOpen={setOpen}
          draftSource={draftSource}
          setDraftSource={setDraftSource}
          draftUrl={draftUrl}
          setDraftUrl={setDraftUrl}
          override={override}
          onSave={() => {
            overrideSet(bkey, { source: draftSource, url: draftUrl || undefined });
            setOpen(false);
          }}
          onClear={() => {
            overrideSet(bkey, null);
            setDraftSource("");
            setDraftUrl("");
            setOpen(false);
          }}
        />
      </div>
    );
  }

  const [low, high] = parseRange(benchmark.range);
  const status: "below" | "in" | "above" =
    !isFinite(value) || value <= 0
      ? "in"
      : value < low
      ? "below"
      : value > high
      ? "above"
      : "in";
  const text =
    status === "in"
      ? `Within benchmark (${benchmark.range}).`
      : status === "below"
      ? `Below benchmark (${benchmark.range}) — verify this is realistic.`
      : `Above benchmark (${benchmark.range}) — may indicate complexity or training opportunity.`;
  const color =
    status === "in"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400";

  return (
    <div className={`mt-2 space-y-1 rounded-md border px-2.5 py-1.5 text-[11px] ${color}`}>
      <div className="flex items-start justify-between gap-2">
        <span>{text}</span>
        <OverrideTrigger
          open={open}
          setOpen={setOpen}
          draftSource={draftSource}
          setDraftSource={setDraftSource}
          draftUrl={draftUrl}
          setDraftUrl={setDraftUrl}
          override={override}
          onSave={() => {
            overrideSet(bkey, { source: draftSource, url: draftUrl || undefined });
            setOpen(false);
          }}
          onClear={() => {
            overrideSet(bkey, null);
            setDraftSource("");
            setDraftUrl("");
            setOpen(false);
          }}
        />
      </div>
      <div className="text-[10px] opacity-80">
        Source:{" "}
        {benchmark.url ? (
          <a href={benchmark.url} target="_blank" rel="noopener noreferrer" className="underline">
            {benchmark.source}
          </a>
        ) : (
          benchmark.source
        )}
        {override ? " · Customer-provided" : ""}
      </div>
    </div>
  );
}

function parseRange(s: string): [number, number] {
  // Accepts strings like "6–10 min", "25–35%", "8-12 min"
  const m = s.match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
  if (!m) return [0, Infinity];
  return [parseFloat(m[1]), parseFloat(m[2])];
}

function OverrideTrigger({
  open,
  setOpen,
  draftSource,
  setDraftSource,
  draftUrl,
  setDraftUrl,
  override,
  onSave,
  onClear,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  draftSource: string;
  setDraftSource: (s: string) => void;
  draftUrl: string;
  setDraftUrl: (s: string) => void;
  override?: { source: string; url?: string };
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-medium hover:bg-current/10"
        >
          {override ? "Edit source" : "Override"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 text-xs">
        <div className="font-medium">Override benchmark source</div>
        <div className="text-muted-foreground">
          Replace our default with your own benchmark label. The value stays whatever you typed in the field above.
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Source label
          </Label>
          <Input
            value={draftSource}
            onChange={(e) => setDraftSource(e.target.value)}
            placeholder="e.g. Internal 2026 ops audit"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            URL (optional)
          </Label>
          <Input
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div className="flex justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs">
            Clear
          </Button>
          <Button size="sm" onClick={onSave} disabled={!draftSource.trim()} className="h-7 text-xs">
            Save override
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CompareDialog({
  open,
  onOpenChange,
  currentSnapshot,
  otherName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentSnapshot: any;
  otherName: string;
}) {
  const other = useMemo(() => {
    if (!otherName) return null;
    try {
      const raw = localStorage.getItem(`outcomes-save-${otherName}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [otherName, open]);

  const diffs = useMemo(() => {
    if (!other) return [];
    const keys = Array.from(
      new Set([...Object.keys(currentSnapshot || {}), ...Object.keys(other || {})]),
    );
    const rows: { key: string; current: any; other: any }[] = [];
    keys.forEach((k) => {
      const a = (currentSnapshot as any)[k];
      const b = (other as any)[k];
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      if (sa !== sb) rows.push({ key: k, current: a, other: b });
    });
    return rows;
  }, [currentSnapshot, other]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compare with “{otherName}”</DialogTitle>
          <DialogDescription>
            Side-by-side diff of inputs between your current scenario and the saved version.
          </DialogDescription>
        </DialogHeader>
        {!other ? (
          <div className="text-sm text-muted-foreground">Saved scenario not found.</div>
        ) : diffs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No differences — inputs match exactly.</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 font-medium">Input</th>
                  <th className="py-2 font-medium">Current</th>
                  <th className="py-2 font-medium">{otherName}</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d) => (
                  <tr key={d.key} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium text-foreground">{d.key}</td>
                    <td className="py-2 pr-3">{String(JSON.stringify(d.current) ?? "—")}</td>
                    <td className="py-2 text-muted-foreground">{String(JSON.stringify(d.other) ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <div className="min-w-0 flex-1">
        <div
          className={`text-sm ${emphasis ? "font-medium text-foreground" : "text-foreground/90"}`}
        >
          {k}
        </div>
        {sub && (
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground/70 tabular-nums">
            {sub}
          </div>
        )}
      </div>
      <div
        className={`shrink-0 tabular-nums ${
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
