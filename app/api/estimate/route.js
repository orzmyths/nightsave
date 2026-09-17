// Server-only LLM pricing proxy. API key stays on the server, never in the browser.
// Preserved from v0.1: Anthropic-style /v1/messages shape (x-api-key,
// anthropic-version, separate `system`, parse content[].text).
// NOTE: confirm LLM_BASE_URL/LLM_MODEL point at an Anthropic-compatible endpoint.

import { getCachedEstimate, saveCachedEstimate } from "../../../lib/estimateCache";
import { MAX_INPUT_LEN, MAX_ITEMS, MAX_QTY_PER_ITEM, MAX_TOTAL_QTY } from "../../../lib/orderLimits";

export const runtime = "nodejs";

const M3_TIMEOUT_MS = 30_000;

// AbortSignal.timeout() is Node 17.3+ / all modern runtimes this app targets,
// but fall back to a manual AbortController if it's ever missing.
function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error("timeout")), ms);
  return controller.signal;
}

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
    "You estimate how much a user would REALISTICALLY spend if they placed this " +
    "takeout/delivery order right now — the checkout total, not just the menu price. " +
    "The food name may be in ANY language; understand it as written, never translate or rename it. " +
    "\n\nSTEP 1 — Identify every distinct food or drink item being requested, and its quantity. " +
    "The input can name ONE item or SEVERAL — never collapse a multi-item order into a single " +
    "generic meal. A comma-separated list, \"and\", or any other clearly multi-item phrasing each " +
    "name a SEPARATE item; do not merge them and do not omit any of them. If the user states a " +
    "quantity (a number, \"two\", \"a couple\", etc.) for an item, use it; otherwise its quantity is 1. " +
    "Never invent an item that wasn't requested. Structural examples (prices below are illustrative " +
    "only, not targets):\n" +
    '  "popcorn chicken, milk tea, ramen" = three distinct items, quantity 1 each.\n' +
    '  "2 milk teas and 1 ramen" = milk tea quantity 2, ramen quantity 1.\n' +
    '  "pizza for two" = one item; use your judgment on a group-appropriate size/quantity.\n' +
    "\n\nSTEP 2 — Estimate each identified item's realistic per-unit delivery-app price SEPARATELY, " +
    "in USD, from the food, city and ZIP given. Do NOT use fixed/default numbers. " +
    "\n\nSTEP 3 — Estimate the local sales tax rate, a service fee, and a delivery fee for this " +
    "city/ZIP; these apply once to the whole order, not per item. Do NOT include any tip. " +
    "Do NOT inflate prices — be realistic, not exaggerated — but do NOT artificially shrink a " +
    "genuinely large or expensive order either. " +
    `Write the 'note' field in ${lang}. ` +
    "Think privately and briefly (at most 2 short sentences) before answering, " +
    "then reply with ONLY a JSON object, no prose, no markdown, no backticks. Shape: " +
    '{"name": string, "recognizedItems": [{"name": string, "quantity": number, ' +
    '"estimatedUnitPrice": number}], "estimatedTaxRate": number, "estimatedServiceFee": number, ' +
    '"estimatedDeliveryFee": number, "low": number, "high": number, "note": string}. ' +
    "recognizedItems must have exactly one entry per distinct item (1 to 10 entries) — never merge " +
    "separate items into one entry and never leave a requested item out. " +
    "IMPORTANT — currency: every money value (estimatedUnitPrice, estimatedServiceFee, " +
    "estimatedDeliveryFee, low, high) MUST be in US dollars (USD), even when the city " +
    "is outside the US. If you first think in the local currency, CONVERT it to its approximate " +
    "USD value before writing the number — never output a local-currency number unconverted. " +
    "Rough sanity anchors, NOT hard caps: a single drink or snack is often under $10 USD, and a " +
    "full meal for one person is often under $30 USD — but these describe a typical SINGLE item " +
    "only. A multi-item order, a premium dish (e.g. sushi, steak), or an order sized for a group " +
    "can legitimately and correctly total well above $30; never shrink a realistic estimate just " +
    "to stay under these numbers. " +
    "estimatedTaxRate is a percentage number (e.g. 9.4 means 9.4%). " +
    "low/high are a realistic checkout-total range (all items + tax + fees) for the WHOLE order. " +
    "name echoes the whole order as the user wrote it. note is a short neutral line under 12 words."
  );
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const query = String(body?.query || "").trim();
  const area = String(body?.area || "").trim();
  const zip = String(body?.zip || "").trim();
  const replyLocale = String(body?.reply_locale || "en");
  if (!query) return json({ error: "empty_query" }, 400);
  if (query.length > MAX_INPUT_LEN) {
    return json({ error: "input_too_long", reason: "input_too_long", limit: MAX_INPUT_LEN }, 400);
  }

  const BASE = process.env.LLM_BASE_URL;
  const KEY = process.env.LLM_API_KEY;
  const MODEL = process.env.LLM_MODEL;

  // No provider configured → signal unavailable. NEVER invent pricing.
  if (!BASE || !KEY || !MODEL) {
    console.error("[estimate] LLM config missing (LLM_BASE_URL/LLM_API_KEY/LLM_MODEL)");
    return json({ error: "estimate_unavailable", reason: "config" }, 503);
  }

  const cacheInput = { food: query, city: area, zip, replyLocale };

  // Same normalized food+city+zip within the last 24h → reuse that estimate
  // instead of asking the LLM again (faster, and avoids the price drifting
  // between repeat searches for the same order). A lookup failure just
  // falls through to the LLM path below; caching never blocks an estimate.
  const cached = await getCachedEstimate(cacheInput);
  if (cached) {
    return json({ ...cached, name: cached.name || query }, 200);
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(`${BASE.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      signal: timeoutSignal(M3_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        // The configured model emits a `thinking` content block before its
        // final `text` block. 500 tokens was only enough for the reasoning,
        // so the JSON answer was truncated (or never started) and `raw`
        // came back empty. Give enough headroom for thinking + the answer.
        max_tokens: 1500,
        temperature: 0.4,
        system: systemPrompt(replyLocale),
        messages: [
          {
            role: "user",
            content: `Food: ${query}\nCity: ${area || "(not given)"}\nZIP: ${zip || "(not given)"}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(
        "[estimate] LLM API error:",
        res.status,
        errorText,
        `(${Date.now() - startedAt}ms)`
      );
      return json({ error: "estimate_unavailable", reason: "upstream" }, 502);
    }

    const data = await res.json();
    console.log(`[estimate] LLM call took ${Date.now() - startedAt}ms`);

    // The model may emit multiple content blocks (e.g. a `thinking` block
    // ahead of its `text` answer); concatenate every text block rather than
    // assuming the first/only one holds the answer.
    const raw = (data?.content || [])
      .filter((b) => b?.type === "text")
      .map((b) => b.text || "")
      .join("")
      .trim();

    let p;
    try {
      p = JSON.parse(stripToJsonObject(raw));
    } catch (e) {
      console.error(
        "[estimate] failed to parse model JSON:",
        raw ? raw.slice(0, 200) : `(empty text; stop_reason=${data?.stop_reason})`
      );
      return json({ error: "estimate_unavailable", reason: "parse" }, 502);
    }

    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

    // ---- recognizedItems: validate every item before trusting any math on it ----
    const rawItems = Array.isArray(p.recognizedItems) ? p.recognizedItems : [];
    if (rawItems.length === 0) {
      console.error("[estimate] model returned no recognizedItems:", raw.slice(0, 200));
      return json({ error: "estimate_unavailable", reason: "parse" }, 502);
    }

    const items = [];
    for (const entry of rawItems) {
      const name = String(entry?.name || "").trim();
      const unitPrice = num(entry?.estimatedUnitPrice);
      if (!name || unitPrice == null || unitPrice < 0) {
        console.error("[estimate] model returned an unusable item:", JSON.stringify(entry).slice(0, 200));
        return json({ error: "estimate_unavailable", reason: "parse" }, 502);
      }
      // Quantity is genuinely OMITTED → default to 1 (matches the prompt's
      // "no quantity stated means 1" rule). Quantity is PROVIDED but not a
      // valid positive integer → that's the model contradicting its own
      // output, not an omission; reject rather than silently repair it.
      const qtyRaw = entry?.quantity;
      let quantity;
      if (qtyRaw === undefined || qtyRaw === null) {
        quantity = 1;
      } else {
        const qtyNum = Number(qtyRaw);
        if (!Number.isFinite(qtyNum) || !Number.isInteger(qtyNum) || qtyNum < 1) {
          console.error("[estimate] model returned an invalid quantity:", JSON.stringify(entry).slice(0, 200));
          return json({ error: "estimate_unavailable", reason: "parse" }, 502);
        }
        quantity = qtyNum;
      }
      items.push({ name, quantity, estimatedUnitPrice: round2(unitPrice) });
    }

    // ---- defensive order-size limits — reject outright, never silently truncate ----
    if (items.length > MAX_ITEMS) {
      return json({ error: "order_too_large", reason: "too_many_items", limit: MAX_ITEMS }, 400);
    }
    if (items.some((it) => it.quantity > MAX_QTY_PER_ITEM)) {
      return json({ error: "order_too_large", reason: "quantity_too_high", limit: MAX_QTY_PER_ITEM }, 400);
    }
    const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);
    if (totalQuantity > MAX_TOTAL_QTY) {
      return json({ error: "order_too_large", reason: "total_quantity_too_high", limit: MAX_TOTAL_QTY }, 400);
    }

    // ---- server-computed totals — never trust the model's own arithmetic ----
    const foodSubtotal = round2(items.reduce((sum, it) => sum + it.quantity * it.estimatedUnitPrice, 0));
    const estimatedTaxRate = num(p.estimatedTaxRate); // percentage, e.g. 9.4 means 9.4% (existing convention)
    const normalizedTaxRate = estimatedTaxRate != null ? estimatedTaxRate / 100 : 0;
    const estimatedTax = round2(foodSubtotal * normalizedTaxRate);
    const estimatedServiceFee = round2(num(p.estimatedServiceFee));
    const estimatedDeliveryFee = round2(num(p.estimatedDeliveryFee));
    const typical = round2(
      foodSubtotal + estimatedTax + (estimatedServiceFee || 0) + (estimatedDeliveryFee || 0)
    );

    // A usable estimate needs a positive total. Otherwise treat as unavailable.
    if (typical == null || typical <= 0) {
      console.error("[estimate] computed an unusable total:", raw.slice(0, 200));
      return json({ error: "estimate_unavailable", reason: "empty" }, 502);
    }

    let low = round2(num(p.low));
    let high = round2(num(p.high));
    if (low == null) low = typical;
    if (high == null) high = typical;
    if (low > high) { const swap = low; low = high; high = swap; }

    // `typical` is authoritative — it's built entirely from server-validated
    // items, tax and fees, never from the model's own arithmetic. low/high is
    // only a supplementary "likely range" hint on top of it. If that hint
    // doesn't bracket the real total, widen it rather than throw away an
    // otherwise fully valid, correctly-computed estimate over a cosmetic
    // mismatch in an auxiliary display field.
    if (low > typical) {
      console.error(`[estimate] low (${low}) above computed typical (${typical}); widening range`);
      low = typical;
    }
    if (high < typical) {
      console.error(`[estimate] high (${high}) below computed typical (${typical}); widening range`);
      high = typical;
    }

    const result = {
      name: p.name || query,
      recognizedItems: items,
      itemPrice: foodSubtotal, // combined food subtotal across all recognized items
      estimatedTaxRate,
      estimatedTax,
      estimatedServiceFee,
      estimatedDeliveryFee,
      low,
      high,
      typical,
      note: p.note || "",
    };

    // Cache only this validated, complete estimate — never a failed/partial
    // one, and never the user's later-edited Confirmed Amount (that's saved
    // separately, into decisions/History, not here). Awaited (not
    // fire-and-forget) because a serverless function can be frozen right
    // after it returns a response, before a detached write finishes; the
    // write itself is a single small upsert, negligible next to LLM latency.
    await saveCachedEstimate(cacheInput, result);

    return json({ ...result, source: "llm" }, 200);
  } catch (error) {
    // AbortSignal.timeout() rejects fetch with a TimeoutError (some runtimes
    // surface it as AbortError instead) — distinguish that from a genuine
    // network/provider failure so logs and the client can tell them apart.
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      console.error(`[estimate] M3 request timed out after ${Date.now() - startedAt}ms (limit ${M3_TIMEOUT_MS}ms)`);
      return json({ error: "estimate_timeout" }, 504);
    }
    console.error("[estimate] request failed:", error);
    return json({ error: "estimate_unavailable", reason: "network" }, 502);
  }
}

// Model is instructed to reply with ONLY a JSON object, but tolerate the
// harmless variations we actually see: ```json fences and stray prose
// around the object. Never invents data — just narrows to the {...} span.
function stripToJsonObject(raw) {
  const fenced = raw.replace(/```json|```/gi, "").trim();
  if (fenced.startsWith("{") && fenced.endsWith("}")) return fenced;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start !== -1 && end > start) return fenced.slice(start, end + 1);
  return fenced;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
