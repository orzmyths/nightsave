// Server-only. API key lives here in an env var and is NEVER sent to the browser.
// Provider-agnostic: any OpenAI-compatible chat endpoint (MiniMax, OpenRouter, ...).

export const runtime = "nodejs";

const LOCALE_NAMES = {
  en: "English",
  "zh-Hant": "Traditional Chinese",
  "zh-Hans": "Simplified Chinese",
  es: "Spanish",
  ja: "Japanese",
  ko: "Korean",
};

function systemPrompt(replyLocale) {
  const lang = LOCALE_NAMES[replyLocale] || "English";
  return (
    "You estimate what a single takeout/delivery order of a named food typically costs in the given area. " +
    "The food name may be in ANY language — understand it as written, never translate or rename it. " +
    `Write the 'note' field in ${lang}. ` +
    "Reply with ONLY a JSON object, no prose, no markdown, no backticks. " +
    'Shape: {"name": string, "low": number, "high": number, "typical": number, "note": string}. ' +
    "Numbers are USD, delivery-app pricing (a bit above dine-in). name echoes the food as the user wrote it. " +
    "note is a short neutral line under 12 words. If input is not food, still return a best-guess snack."
  );
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }

  const query = String(body?.query || "").trim();
  const area = String(body?.area || "").trim();
  const replyLocale = String(body?.reply_locale || "en");
  if (!query) return json({ error: "empty query" }, 400);

  const BASE = process.env.LLM_BASE_URL;
  const KEY = process.env.LLM_API_KEY;
  const MODEL = process.env.LLM_MODEL;

  if (!BASE || !KEY || !MODEL) return json(fallback(query), 200);

  try {
    const res = await fetch(`${BASE.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt(replyLocale) },
          { role: "user", content: `Food: ${query}\nArea: ${area || "a typical US city"}` },
        ],
      }),
    });
    if (!res.ok) return json(fallback(query), 200);

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const p = JSON.parse(String(raw).replace(/```json|```/g, "").trim());
    return json({
      name: p.name || query,
      low: Math.round(p.low),
      high: Math.round(p.high),
      typical: Math.round(p.typical),
      note: p.note || "",
    }, 200);
  } catch {
    return json(fallback(query), 200);
  }
}

function fallback(query) {
  const t = 12 + Math.floor(Math.random() * 10);
  return { name: query, low: t - 3, high: t + 5, typical: t, note: "" };
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
