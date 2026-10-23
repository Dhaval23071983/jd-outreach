import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Days to wait before each follow-up, counted from the previous send. Two follow-ups, then stop.
export const FOLLOW_UP_GAPS = [5, 7];

export type Status = "drafted" | "sent" | "bounced" | "replied" | "interviewing" | "closed";

export type Message = { subject: string; body: string; draftedAt: string; sentAt: string | null };

export type Entry = {
  id: string;
  createdAt: string;
  company: string;
  roleTitle: string;
  fit: { verdict: string; score: number };
  jd: string;
  analysis: unknown;
  contact: { name: string; title: string; email: string | null; linkedinUrl: string | null };
  cvFile: string;
  email: Message;
  followUps: Message[];
  status: Status;
  nextFollowUpAt: string | null;
  contactKind?: "hm" | "recruiter"; // missing on older entries, which are all hiring managers
  coverLetterFile?: string;
  leadStory?: string | null;
  secondStory?: string | null; // a second story the user wants highlighted on the CV and cover letter
  cvLeads?: string[]; // stories the user wants first in their own job on the CV, besides the lead story
  statusHistory?: { status: Status; at: string }[]; // dated status changes, for the day-by-day view
  matchRowsText?: string; // "requirement → achievement" rows, shown in follow-up 1 (the first email is short)
  ground?: unknown; // common ground found with the contact
  appliedAt?: string; // when the application form was submitted (marked from the autofill extension)
  applyAnswers?: { question: string; answer: string }[]; // answers drafted for application forms, reused next time
};

export class Tracker {
  constructor(private file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  all(): Entry[] {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8")) as Entry[];
    } catch {
      return [];
    }
  }

  private save(entries: Entry[]) {
    // Write then rename, so a crash mid-write can't corrupt the tracker.
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get(id: string) {
    const entry = this.all().find((e) => e.id === id);
    if (!entry) throw new Error("Tracker entry not found.");
    return entry;
  }

  create(e: Omit<Entry, "id" | "createdAt" | "followUps" | "status" | "nextFollowUpAt">) {
    const entry: Entry = {
      ...e, id: randomUUID(), createdAt: new Date().toISOString(), followUps: [], status: "drafted", nextFollowUpAt: null,
    };
    this.save([entry, ...this.all()]);
    return entry;
  }

  update(id: string, fn: (e: Entry) => void) {
    const entries = this.all();
    const entry = entries.find((e) => e.id === id);
    if (!entry) throw new Error("Tracker entry not found.");
    fn(entry);
    this.save(entries);
    return entry;
  }

  remove(id: string) {
    this.save(this.all().filter((e) => e.id !== id));
  }
}

export const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

// Due means due any time today, so the morning queue holds the whole day's follow-ups.
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
export const isDue = (e: Entry) => e.status === "sent" && !!e.nextFollowUpAt && new Date(e.nextFollowUpAt) <= endOfToday();

export function toCsv(entries: Entry[]) {
  const cols = ["Company", "Role", "Fit", "Contact type", "Contact", "Title", "Email", "Status", "Sent", "Follow-ups sent", "Next follow-up", "CV", "Cover letter"];
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const rows = entries.map((e) => [
    e.company, e.roleTitle, `${e.fit.verdict} ${e.fit.score}/10`, e.contactKind === "recruiter" ? "Recruiter" : "Hiring manager", e.contact.name, e.contact.title, e.contact.email,
    e.status, day(e.email.sentAt), e.followUps.filter((f) => f.sentAt).length, day(e.nextFollowUpAt), e.cvFile, e.coverLetterFile ?? "",
  ].map(q).join(","));
  return [cols.join(","), ...rows].join("\n");
}
