import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type ChatRequestBody = {
  messages?: unknown;
  calculatorContext?: unknown;
};

const SYSTEM_PROMPT = `You are the Outcomes Calculator Assistant — an embedded helper inside a contact-center business-case calculator.

STRICT SCOPE: You ONLY answer questions about THIS calculator: its inputs, benchmarks, formulas, outputs, assumptions, sources, how to interpret the numbers, what a metric means, how to model a scenario, how to override a benchmark, what AHT/containment/deflection/occupancy/shrinkage mean in this context, how the ROI/NPV/payback is computed, and what the current values shown in the user's session imply.

If asked about anything else (general knowledge, other tools, coding help, weather, news, personal advice, other companies' products, etc.) politely refuse in one short sentence and steer the user back to questions about the calculator.

Use the CURRENT CALCULATOR STATE (provided as JSON below) to ground every answer in the user's actual inputs. Quote the user's own numbers. Be concise, practical, and use markdown (short paragraphs, bullets, and bold metric names). Never invent benchmark sources — if a source isn't in the state, say so.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequestBody;
        const { messages, calculatorContext } = body;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const contextBlock = calculatorContext
          ? `\n\nCURRENT CALCULATOR STATE (JSON):\n\`\`\`json\n${JSON.stringify(calculatorContext, null, 2)}\n\`\`\``
          : "\n\n(No calculator state was provided yet.)";

        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM_PROMPT + contextBlock,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
