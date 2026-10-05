// @ts-nocheck
// Vercel serverless function — generates new "sparks" for Boost mode: short,
// reusable nudges that help an ADHD / interest-based nervous system start a
// task, grouped by INCU lever (Interest, Novelty, Challenge, Urgency). Called
// only on demand from the Spark pool editor; results are merged into the shared
// pool client-side, so everyday use costs nothing.
import Anthropic from "@anthropic-ai/sdk";

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

const CATS = {
  interest: "Interest — tie the task to something enjoyable or personally meaningful (music, podcasts, snacks, people, curiosity).",
  novelty: "Novelty — make the task feel new or different (new place, new order, new method, a silly twist).",
  challenge: "Challenge — turn it into a game or test of skill (speedruns, beat-the-clock, personal records, tiny targets).",
  urgency: "Urgency — create a real but low-stakes, short deadline (timers, before-X deadlines, telling someone).",
};
const PER_CAT = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", message: "Method not allowed." });
    return;
  }
  if (!(await requireAuth(req, res))) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "not_configured", message: "Spark generation isn't configured (missing API key)." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { category, existing, tasks } = body || {};
  const cats = category && CATS[category] ? [category] : Object.keys(CATS);
  const taskList = (Array.isArray(tasks) ? tasks : []).map(t => String(t || "").slice(0, 120)).filter(Boolean).slice(0, 15);
  const existingText = cats.map(c => {
    const arr = existing && Array.isArray(existing[c]) ? existing[c].slice(0, 60) : [];
    return `${c}:\n${arr.length ? arr.map(t => `- ${t}`).join("\n") : "(none yet)"}`;
  }).join("\n\n");

  const system = `You write "sparks" for a to-do app's Boost mode, which helps people with ADHD (an interest-based nervous system) get started on tasks they're avoiding. A spark is a short, upbeat, concrete nudge from one of four levers:
${cats.map(c => `- ${CATS[c]}`).join("\n")}

Rules for every spark:
- One sentence, under 90 characters, imperative voice ("Put on…", "Race…", "Start…").
- Generic and reusable across many different tasks — never name a specific task.
- Kind and low-pressure: no guilt, shame, streaks, or productivity jargon.
- Different in substance from the existing sparks listed (not rewordings).
Return exactly ${PER_CAT} new sparks for each requested category by calling the save_sparks tool.`;

  const props = {};
  cats.forEach(c => { props[c] = { type: "array", items: { type: "string" } }; });
  const tool = {
    name: "save_sparks",
    description: "Save the new sparks, grouped by INCU category.",
    strict: true,
    input_schema: { type: "object", properties: props, required: cats, additionalProperties: false },
  };

  const user = `Existing sparks (don't repeat these):\n\n${existingText}${taskList.length ? `\n\nFor flavor, the user's current tasks look like this (keep sparks generic, but useful for this kind of task):\n${taskList.map(t => `- ${t}`).join("\n")}` : ""}\n\nWrite ${PER_CAT} new sparks for: ${cats.join(", ")}.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      tools: [tool],
      tool_choice: { type: "auto" }, // forced tool_choice isn't supported on this model; the prompt + strict schema steer it
      messages: [{ role: "user", content: user }],
    });
    if (msg.stop_reason === "refusal") {
      res.status(422).json({ error: "refused", message: "Couldn't generate sparks this time. Try again." });
      return;
    }
    const tu = (msg.content || []).find(c => c.type === "tool_use" && c.name === "save_sparks");
    const sparks = {};
    if (tu && tu.input && typeof tu.input === "object") {
      cats.forEach(c => {
        const arr = Array.isArray(tu.input[c]) ? tu.input[c] : [];
        sparks[c] = arr.map(t => String(t || "").trim()).filter(t => t && t.length <= 160).slice(0, PER_CAT * 2);
      });
    }
    if (!Object.values(sparks).some(a => a.length)) {
      res.status(502).json({ error: "empty", message: "Claude didn't return any sparks. Try again." });
      return;
    }
    res.status(200).json({ sparks });
  } catch (e) {
    const status = e?.status;
    const errMsg = e?.error?.error?.message || e?.message || "";
    if (status === 400 && /credit balance/i.test(errMsg)) {
      res.status(402).json({ error: "low_balance", message: "API balance too low. Top up your credits at console.anthropic.com and try again." });
      return;
    }
    if (status === 429) {
      res.status(429).json({ error: "rate_limited", message: "Too many requests right now. Wait a moment and try again." });
      return;
    }
    res.status(500).json({ error: "server_error", message: errMsg ? "Spark generation failed: " + errMsg : "Spark generation failed. Please try again." });
  }
}
