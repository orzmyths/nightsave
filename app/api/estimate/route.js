// Server-only MiniMax proxy (preserved from v0.1) + i18n reply_locale.
// API key stays on the server and is never sent to the browser.

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
    "Numbers are USD, delivery-app pricing (a bit above dine-in). " +
    "name echoes the food as the user wrote it. note is a short neutral line under 12 words."
  );
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const query = String(body?.query || "").trim();
  const area = String(body?.area || "").trim();
  const zip = String(body?.zip || "").trim();
  const replyLocale = String(body?.reply_locale || "en");
  if (!query) return json({ error: "empty query" }, 400);

  const BASE = process.env.LLM_BASE_URL;
  const KEY = process.env.LLM_API_KEY;
  const MODEL = process.env.LLM_MODEL;

  if (!BASE || !KEY || !MODEL) {
    console.error("MiniMax config missing");
    return json(fallback(query), 200);
  }

  try {
    const res = await fetch(`${BASE.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0.4,
        system: systemPrompt(replyLocale),
        messages: [
          { role: "user", content: `Food: ${query}\nArea: ${[area, zip].filter(Boolean).join(" ") || "a typical US city"}` },
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("MiniMax API error:", res.status, errorText);
      return json(fallback(query), 200);
    }

    const data = await res.json();
    const textBlock = data?.content?.find((block) => block.type === "text");
    const raw = textBlock?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const p = JSON.parse(clean);

    return json(
      {
        name: p.name || query,
        low: Math.round(Number(p.low)),
        high: Math.round(Number(p.high)),
        typical: Math.round(Number(p.typical)),
        note: p.note || "",
      },
      200
    );
  } catch (error) {
    console.error("MiniMax request failed:", error);
    return json(fallback(query), 200);
  }
}

function fallback(query) {
  const t = 12 + Math.floor(Math.random() * 10);
  return { name: query, low: t - 3, high: t + 5, typical: t, note: "" };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
