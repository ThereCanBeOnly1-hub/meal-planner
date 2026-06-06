// @ts-nocheck
// Vercel serverless function — extracts a structured recipe from a website URL
// or a cookbook photo using Claude, returning JSON shaped for the recipe editor.
import Anthropic from "@anthropic-ai/sdk";

// Cap the function so it can never hang for minutes (Claude + page fetch).
export const config = { maxDuration: 60 };

// Require a valid Supabase session before spending Claude credits.
async function requireAuth(req, res) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const ANON = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON) { res.status(500).json({ error: "not_configured", message: "Auth isn't configured on the server." }); return false; }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) { res.status(401).json({ error: "unauthorized", message: "Please sign in and try again." }); return false; }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
    if (!r.ok) { res.status(401).json({ error: "unauthorized", message: "Your session expired — sign in again." }); return false; }
    return true;
  } catch { res.status(401).json({ error: "unauthorized", message: "Couldn't verify your session." }); return false; }
}

// Keep these in sync with the tag vocab in src/App.tsx so Claude maps onto
// tags the app already knows about (it omits anything that doesn't fit).
const MEAL_TYPE_TAGS = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert"];
const DIET_TAGS = ["Gluten-Free", "Dairy-Free", "Low Sodium", "Low Carb", "Vegetarian", "Vegan", "Nut-Free", "High Protein"];
const CUISINE_TAGS = ["American", "Italian", "Mexican", "Asian", "Mediterranean", "Indian", "Chinese", "Japanese", "Thai", "French", "Greek", "Middle Eastern", "BBQ", "Comfort Food", "Seafood"];

const SYSTEM = `You extract structured recipe data and return it via the save_recipe tool.

Rules:
- Be faithful to the source. Never invent ingredients, steps, times, or quantities. If something isn't present, leave it empty/omit it.
- Split each ingredient into amount (e.g. "2", "1 1/2"), unit (e.g. "cup", "tbsp", "g" — empty if none like "2 eggs"), and name (e.g. "all-purpose flour, sifted"). Keep prep notes in the name.
- Convert any ISO-8601 durations (PT30M) or raw numbers into short human strings like "30 min" or "1 hr 15 min".
- baseServings: a single integer parsed from the yield (e.g. "Serves 4-6" -> 4, "Makes 12 cookies" -> 12). Default 4 if unknown.
- steps: an ordered array of plain instruction strings, no leading numbers.
- photo: only set it to a direct, absolute image URL found in the source (e.g. JSON-LD "image"). Leave empty otherwise. Never use a photo for image-based input.

Tags:
- mealTypes: ONLY use values from this exact list — ${MEAL_TYPE_TAGS.join(", ")}. Omit any that don't clearly apply. Never coin new meal types.
- dietTags: STRONGLY prefer these existing tags — ${DIET_TAGS.join(", ")}. Only if a clearly-applicable dietary label genuinely isn't covered (e.g. Keto, Paleo, Whole30, Pescatarian) may you add it, as a single canonical capitalized term matching the style above.
- cuisineTags: STRONGLY prefer these existing tags — ${CUISINE_TAGS.join(", ")}. Only if the recipe's cuisine genuinely isn't covered (e.g. Korean, Vietnamese, Spanish, Cajun) may you add it, as a single canonical capitalized term.
- Across dietTags and cuisineTags combined, add AT MOST 1-2 brand-new tags total, and only when nothing existing fits. When unsure, prefer an existing tag or omit. Only tag what the recipe clearly is — do not guess.`;

const TOOL = {
  name: "save_recipe",
  description: "Save the extracted recipe in the app's format.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string", description: "Short description, if present" },
      photo: { type: "string", description: "Absolute image URL from the source, else empty" },
      url: { type: "string", description: "The source recipe URL, if known" },
      prepTime: { type: "string", description: 'Human readable, e.g. "15 min"' },
      cookTime: { type: "string", description: 'Human readable, e.g. "30 min"' },
      baseServings: { type: "integer" },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            amount: { type: "string" },
            unit: { type: "string" },
            name: { type: "string" },
          },
          required: ["name"],
        },
      },
      steps: { type: "array", items: { type: "string" } },
      mealTypes: { type: "array", items: { type: "string", enum: MEAL_TYPE_TAGS } },
      dietTags: { type: "array", items: { type: "string" }, description: "Prefer existing diet tags; at most one canonical new tag if nothing fits" },
      cuisineTags: { type: "array", items: { type: "string" }, description: "Prefer existing cuisine tags; at most one canonical new tag if nothing fits" },
      notes: { type: "string", description: "Tips/substitutions only if the source has them; usually empty" },
    },
    required: ["name", "ingredients", "steps"],
  },
};

async function fetchPageContent(url) {
  let resp;
  try {
    resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000), // don't hang on slow/blocking sites
    });
  } catch (e) {
    const err = new Error("page_fetch_failed");
    err.code = "page_fetch_failed";
    throw err;
  }
  if (!resp.ok) {
    const err = new Error("page_fetch_failed");
    err.code = "page_fetch_failed";
    throw err;
  }
  const html = await resp.text();

  // Prefer schema.org JSON-LD blocks — deterministic and compact.
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1].trim());
  if (blocks.length) {
    return "Source: " + url + "\n\nJSON-LD structured data:\n" + blocks.join("\n\n").slice(0, 20000);
  }

  // Fallback: strip tags and hand Claude the page text.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
  return "Source: " + url + "\n\nPage text:\n" + text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", message: "Method not allowed." });
    return;
  }
  if (!(await requireAuth(req, res))) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "not_configured", message: "Import isn't configured (missing API key)." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { type, url, imageBase64 } = body || {};

  try {
    let userContent;
    if (type === "url") {
      if (!url || !/^https?:\/\//i.test(url)) {
        res.status(400).json({ error: "bad_request", message: "Enter a valid recipe URL starting with http(s)://" });
        return;
      }
      const pageContent = await fetchPageContent(url);
      userContent = [{ type: "text", text: "Extract the recipe from this page.\n\n" + pageContent }];
    } else if (type === "photo") {
      if (!imageBase64) {
        res.status(400).json({ error: "bad_request", message: "No image was provided." });
        return;
      }
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(imageBase64);
      const mediaType = match ? match[1] : "image/jpeg";
      const data = match ? match[2] : imageBase64;
      userContent = [
        { type: "image", source: { type: "base64", media_type: mediaType, data } },
        { type: "text", text: "Extract the recipe shown in this image." },
      ];
    } else {
      res.status(400).json({ error: "bad_request", message: "Unknown import type." });
      return;
    }

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "save_recipe" },
      messages: [{ role: "user", content: userContent }],
    });

    const toolUse = (msg.content || []).find((c) => c.type === "tool_use");
    if (!toolUse) {
      res.status(422).json({ error: "no_recipe", message: "Couldn't find a recipe to import. Try a photo or enter it manually." });
      return;
    }

    const recipe = toolUse.input || {};
    if (type === "url" && url && !recipe.url) recipe.url = url;
    res.status(200).json({ recipe });
  } catch (e) {
    const status = e?.status;
    const errMsg = e?.error?.error?.message || e?.message || "";

    if (e?.code === "page_fetch_failed") {
      res.status(422).json({ error: "fetch_failed", message: "Couldn't load that URL. It may be private, paywalled, or blocking automated access." });
      return;
    }
    if (status === 401 || status === 403) {
      res.status(500).json({ error: "auth", message: "Import isn't configured correctly (API key rejected)." });
      return;
    }
    if (status === 400 && /credit balance/i.test(errMsg)) {
      res.status(402).json({ error: "low_balance", message: "API balance too low. Top up your credits at console.anthropic.com and try again." });
      return;
    }
    if (status === 429) {
      res.status(429).json({ error: "rate_limited", message: "Too many requests right now. Wait a moment and try again." });
      return;
    }
    res.status(500).json({ error: "server_error", message: errMsg ? "Import failed: " + errMsg : "Import failed. Please try again." });
  }
}
