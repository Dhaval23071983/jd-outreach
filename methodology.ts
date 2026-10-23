// The story method, distilled from Dhaval's interview-prep documents. Shown to users as the
// guide and sent to the model as the coaching standard, so both always say the same thing.

export const COMPETENCIES = [
  "Building 0-to-1",
  "Strategy under ambiguity",
  "Execution: strategy to shipped",
  "Customer insight and CX",
  "Influence without authority",
  "Conflict with a senior stakeholder",
  "Cross-functional partnership",
  "Product and tech partnership",
  "Data-driven decision",
  "Unpopular decision or setback",
  "Failure or being wrong",
  "People leadership",
] as const;

// Typical interview questions per competency, used as prompts when a user starts a story.
export const COMPETENCY_QUESTIONS: Record<(typeof COMPETENCIES)[number], string> = {
  "Building 0-to-1": "Tell me about something you built from scratch.",
  "Strategy under ambiguity": "Tell me about a time you set direction without having all the information.",
  "Execution: strategy to shipped": "Take me from the strategy through to what actually shipped.",
  "Customer insight and CX": "Tell me about a customer problem you found before customers escalated it.",
  "Influence without authority": "Tell me about a decision you influenced with no authority over it.",
  "Conflict with a senior stakeholder": "Tell me about a disagreement with someone more senior than you.",
  "Cross-functional partnership": "Tell me about bringing teams together under time pressure.",
  "Product and tech partnership": "Tell me about turning a business need into something engineering could build.",
  "Data-driven decision": "Tell me about a decision you made from data others had missed.",
  "Unpopular decision or setback": "Tell me about a decision that was right for the business and unpopular.",
  "Failure or being wrong": "Tell me about a time you got something wrong.",
  "People leadership": "Tell me about developing someone on your team.",
};

export const STORY_PARTS = [
  { key: "hook", label: "Hook", time: "~20 sec", guide: "Open with the result. What you did and the headline numbers, in one breath. The listener should know the outcome in the first 25 seconds." },
  { key: "situation", label: "Situation", time: "~50 sec", guide: "The context and the stakes. Why it was hard, and the signal that told you it was a bigger problem than it looked." },
  { key: "bridge1", label: "Bridge", time: "1 line", guide: "Announce the actions: \"Three things helped me…\" so the listener can follow the structure." },
  { key: "actions", label: "Actions", time: "~1 min each", guide: "Two or three distinct decisions you personally made. Show the tools (a study, a pilot, a prototype), and for influence stories, who said no first and what changed their mind." },
  { key: "bridge2", label: "Bridge", time: "1 line", guide: "One line tying the actions to the outcome, often the time span: \"The result of that 18-month process was this.\"" },
  { key: "result", label: "Result", time: "~20 sec", guide: "The numbers, each with its baseline: down 76% from what, 22 FTEs out of what team. One version of each number, everywhere." },
  { key: "lesson", label: "Lesson", time: "~20 sec", guide: "A rule you now work by, in the form \"I now…\". One or two lessons, never a summary of the story." },
] as const;

export const COACH_RULES = [
  "Result first: the hook carries the outcome and its key number.",
  "One story, one team, one result. Never \"in each of the examples I gave\".",
  "Say what you personally did, with precise verbs: \"I prototyped with the Vision API\", never \"I created the API\". \"I quarterbacked it. Engineering built it, ops ran it. My calls were…\"",
  "Every number has a baseline or denominator, and the same number never changes between stories or rooms.",
  "Diagnosis before the fix: show how you found the real problem before what you built.",
  "Failure stories stay failures: say \"I was wrong\" in the first sentence, say what it cost, and don't turn it into a win halfway.",
  "Influence stories name who said no first and what changed their mind.",
  "Keep it to about 3-4 minutes spoken. Land the result and offer to go deeper.",
  "Each competency gets its own story, so different interviewers hear different scenes.",
];

export function methodText() {
  return `STORY STRUCTURE (in order):
${STORY_PARTS.map((p, i) => `${i + 1}. ${p.label} (${p.time}): ${p.guide}`).join("\n")}

COACHING RULES:
${COACH_RULES.map((r) => `- ${r}`).join("\n")}

COMPETENCIES A STORY CAN PROVE: ${COMPETENCIES.join("; ")}`;
}
