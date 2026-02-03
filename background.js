const GROQ_API_KEY = "api-key";
const GROQ_MODEL = "llama-3.1-8b-instant";

console.log("🧠 StackSense AI brain started");

// Keep worker warm
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
});

const CONFUSION_KEYWORDS = [
  "doesn't work",
  "not working",
  "still broken",
  "can you explain",
  "does this work",
  "not correct",
  "wrong",
  "error",
  "fails",
];

function confusionScore(comments) {
  let score = 0;
  comments.forEach((c) => {
    const lower = c.toLowerCase();
    CONFUSION_KEYWORDS.forEach((k) => {
      if (lower.includes(k)) score += 1;
    });
  });
  return score;
}

function stripHtml(html) {
  if (!html || typeof html !== "string") return "";

  return html
    .replace(/<pre><code>/g, "```")
    .replace(/<\/code><\/pre>/g, "```")
    .replace(/<[^>]+>/g, "")
    .trim()
    .slice(0, 3000);
}

chrome.alarms.onAlarm.addListener(() => {});

// Open side panel
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {}
});

// Handle intent
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PROCESS_INTENT") {
    handleIntent(message.payload).then(sendResponse);
  }
  return true;
});

async function searchStackOverflow(query) {
  const url =
    `https://api.stackexchange.com/2.3/search/advanced` +
    `?order=desc&sort=relevance&q=${encodeURIComponent(query)}` +
    `&site=stackoverflow&answers=1`;

  const res = await fetch(url);
  const data = await res.json();

  return data.items?.slice(0, 3) || [];
}

async function fetchStackAnswers(questionId) {
  const url =
    `https://api.stackexchange.com/2.3/questions/${questionId}/answers` +
    `?order=desc&sort=votes&site=stackoverflow&filter=withbody`;

  const res = await fetch(url);
  const data = await res.json();
  return data.items || [];
}

async function fetchAnswerComments(answerId) {
  const url =
    `https://api.stackexchange.com/2.3/answers/${answerId}/comments` +
    `?order=asc&sort=creation&site=stackoverflow&filter=withbody`;

  const res = await fetch(url);
  const data = await res.json();
  return data.items || [];
}

function buildStackReviewPrompt(stackData, userQuestion) {
  return `
You are StackSense, an expert technical reviewer.

For EACH answer, assign:
- badge: GOLD | SILVER | BRONZE | WARNING
- reason: short explanation

Criteria:
GOLD:
- Technically correct
- Accepted OR very high votes
- Matches current language behavior

SILVER:
- Mostly correct
- Minor caveats
- Reasonable votes

BRONZE:
- Partially correct
- Incomplete or workaround-based

WARNING:
- Incorrect, misleading, outdated, or low confidence

Return ONLY valid JSON.
Do not include explanations, markdown, or extra text.
If unsure, still return JSON.

{
  "summary": "short explanation",
  "answers": [
    {
      "questionTitle": "",
      "answerIndex": 0,
      "badge": "GOLD",
      "reason": ""
    }
  ]
}

Stack Data:
${JSON.stringify(stackData, null, 2)}

User Question:
${userQuestion}
`;
}

async function buildStackSearchQuery(rawContent) {
  const prompt = `
Convert the following code or description into a concise Stack Overflow search query.
Rules:
- Do NOT include code
- Use plain English
- Focus on the error or unexpected behavior
- Keep it under 12 words

Content:
${rawContent}

Return ONLY the search query.
`;

  const query = await callGroq(prompt);
  return query.replace(/["`\n]/g, "").trim();
}

function buildAutoBadgeReason(a) {
  const reasons = [];

  if (a.accepted) reasons.push("Accepted by the question author");
  if (a.votes > 5) reasons.push(`Community score: ${a.votes} upvotes`);
  if (a.confusion > 0)
    reasons.push(`${a.confusion} confused comments detected`);

  reasons.push(`AI confidence score: ${a.confidence}%`);

  return reasons.join(". ");
}

async function handleIntent({ action, context, mode }) {
  const intent = mapIntent(action);
  const content = context.selection || context.title;

  if (mode === "STACK" && intent === "IMPROVE") {
    return {
      intent,
      text: "Code improvement is disabled when Stack Search is enabled.",
      sources: [],
    };
  }

  // NORMAL AI MODE
  if (mode !== "STACK") {
    const prompt = buildPrompt(intent, context, "AI");
    const aiText = await callGroq(prompt);
    return { intent, text: aiText };
  }

  // 🔥 STACK OVERFLOW MODE
  // 🔍 Build Stack Overflow–friendly search query
  // 🧠 Generate normal AI explanation (for user)
  const explanationPrompt = buildPrompt(intent, context, "AI");
  const aiExplanation = await callGroq(explanationPrompt);
  const stackQuery = await buildStackSearchQuery(content);

  // 🔍 Search Stack Overflow using the generated query
  let questions = await searchStackOverflow(stackQuery);

  // 🔁 FALLBACK if AI query fails
  if (!questions.length) {
    console.warn("🔁 Stack fallback to raw content");
    questions = await searchStackOverflow(content.slice(0, 200));
  }

  const stackData = [];

  for (const q of questions) {
    const answers = await fetchStackAnswers(q.question_id);

    const enrichedAnswers = await Promise.all(
      answers.slice(0, 2).map(async (ans) => {
        const comments = await fetchAnswerComments(ans.answer_id);

        const cleanComments = comments
          .map((c) => stripHtml(c.body))
          .filter((text) => text.length >= 8);

        const confusion = confusionScore(cleanComments);
        return {
          body: ans.body
            .replace(/<pre><code>/g, "```")
            .replace(/<\/code><\/pre>/g, "```")
            .replace(/<\/?code>/g, "`")
            .replace(/<\/?pre>/g, "")
            .replace(/<[^>]+>/g, "")
            .trim(),
          votes: ans.score,
          accepted: ans.is_accepted,
          comments: cleanComments,
          confusion,
        };
      }),
    );

    if (enrichedAnswers.length) {
      stackData.push({
        title: q.title,
        link: q.link,
        answers: enrichedAnswers,
      });
    }
  }

  if (!questions.length) {
    const fallbackPrompt = buildPrompt(intent, context, "AI");
    const aiText = await callGroq(fallbackPrompt);

    return {
      intent,
      text: aiText,
      sources: [],
    };
  }

  const trimmedStackData = stackData.slice(0, 2);
  const reviewPrompt = buildStackReviewPrompt(trimmedStackData, content);
  const aiText = await callGroq(reviewPrompt);
  let review;
  try {
    review = JSON.parse(aiText);
  } catch {
    review = { answers: [] };
  }

  // 🔗 Merge AI review verdicts into stackData
  review.answers.forEach((r) => {
    const question = trimmedStackData.find((q) => q.title === r.questionTitle);
    if (!question) return;

    const answer = question.answers[r.answerIndex];
    if (!answer) return;

    answer.badge = r.badge;
    answer.badgeReason = r.reason;
  });

  trimmedStackData.forEach((q) => {
    q.answers.forEach((a) => {
      // 1️⃣ Strong base confidence
      let baseConfidence = 50;

      // Accepted answers matter a LOT
      if (a.accepted) baseConfidence += 30;

      // Votes matter, but capped
      if (a.votes > 0) {
        baseConfidence += Math.min(a.votes * 2, 30);
      }

      // 2️⃣ Penalize comments intelligently
      if (!a.accepted && a.votes < 10) {
        baseConfidence -= a.confusion * 8;
      }

      // Accepted answers get VERY mild penalty
      if (a.accepted) {
        baseConfidence -= a.confusion * 2;
      }

      // 3️⃣ Clamp confidence
      a.confidence = Math.max(0, Math.min(100, baseConfidence));

      // 4️⃣ Badge decision (priority-based)
      if (a.accepted && (a.votes >= 5 || a.confidence >= 80)) {
        a.badge = "GOLD";
      } else if (a.confidence >= 60) {
        a.badge = "SILVER";
      } else if (a.confidence >= 45) {
        a.badge = "BRONZE";
      } else {
        a.badge = "WARNING";
      }

      // Reset stale AI reason if badge was recalculated
      if (a.badgeReason && !a.badgeReason.startsWith("Accepted")) {
        a.badgeReason = null;
      }
    });
  });

  trimmedStackData.forEach((q) => {
    q.answers.forEach((a) => {
      if (!a.badgeReason) {
        a.badgeReason = buildAutoBadgeReason(a);
      }
    });
  });

  return {
    intent,
    text: aiExplanation, // 🧠 MAIN explanation
    summary: review.summary || "", // 🧠 Review verdict
    sources: trimmedStackData,
  };
}

function mapIntent(action) {
  if (action === "Explain this") return "EXPLAIN";
  if (action === "Fix an error") return "DEBUG";
  if (action === "Improve code") return "IMPROVE";
  return "UNKNOWN";
}

function buildPrompt(intent, context, mode) {
  const baseAI = `
You are StackSense, an AI dev assistant.
Be concise, clear, and practical.
`;

  const baseStack = `
You are a senior Stack Overflow contributor.

Rules:
- Be strictly technically correct.
- If the question or explanation contains an incorrect claim, correct it explicitly.
- Do NOT invent internal behavior.
- Prefer precise, minimal explanations.
- Answer like a highly upvoted Stack Overflow post.
`;

  const base = mode === "STACK" ? baseStack : baseAI;
  const content = context.selection || context.title;

  const languageHint = `
Before answering:
1. Identify the programming language.
2. If JavaScript, explain JavaScript behavior.
3. If Python, explain Python behavior.
4. If unclear, say so explicitly.
`;

  if (intent === "EXPLAIN") {
    return `
${base}
${languageHint}

Explain the following:
${content}
`;
  }

  if (intent === "DEBUG") {
    return `
${base}
${languageHint}

Help debug this issue:
${content}
`;
  }

  if (intent === "IMPROVE") {
    return `
${base}
${languageHint}

Suggest improvements for:
${content}
`;
  }

  return `
${base}
${languageHint}

Question:
${content}
`;
}

async function callGroq(prompt) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    console.log("🔍 Groq status:", res.status);

    const data = await res.json();
    console.log("🔍 Groq response:", data);

    return data.choices?.[0]?.message?.content || "⚠️ Empty AI response";
  } catch (err) {
    console.error("❌ Groq fetch failed:", err);
    return "⚠️ AI request failed.";
  }
}
