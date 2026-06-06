// @ts-nocheck
// Vercel serverless function — batch-categorizes grocery item names into a
// store's sections using Claude. Called only for items not already cached, so
// API usage stays minimal.
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "./_auth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", message: "Method not allowed." });
    return;
  }
  if (!(await requireAuth(req, res))) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "not_configured", message: "Categorization isn't configured (missing API key)." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { names, sections } = body || {};
  if (!Array.isArray(names) || names.length === 0 || !Array.isArray(sections) || sections.length === 0) {
    res.status(400).json({ error: "bad_request", message: "Need names and sections." });
    return;
  }

  const validIds = sections.map(s => s.id);
  const layoutText = sections.map(s => `${s.id} = ${s.label}${s.hints ? `: ${s.hints}` : ""}`).join("\n");
  const system = `You sort grocery items into a specific store's sections so a shopper can walk the list in aisle order.
Assign each item to the single best section id from the list below. Match how THIS store organizes things — pay attention to the hints (e.g. frozen vegetables go to the frozen aisle, not produce; canned beans to the canned aisle, not produce).
Use ONLY these section ids. If something genuinely doesn't fit, use "other".

Sections:
${layoutText}`;

  const tool = {
    name: "categorize",
    description: "Assign each grocery item to the best store section id.",
    input_schema: {
      type: "object",
      properties: {
        assignments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "the item, exactly as given" },
              section: { type: "string", enum: validIds },
            },
            required: ["name", "section"],
          },
        },
      },
      required: ["assignments"],
    },
  };

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: "categorize" },
      messages: [{ role: "user", content: `Categorize these grocery items:\n${names.map(n => `- ${n}`).join("\n")}` }],
    });
    const tu = (msg.content || []).find(c => c.type === "tool_use");
    const categories = {};
    if (tu && tu.input && Array.isArray(tu.input.assignments)) {
      tu.input.assignments.forEach(a => {
        if (a && a.name) categories[a.name] = validIds.includes(a.section) ? a.section : "other";
      });
    }
    res.status(200).json({ categories });
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
    res.status(500).json({ error: "server_error", message: errMsg ? "Categorize failed: " + errMsg : "Categorize failed. Please try again." });
  }
}
