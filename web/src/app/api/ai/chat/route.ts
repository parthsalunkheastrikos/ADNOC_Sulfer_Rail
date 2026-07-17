// AI Copilot chat route — the only place the Gemini API key is used. The
// key never reaches the browser: this route reads it from process.env,
// calls Gemini's REST API server-side, and streams back plain text deltas
// as SSE frames the client can render incrementally.
//
// Architecture rule (see plan): the LLM never touches the control loop. This
// route is read-only — it receives a JSON snapshot of engine/store state
// from the client (src/lib/ai/context.ts) and never calls back into any
// plant/engine API itself.
import { SYSTEM_PROMPT, DEFAULT_MODEL } from "@/lib/ai/systemPrompt";
import type { AiContext } from "@/lib/ai/context";

const MAX_HISTORY_TURNS = 20;
const RATE_LIMIT_PER_MIN = 20;

interface ChatTurn {
  role: "user" | "model";
  text: string;
}

interface ChatRequestBody {
  messages: ChatTurn[];
  context: AiContext;
}

// In-memory, single-process rate limiter — adequate for a local/demo
// deployment; the key is real even though the app is a POC, so an
// unauthenticated route with zero throttling would be irresponsible.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT_PER_MIN;
}

function clientKeyFrom(req: Request): string {
  return req.headers.get("x-forwarded-for") ?? "local";
}

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AI assistant unavailable — console unaffected. (No API key configured.)" },
      { status: 503 },
    );
  }

  if (isRateLimited(clientKeyFrom(req))) {
    return Response.json(
      { error: "AI assistant is busy — please wait a moment before asking again." },
      { status: 429 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || !body.context) {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const turns = body.messages.slice(-MAX_HISTORY_TURNS);
  const contextJson = JSON.stringify(body.context).slice(0, 20_000); // hard cap, defensive

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  // The live JSON snapshot is injected as the first turn so it's always the
  // freshest data in the conversation, distinct from the static system
  // prompt (which only explains what the fields mean).
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `Current console data snapshot (JSON). Use only this for any numbers you cite:\n\n${contextJson}`,
        },
      ],
    },
    {
      role: "model",
      parts: [{ text: "Understood — I'll answer only from that snapshot and say so if something isn't in it." }],
    },
    ...turns.map((t) => ({
      role: t.role,
      parts: [{ text: t.text.slice(0, 4000) }],
    })),
  ];

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    });
  } catch {
    return Response.json(
      { error: "AI assistant unavailable — console unaffected. (Network error reaching Gemini.)" },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status;
    const reason =
      status === 429
        ? "Gemini quota/rate limit reached."
        : status >= 500
          ? "Gemini service error."
          : `Gemini request rejected (${status}).`;
    return Response.json({ error: `AI assistant unavailable — console unaffected. (${reason})` }, { status: 502 });
  }

  const upstreamBody = upstream.body;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const text = parsed?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
              if (text) controller.enqueue(new TextEncoder().encode(sseFrame({ text })));
              const finishReason = parsed?.candidates?.[0]?.finishReason;
              if (finishReason && finishReason !== "STOP") {
                controller.enqueue(
                  new TextEncoder().encode(
                    sseFrame({ text: `\n\n_[response truncated: ${finishReason}]_` }),
                  ),
                );
              }
            } catch {
              // Ignore malformed partial SSE frames — the next chunk read
              // will complete a valid JSON line in the common case.
            }
          }
        }
      } catch {
        controller.enqueue(
          new TextEncoder().encode(sseFrame({ text: "\n\n_[AI assistant connection interrupted]_" })),
        );
      } finally {
        controller.enqueue(new TextEncoder().encode(sseFrame({ done: true })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
