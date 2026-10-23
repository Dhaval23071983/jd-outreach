import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type Story = {
  id: string;
  title: string;
  company: string;
  period: string;
  competencies: string[];
  hook: string;
  situation: string;
  bridge1: string;
  actions: string[];
  bridge2: string;
  result: string;
  lesson: string;
  numbers: { claim: string; baseline: string | null }[];
  useInOutreach: boolean; // false keeps a story out of CVs and emails (e.g. an employer not on the CV)
  score: number | null; // last coach score, 1-10
  createdAt: string;
  updatedAt: string;
};

export type StoryInput = Omit<Story, "id" | "createdAt" | "updatedAt">;

export class StoryStore {
  constructor(private file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  all(): Story[] {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8")) as Story[];
    } catch {
      return [];
    }
  }

  private save(stories: Story[]) {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(stories, null, 2));
    fs.renameSync(tmp, this.file);
  }

  upsert(input: StoryInput & { id?: string }) {
    const stories = this.all();
    const now = new Date().toISOString();
    const existing = input.id ? stories.find((s) => s.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input, { updatedAt: now });
    } else {
      stories.push({ ...input, id: randomUUID(), createdAt: now, updatedAt: now });
    }
    this.save(stories);
    return existing ?? stories[stories.length - 1];
  }

  remove(id: string) {
    this.save(this.all().filter((s) => s.id !== id));
  }

  // Stories the AI may use, numbered in order. The number is how prompts refer to them.
  usable() {
    return this.all().filter((s) => s.useInOutreach).map((s, i) => ({ n: i + 1, story: s }));
  }
}

// Coach gap markers like "[missing: the baseline]" help the user, but must never reach a CV or email.
const clean = (t: string) => t.replace(/\[missing:[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();

const label = (s: Story) => `${s.title} (${[s.company, s.period].filter(Boolean).join(", ")})`;

// The story bank text sent to the model: the user's own rules, then each usable story.
export function renderBank(rules: string, store: StoryStore) {
  const stories = store.usable().map(({ n, story: s }) => [
    `${n}. ${label(s)}`,
    `Themes: ${s.competencies.join(", ")}`,
    `Hook: ${clean(s.hook)}`,
    `Situation: ${clean(s.situation)}`,
    ...s.actions.map((a, i) => `Action ${i + 1}: ${clean(a)}`),
    `Result: ${clean(s.result)}`,
    `Lesson: ${clean(s.lesson)}`,
  ].filter((line) => !/^\w[\w ]*\d*: ?$/.test(line)).join("\n")).join("\n\n");
  return `${rules.trim()}\n\n=== STORIES ===\n\n${stories}`;
}

export const storyTitles = (store: StoryStore) => store.usable().map(({ n, story }) => ({ id: n, title: label(story) }));
