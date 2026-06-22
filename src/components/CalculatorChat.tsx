import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CalculatorChatProps = {
  // Arbitrary serializable snapshot of the current calculator state.
  context: unknown;
};

const SUGGESTIONS = [
  "Explain my current ROI in plain English",
  "What does AHT mean and how is it used here?",
  "Where do these benchmarks come from?",
  "How can I make the business case stronger?",
];

export function CalculatorChat({ context }: CalculatorChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep latest context in a ref so the transport body always sends current state.
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, id }) => ({
          body: { id, messages, calculatorContext: contextRef.current },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (text: string) => {
    const value = text.trim();
    if (!value || isLoading) return;
    setInput("");
    await sendMessage({ text: value });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg shadow-black/20 transition hover:scale-[1.02] hover:shadow-xl"
          aria-label="Open calculator assistant"
        >
          <MessageCircle className="h-4 w-4" />
          Ask about this calculator
        </button>
      )}

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-[640px] max-h-[calc(100vh-3rem)] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl transition-all duration-200",
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0",
        )}
        role="dialog"
        aria-label="Calculator assistant"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Calculator Assistant</div>
              <div className="text-xs text-muted-foreground">
                Ask about your inputs, benchmarks &amp; outputs
              </div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto bg-muted/30 px-4 py-4"
        >
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="rounded-lg bg-background p-3 text-sm leading-relaxed text-foreground shadow-sm">
                Hi! I can only answer questions about <strong>this</strong>{" "}
                calculator — your inputs, benchmarks, formulas, and outputs.
                What would you like to understand?
              </div>
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:border-foreground/40 hover:bg-background"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const text = m.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}
              >
                {!isUser && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    isUser
                      ? "bg-foreground text-background"
                      : "bg-background text-foreground shadow-sm",
                  )}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{text}</div>
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0 prose-headings:my-2 prose-pre:my-2 prose-code:text-xs">
                      <ReactMarkdown>{text || "…"}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex gap-2">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-2xl bg-background px-3.5 py-2.5 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Something went wrong. Please try again.
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend(input);
          }}
          className="border-t border-border bg-background p-3"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2 focus-within:border-foreground/40">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend(input);
                }
              }}
              placeholder="Ask about your calculator…"
              rows={1}
              className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => stop()}
                className="h-8"
              >
                Stop
              </Button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition hover:opacity-90 disabled:opacity-30"
                aria-label="Send"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-1.5 text-center text-[10px] text-muted-foreground">
            Scoped to this calculator only. May make mistakes — verify key numbers.
          </div>
        </form>
      </div>
    </>
  );
}
