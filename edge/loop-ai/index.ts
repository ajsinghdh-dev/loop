import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Server key: older projects expose SUPABASE_SERVICE_ROLE_KEY, newer ones SUPABASE_SECRET_KEYS (JSON).
function serverKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return j.default || Object.values(j)[0] as string || ""; } catch { return ""; }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const DAILY_LIMIT = Number(Deno.env.get("LOOP_AI_DAILY_LIMIT") || 80);
const MODEL = Deno.env.get("LOOP_AI_MODEL") || "claude-sonnet-5-5";

const SCHOLARLY = [
  "scholar.archive.org", "semanticscholar.org", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "arxiv.org", "doi.org",
  "jstor.org", "nature.com", "science.org", "sciencedirect.com", "springer.com", "link.springer.com", "wiley.com",
  "onlinelibrary.wiley.com", "tandfonline.com", "sagepub.com", "journals.sagepub.com", "apa.org", "psycnet.apa.org",
  "cambridge.org", "academic.oup.com", "plos.org", "frontiersin.org", "mdpi.com", "nber.org", "ssrn.com", "who.int",
  "oecd.org", "statcan.gc.ca", "canada.ca", "un.org", "worldbank.org", "ipcc.ch", "britannica.com", "plato.stanford.edu",
];

const MODES: Record<string, string> = {
  learn: `MODE: LEARN. Teach step by step. Start by asking one quick question to find out what they already know (or a short retrieval question), then teach in small chunks: one idea per message, a concrete example, then a one-line check question. Wait for their reply before moving on. Don't dump everything at once.`,
  explain: `MODE: EXPLAIN. Explain simply in at most 6 short lines: the core idea in plain words, one concrete example, one common mistake. Finish with one quick check question.`,
  quiz: `MODE: QUIZ ME. Quiz them one question at a time, prioritising their fading topics and upcoming exams. Ask, then wait. After they answer: say if it's right, explain in 1-2 lines, then ask the next one. Never reveal an answer before they try unless they ask. Mix question styles (recall, apply, compare).`,
  plan: `MODE: PLAN. Build a realistic plan from their schedule (next7days), exams, readiness and goals. Use short time blocks with start times, put the hardest work where they have the most free time, include breaks, and keep it doable. These are suggestions: never claim you've added or changed anything in their calendar. Tell them they can add study blocks from the Exam Autopilot card.`,
  find: `MODE: FIND. Find concrete opportunities (clubs, events, case competitions, research positions, jobs, internships, scholarships, volunteering, wellness resources) specific to their school, interests and goals. Use web search. For each: name, one line on why it fits them, deadline if known, and a link. Prefer things with upcoming deadlines. Never invent links or dates.`,
  reflect: `MODE: REFLECT. A short, kind check-in. Ask one open question at a time about how things are going (studying, energy, stress, wins). Help them notice patterns without judging, and end with one tiny next step they choose. No toxic positivity and no lectures.`,
};

function persona(ctx: any, mode: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ctx?.tz || "America/Toronto", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return `You are Loopy, the friendly purple creature inside Loop, a "university OS" app for students.
You help ${ctx?.name || "the student"} with their university life: classes, studying, exams, clubs, applications, campus resources, wellbeing, life skills and career.
Today is ${today}. Their school: ${ctx?.uni || "unknown"}.

How you work (learning science): favour retrieval over re-reading, ask before telling when they're learning, give feedback that explains why, space things out, and be honest about uncertainty. Readiness numbers in the context are estimated ranges from practice questions, not guarantees; don't present them as exact.
Style: warm, upbeat, concise and ADHD-friendly. Short paragraphs, bullet points for options, bold the single most important action. No walls of text. Ask at most one question back.
Use web search for anything current (deadlines, events, postings, office hours, news). Never invent links, dates, deadlines, sources or quotes; if unsure, say so and suggest where to check.

Academic integrity: each course in the context may have an aiPolicy. "off" = do not explain content, solve problems or answer questions for that course; you may still help with planning, motivation and general study strategies, and say kindly that the course's AI setting is off. "tutor" = guide with questions and hints only and never produce text, code or answers that could be submitted. "open" (or missing) = normal study help. For every course: never write graded assignments, essays or take-home answers for them.
Wellbeing: if they seem stressed or overwhelmed, be kind and suggest one small next step, and mention campus wellness or counselling when it fits. If they mention being in crisis or thoughts of self-harm, urge them to contact local emergency services or a crisis line right away (in Canada, call or text 9-8-8).

${MODES[mode] || MODES.find}

What Loop knows about them (JSON, may be partial):
${JSON.stringify(ctx || {}).slice(0, 12000)}`;
}

function researchSystem(ctx: any, purpose: string, src: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are Loopy's research assistant inside Loop, a study app. Today is ${today}. The student studies at ${ctx?.uni || "a university"}${ctx?.program ? ` (${ctx.program})` : ""}.
Write a short, rigorous, cited research brief for a university student. Purpose: ${purpose || "understand the topic"}. Source preference: ${src === "scholarly" ? "peer-reviewed and official sources only" : src === "news" ? "recent reputable news, noting dates" : "reliable sources (academic, official, reputable outlets)"}.
Rules:
- Use web search. Every factual claim must come from a source you actually retrieved; the citations attach automatically.
- Never invent sources, authors, DOIs, statistics or quotes. If evidence is thin, mixed or old, say so plainly.
- Plain language first, then precise terms. Be concise: the whole brief should be readable in about 3 minutes.
- This is for learning. Do not write an essay, assignment or text meant to be submitted.
Output markdown with exactly these sections:
## Quick answer
(2-3 sentences)
## Key findings
(4-7 bullets)
## Where sources disagree or fall short
(2-4 bullets)
## Key terms
(3-6 bullets, "term: definition")
## Go deeper
(2-3 bullets on what to read or ask next)
Then, at the very end, one fenced json block (and nothing after it):
\`\`\`json
{"quiz":[{"q":"question","answer":"correct answer","wrong":["plausible wrong 1","plausible wrong 2","plausible wrong 3"],"why":"one-line explanation"}]}
\`\`\`
with exactly 4 questions based only on the findings above. Keep answers under 12 words.`;
}

const PARSE_SYSTEM = `You convert a student's pasted timetable, syllabus, club schedule or email into calendar items.
Return ONLY a JSON object, no prose, shaped like:
{"items":[{"kind":"class"|"club"|"appointment"|"exam"|"deadline"|"other","title":string,"location":string|null,"days":["MO"|"TU"|"WE"|"TH"|"FR"|"SA"|"SU"] (for weekly repeating items, else []),"date":"YYYY-MM-DD"|null (for one-off items),"start":"HH:MM"|null (24h),"end":"HH:MM"|null,"startDate":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"notes":string|null}]}
Use the year implied by context (assume the current academic year). Do not invent items that are not in the text.`;

const HINT_SYSTEM = `You give a single hint for a multiple-choice practice question. Never state or quote the correct option, never say which letter or number is right, and never eliminate down to one option.
Level 1: point to the key concept or what the question is really asking.
Level 2: give a sharper cue that narrows the reasoning (a contrast, a definition fragment or a worked first step).
At most 2 short sentences. No preamble.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "not_configured", message: "The AI key hasn't been added yet." }, 503);

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serverKey());
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "auth", message: "Sign in to talk to Loopy." }, 401);
  const uid = u.user.id;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const mode = String(body.mode || "chat");
  const cost = mode === "research" ? 3 : 1;

  // daily rate limit
  const day = new Date().toISOString().slice(0, 10);
  const { data: row } = await admin.from("loop_ai_usage").select("n").eq("user_id", uid).eq("day", day).maybeSingle();
  const used = row?.n || 0;
  if (used + cost > DAILY_LIMIT) return json({ error: "limit", message: `You've hit today's limit of ${DAILY_LIMIT} Loopy messages${cost > 1 ? " (research uses 3)" : ""}. Loopy needs a nap. Back tomorrow!` }, 429);
  await admin.from("loop_ai_usage").upsert({ user_id: uid, day, n: used + cost });

  let payload: any;
  if (mode === "hint") {
    const level = Math.min(2, Math.max(1, Number(body.level) || 1));
    const q = String(body.question || "").slice(0, 2000), opts = (Array.isArray(body.options) ? body.options : []).map((o: any) => String(o).slice(0, 300)).slice(0, 6);
    if (!q) return json({ error: "no_message" }, 400);
    payload = { model: MODEL, max_tokens: 200, system: HINT_SYSTEM, messages: [{ role: "user", content: `Hint level ${level}.\nTopic: ${String(body.topic || "").slice(0, 200)}\nQuestion: ${q}\nOptions:\n${opts.map((o: string, i: number) => `${i + 1}. ${o}`).join("\n")}\n(For your reasoning only, do not reveal: the correct option is "${String(body.answer || "").slice(0, 300)}".)` }] };
  } else if (mode === "research") {
    const question = String(body.question || "").trim().slice(0, 1500);
    if (!question) return json({ error: "no_message" }, 400);
    const src = String(body.sources || "general");
    const tool: any = { type: "web_search_20250305", name: "web_search", max_uses: 8 };
    if (src === "scholarly") tool.allowed_domains = SCHOLARLY;
    payload = { model: MODEL, max_tokens: 3500, system: researchSystem(body.context, String(body.purpose || ""), src), tools: [tool],
      messages: [{ role: "user", content: `Research question: ${question}${body.courseName ? `\nCourse: ${String(body.courseName).slice(0, 120)}` : ""}` }] };
  } else {
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-16)
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 8000) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: "no_message" }, 400);
    if (mode === "parse") payload = { model: MODEL, max_tokens: 4000, system: PARSE_SYSTEM + `\nToday is ${day}.`, messages: msgs };
    else {
      const lm = String(body.loopyMode || "find");
      const web = body.web !== false && lm !== "reflect" && lm !== "quiz";
      payload = { model: MODEL, max_tokens: 1500, system: persona(body.context, lm), messages: msgs,
        tools: web ? [{ type: "web_search_20250305", name: "web_search", max_uses: 4, ...(body.context?.city ? { user_location: { type: "approximate", city: body.context.city, country: "CA" } } : {}) }] : undefined };
    }
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok) return json({ error: "upstream", message: j?.error?.message || "AI request failed" }, 502);

  let text = (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
  const sources: any[] = [];
  for (const b of j.content || []) {
    for (const c of b.citations || []) if (c.url && !sources.some((s) => s.url === c.url)) sources.push({ title: c.title || c.url, url: c.url });
  }
  let quiz: any[] = [];
  if (mode === "research") {
    const m = text.match(/```json\s*([\s\S]*?)```\s*$/);
    if (m) {
      text = text.slice(0, m.index).trim();
      try { quiz = (JSON.parse(m[1]).quiz || []).filter((x: any) => x && x.q && x.answer && Array.isArray(x.wrong)).slice(0, 6); } catch { quiz = []; }
    }
  }
  return json({ text, sources: sources.slice(0, mode === "research" ? 15 : 8), quiz, remaining: DAILY_LIMIT - used - cost });
});
