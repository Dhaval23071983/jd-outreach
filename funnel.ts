import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Daily job funnel. Finds fresh senior product roles through the job boards' own public APIs
// (Greenhouse, Ashby, Lever, Workday), so every job is live and has a real posting date.
// Google search (Serper) only discovers job URLs; the board API is the source of truth.

export type Ats = "greenhouse" | "ashby" | "lever" | "workday" | "amazon";

export type Job = {
  id: string;
  ats: Ats;
  board: string; // greenhouse/ashby/lever slug, workday "host|tenant|site", or "amazon"
  target?: boolean; // from one of the user's target companies
  flatTitles?: boolean; // company where PM / Senior PM titles carry senior scope
  fullCheck?: boolean; // score came from a full fit check, not the quick score
  url: string;
  company: string;
  title: string;
  location: string;
  postedAt: string | null;
  description: string;
  firstSeen: string;
  source: "search" | "board";
  score: number | null;
  verdict: string | null;
  reason: string | null;
  status: "new" | "dismissed" | "started" | "applied" | "closed"; // applied: done outside the app; closed: the posting was taken down
};

// anyLevel: the company uses flat titles ("Product Manager, Payments"), so seniority is judged from the JD.
// maxAgeDays: per-board override. AI labs keep roles open for months, and the board API confirms they're live.
export type Board = { ats: Ats; board: string; company: string; lastSeen: string; target?: boolean; anyLevel?: boolean; maxAgeDays?: number };

export type FunnelConfig = {
  searchTitles: string[]; // Google queries per job site, one per title
  levelWords: string[]; // a title must contain "product" and one of these
  excludeWords: string[]; // a title with any of these is dropped
  nonUsWords: string[]; // a location with any of these is dropped
  excludeCompanies: string[]; // aggregators and reposting boards
  maxAgeDays: number;
  dailySearchBudget: number; // Serper queries per run
};

export const DEFAULT_CONFIG: FunnelConfig = {
  searchTitles: ["director of product", "principal product manager", "group product manager", "staff product manager", "head of product"],
  levelWords: ["director", "head of", "vp", "vice president", "principal", "group product", "staff", "senior manager", "sr. manager", "sr manager", "lead"],
  excludeWords: ["marketing", "design", "designer", "operations", "analyst", "engineer", "engineering", "counsel", "sales", "support", "owner", "intern", "associate product", "data scientist", "finance", "legal", "recruit", "program manager", "project manager", "specialist", "communications", "technician", "assistant"],
  nonUsWords: ["india", "bengaluru", "bangalore", "hyderabad", "pune", "london", "united kingdom", " uk", "canada", "toronto", "vancouver", "germany", "berlin", "ireland", "dublin", "france", "paris", "netherlands", "amsterdam", "spain", "poland", "singapore", "australia", "sydney", "japan", "tokyo", "brazil", "mexico", "israel", "tel aviv", "emea", "apac", "latam", "europe"],
  excludeCompanies: ["jobgether", "jobot", "dice", "crossover", "turing", "toptal"],
  maxAgeDays: 10,
  dailySearchBudget: 20,
};

const SITES: { site: string; ats: Ats }[] = [
  { site: "job-boards.greenhouse.io", ats: "greenhouse" },
  { site: "jobs.ashbyhq.com", ats: "ashby" },
  { site: "jobs.lever.co", ats: "lever" },
  { site: "myworkdayjobs.com", ats: "workday" },
];

// ---------- small helpers ----------

const UA = { "User-Agent": "Mozilla/5.0 (JD Outreach job funnel)", Accept: "application/json" };

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<any>;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", apos: "'" };
const decode = (s: string) => s.replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : m));
export function htmlToText(html: string) {
  return decode(decode(html))
    .replace(/<(br|\/p|\/li|\/h\d|\/div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export const idFor = (ats: Ats, board: string, jobId: string) => createHash("sha1").update(`${ats}|${board}|${jobId}`).digest("hex").slice(0, 16);
// Workday gives legal entity names ("1001 John Wiley & Sons", "Elsevier Limited Company").
// Also drops HR codes: "US00 Agilent Technologies", "ZINC Zillow", "NVIDIA USA".
const cleanCompany = (s: string) => s.replace(/^\d+\s+/, "").replace(/^[A-Z0-9]*\d[A-Z0-9]*\s+/, "").replace(/^[A-Z]{4}\s+(?=[A-Z][a-z])/, "").replace(/\s+(USA|US)$/, "").replace(/,?\s+(Inc\.?|LLC|L\.L\.C\.|Ltd\.?|Limited Company|Limited|Corp\.?|Corporation|Co\.)$/i, "").trim();
const titleCase = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- filters ----------

export function titleFits(title: string, cfg: FunnelConfig, anyLevel = false) {
  const t = ` ${title.toLowerCase()} `;
  if (!/\bproducts?\b/.test(t)) return false; // "production" doesn't count
  if (cfg.excludeWords.some((w) => t.includes(w))) return false;
  if (anyLevel) return /product manag|head of product|director.*product/.test(t);
  return cfg.levelWords.some((w) => t.includes(w));
}

const US_STATES = ["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming"];
const US_CODES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const US_CITIES = ["san francisco", "seattle", "new york", "nyc", "austin", "dallas", "boston", "chicago", "los angeles", "denver", "atlanta", "bay area", "silicon valley"];

// Keep a job only when the location shows it's in the US (or remote with no other country named).
export function locationFits(location: string, cfg: FunnelConfig) {
  const l = ` ${location.toLowerCase()} `;
  if (/united states|\busa\b|\bus\b|u\.s\.|\bamericas?\b/.test(l)) return true;
  if (cfg.nonUsWords.some((w) => l.includes(w))) return false;
  if (US_STATES.some((st) => l.includes(st)) || US_CITIES.some((c) => l.includes(c))) return true;
  if (location.split(/[\s,()/-]+/).some((w) => US_CODES.has(w))) return true;
  return /^\s*(remote|anywhere|any state)\b[\s,()]*(remote)?\s*$/.test(l);
}

export const companyFits = (company: string, board: string, cfg: FunnelConfig) =>
  !cfg.excludeCompanies.some((c) => company.toLowerCase().includes(c) || board.toLowerCase().includes(c));

const ageDays = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : null);

// Re-checks a stored job against today's rules, so a rule added later also applies to jobs found before it.
export function stillFits(j: Job, boards: Board[], cfg: FunnelConfig) {
  const b = boards.find((x) => x.ats === j.ats && x.board === j.board);
  const age = ageDays(j.postedAt);
  return titleFits(j.title, cfg, b?.anyLevel) && locationFits(j.location, cfg) && companyFits(j.company, j.board, cfg)
    && (age === null || age <= (b?.maxAgeDays ?? cfg.maxAgeDays));
}

// ---------- URL → job, per board API ----------

type Ref = { ats: Ats; board: string; jobId: string; company?: string };

export function parseJobUrl(url: string): Ref | null {
  let m = url.match(/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/);
  if (m) return { ats: "greenhouse", board: m[1], jobId: m[2] };
  m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{36})/);
  if (m) return { ats: "ashby", board: decodeURIComponent(m[1]), jobId: m[2] };
  m = url.match(/jobs\.lever\.co\/([^/?#]+)\/([0-9a-f-]{36})/);
  if (m) return { ats: "lever", board: m[1], jobId: m[2] };
  m = url.match(/https?:\/\/(([^./]+)\.wd\d+\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)\/job\/([^?#]+)/);
  if (m) {
    const rest = m[4].replace(/\/apply.*$/, "");
    // Workday paths are case-insensitive but links vary in case; lowercase so one job has one id.
    return { ats: "workday", board: `${m[1]}|${m[2]}|${m[3]}`.toLowerCase(), jobId: rest.toLowerCase() };
  }
  return null;
}

const ashbyCache = new Map<string, any[]>();
const amazonCache = new Map<string, any>();

// amazon.jobs has a public search feed with the full JD, so one call lists and describes jobs.
async function amazonSearch(query: string) {
  const url = `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(query)}&country=USA&sort=recent&result_limit=100`;
  const jobs = (await getJson(url)).jobs ?? [];
  for (const j of jobs) amazonCache.set(String(j.id_icims), j);
  return jobs as any[];
}
// Some companies (e.g. Whatnot) turn off Ashby's public posting API; their hosted job page
// still loads from Ashby's GraphQL endpoint, so fall back to that.
async function ashbyGql(op: string, query: string, variables: Record<string, string>) {
  const d = await getJson(`https://jobs.ashbyhq.com/api/non-user-graphql?op=${op}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationName: op, variables, query }),
  });
  return d.data;
}
async function ashbyBoard(board: string) {
  if (!ashbyCache.has(board)) {
    let jobs: any[];
    try {
      jobs = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`)).jobs ?? [];
    } catch {
      const d = await ashbyGql("ApiJobBoardWithTeams", "query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName } } }", { organizationHostedJobsPageName: board });
      jobs = (d?.jobBoard?.jobPostings ?? []).map((x: any) => ({ id: x.id, title: x.title, location: x.locationName, gql: true }));
    }
    ashbyCache.set(board, jobs);
  }
  return ashbyCache.get(board)!;
}

type Fetched = Omit<Job, "firstSeen" | "source" | "score" | "verdict" | "reason" | "status">;

export async function fetchJob(ref: Ref, companyHint?: string): Promise<Fetched | null> {
  const id = idFor(ref.ats, ref.board, ref.jobId);
  if (ref.ats === "greenhouse") {
    const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${ref.board}/jobs/${ref.jobId}`);
    return {
      id, ats: ref.ats, board: ref.board, url: j.absolute_url, company: j.company_name || companyHint || titleCase(ref.board),
      title: j.title, location: j.location?.name ?? "", postedAt: j.first_published ?? j.updated_at ?? null,
      description: htmlToText(j.content ?? ""),
    };
  }
  if (ref.ats === "ashby") {
    let j = (await ashbyBoard(ref.board)).find((x) => x.id === ref.jobId);
    if (j?.gql) {
      const d = await ashbyGql("ApiJobPosting", "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) { id title locationName workplaceType isListed publishedDate descriptionHtml } }", { organizationHostedJobsPageName: ref.board, jobPostingId: ref.jobId });
      const p = d?.jobPosting;
      j = p && { id: p.id, title: p.title, location: p.locationName, isRemote: p.workplaceType === "Remote", isListed: p.isListed,
        publishedAt: p.publishedDate ? `${p.publishedDate}T12:00:00Z` : null, descriptionHtml: p.descriptionHtml, jobUrl: `https://jobs.ashbyhq.com/${ref.board}/${p.id}` };
    }
    if (!j || j.isListed === false) return null;
    const loc = [j.location, j.isRemote ? "Remote" : "", j.address?.postalAddress?.addressCountry].filter(Boolean).join(", ");
    return {
      id, ats: ref.ats, board: ref.board, url: j.jobUrl,
      company: companyHint || (/^[0-9a-f-]{36}$/.test(ref.board) ? (String(j.descriptionPlain ?? "").match(/About ([A-Z][\w&.]*(?: [A-Z][\w&.]*){0,3})/)?.[1] ?? "Company not named") : titleCase(ref.board)),
      title: j.title, location: loc, postedAt: j.publishedAt ?? null, description: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
    };
  }
  if (ref.ats === "amazon") {
    const j = amazonCache.get(ref.jobId);
    if (!j) return null;
    const desc = [j.description, "BASIC QUALIFICATIONS", j.basic_qualifications, "PREFERRED QUALIFICATIONS", j.preferred_qualifications].join("\n");
    return {
      id, ats: ref.ats, board: ref.board, url: `https://www.amazon.jobs${j.job_path}`, company: cleanCompany(j.company_name || "Amazon"),
      title: j.title.trim(), location: j.normalized_location || j.location, postedAt: new Date(j.posted_date.replace(/\s+/g, " ")).toISOString(),
      description: htmlToText(desc),
    };
  }
  if (ref.ats === "lever") {
    const j = await getJson(`https://api.lever.co/v0/postings/${ref.board}/${ref.jobId}`);
    const lists = (j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content ?? "")}`).join("\n\n");
    return {
      id, ats: ref.ats, board: ref.board, url: j.hostedUrl, company: companyHint || titleCase(ref.board),
      title: j.text, location: [j.categories?.location, j.workplaceType].filter(Boolean).join(", "),
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      description: `${j.descriptionPlain ?? ""}\n\n${lists}\n\n${j.additionalPlain ?? ""}`.trim(),
    };
  }
  const [host, tenant, site] = ref.board.split("|");
  const j = await getJson(`https://${host}/wday/cxs/${tenant}/${site}/job/${ref.jobId}`);
  const p = j.jobPostingInfo;
  if (!p || p.canApply === false) return null;
  return {
    id, ats: ref.ats, board: ref.board, url: p.externalUrl ?? `https://${host}/${site}/job/${ref.jobId}`,
    company: cleanCompany(j.hiringOrganization?.name ?? companyHint ?? titleCase(tenant)),
    title: p.title, location: [p.location, p.country?.descriptor].filter(Boolean).join(", "),
    postedAt: p.startDate ? new Date(`${p.startDate}T12:00:00Z`).toISOString() : null, description: htmlToText(p.jobDescription ?? ""),
  };
}

// Whether a stored posting is still open: true or false when the board answers, null when the check itself failed.
export async function isLive(j: Job): Promise<boolean | null> {
  try {
    if (j.ats === "amazon") {
      // amazon.jobs returns 404 for a job that has been taken down.
      const res = await fetch(j.url, { headers: { "User-Agent": UA["User-Agent"] }, signal: AbortSignal.timeout(15000) });
      if (res.status === 404 || res.status === 410) return false;
      return res.ok ? true : null;
    }
    // Greenhouse links can point at the company's own site, with the job ID in gh_jid.
    const ghId = j.ats === "greenhouse" ? j.url.match(/gh_jid=(\d+)/)?.[1] : undefined;
    const ref = parseJobUrl(j.url) ?? (ghId ? { ats: j.ats, board: j.board, jobId: ghId } : null);
    if (!ref) return null;
    return (await fetchJob(ref)) !== null;
  } catch (e) {
    return /^(404|410) /.test((e as Error).message) ? false : null;
  }
}

// Every product job on a known board, as references (cheap: one call per board).
export async function listBoard(b: Board, cfg: FunnelConfig): Promise<{ ref: Ref; title: string }[]> {
  if (b.ats === "greenhouse") {
    const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${b.board}/jobs`);
    return (j.jobs ?? []).filter((x: any) => titleFits(x.title, cfg, b.anyLevel)).map((x: any) => ({ ref: { ats: b.ats, board: b.board, jobId: String(x.id) }, title: x.title }));
  }
  if (b.ats === "ashby") {
    return (await ashbyBoard(b.board)).filter((x) => titleFits(x.title, cfg, b.anyLevel)).map((x) => ({ ref: { ats: b.ats, board: b.board, jobId: x.id }, title: x.title }));
  }
  if (b.ats === "amazon") {
    const seen = new Map<string, string>();
    for (const q of ["principal product manager", "senior manager product management", "director product management"]) {
      for (const j of await amazonSearch(q)) if (titleFits(j.title, cfg)) seen.set(String(j.id_icims), j.title);
    }
    return [...seen].map(([jobId, title]) => ({ ref: { ats: b.ats, board: b.board, jobId }, title }));
  }
  if (b.ats === "lever") {
    const j = await getJson(`https://api.lever.co/v0/postings/${b.board}?mode=json`);
    return (Array.isArray(j) ? j : []).filter((x: any) => titleFits(x.text, cfg, b.anyLevel)).map((x: any) => ({ ref: { ats: b.ats, board: b.board, jobId: x.id }, title: x.text }));
  }
  const [host, tenant, site] = b.board.split("|");
  const j = await getJson(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "product management" }),
  });
  // Workday only says "Posted Today" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" in the list.
  return (j.jobPostings ?? [])
    .filter((x: any) => titleFits(x.title, cfg, b.anyLevel) && !/30\+/.test(x.postedOn ?? ""))
    .map((x: any) => ({ ref: { ats: b.ats, board: b.board, jobId: String(x.externalPath).replace(/^\/job\//, "").toLowerCase() }, title: x.title }));
}

// ---------- store ----------

export class JobStore {
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }
  private read<T>(name: string, fallback: T): T {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, name), "utf8")) as T; } catch { return fallback; }
  }
  private write(name: string, data: unknown) {
    const file = path.join(this.dir, name);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }
  jobs() { return this.read<Job[]>("jobs.json", []); }
  saveJobs(j: Job[]) { this.write("jobs.json", j); }
  boards() { return this.read<Board[]>("boards.json", []); }
  saveBoards(b: Board[]) { this.write("boards.json", b); }
  meta() { return this.read<{ lastRun: string | null; lastResult: string | null }>("funnel-meta.json", { lastRun: null, lastResult: null }); }
  saveMeta(m: { lastRun: string | null; lastResult: string | null }) { this.write("funnel-meta.json", m); }
  update(id: string, fn: (j: Job) => void) {
    const all = this.jobs();
    const j = all.find((x) => x.id === id);
    if (!j) throw new Error("Job not found.");
    fn(j);
    this.saveJobs(all);
    return j;
  }
}

// ---------- the daily run ----------

export type SearchFn = (q: string, tbs: string) => Promise<{ title: string; link: string }[]>;
export type ScoreFn = (jobs: Job[]) => Promise<{ scores: { id: string; score: number; verdict: string; reason: string }[]; cost: number }>;

export async function runFunnel(opts: {
  store: JobStore; cfg: FunnelConfig; search: SearchFn | null; score: ScoreFn;
  alreadyApplied: (company: string, title: string) => boolean;
}) {
  const { store, cfg } = opts;
  ashbyCache.clear();
  amazonCache.clear();
  const known = new Map(store.jobs().map((j) => [j.id, j]));
  const refs = new Map<string, { ref: Ref; source: Job["source"]; company?: string; target?: boolean; anyLevel?: boolean; maxAge?: number }>();
  const errors: string[] = [];
  let searches = 0;

  // 1. Discovery: Google, last 24 hours (last 7 days on the very first run), per site and title.
  if (opts.search) {
    const tbs = store.meta().lastRun ? "qdr:d" : "qdr:w";
    outer: for (const title of cfg.searchTitles) {
      for (const { site } of SITES) {
        if (searches >= cfg.dailySearchBudget) break outer;
        searches++;
        try {
          for (const hit of await opts.search(`site:${site} ${title}`, tbs)) {
            const ref = parseJobUrl(hit.link);
            if (!ref) continue;
            const company = hit.title.match(/@ (.+)$/)?.[1]?.trim() ?? hit.title.match(/at (.+?)$/)?.[1]?.trim();
            refs.set(idFor(ref.ats, ref.board, ref.jobId), { ref, source: "search", company });
          }
        } catch (e) { errors.push(String(e)); }
      }
    }
  }

  // 2. Every board we've seen a product role on: list its product roles (free, no Google).
  const boards = store.boards();
  for (const b of boards) {
    try {
      for (const { ref } of await listBoard(b, cfg)) {
        const id = idFor(ref.ats, ref.board, ref.jobId);
        if (!refs.has(id)) refs.set(id, { ref, source: "board", company: b.company, target: b.target, anyLevel: b.anyLevel, maxAge: b.maxAgeDays });
      }
    } catch (e) { errors.push(`${b.company}: ${String(e)}`); }
  }

  // 3. Fetch details for refs we haven't stored, then filter on title, location, age.
  const fresh: Job[] = [];
  let checked = 0;
  for (const [id, { ref, source, company, target, anyLevel, maxAge }] of refs) {
    if (known.has(id)) continue;
    checked++;
    try {
      const f = await fetchJob(ref, company);
      if (f && target && company) f.company = company;
      if (!f || !titleFits(f.title, cfg, anyLevel) || !locationFits(f.location, cfg) || !companyFits(f.company, f.board, cfg)) continue;
      const age = ageDays(f.postedAt);
      if (age !== null && age > (maxAge ?? cfg.maxAgeDays)) continue;
      if (opts.alreadyApplied(f.company, f.title)) continue;
      fresh.push({ ...f, flatTitles: anyLevel, target: target || boards.some((b) => b.target && b.ats === f.ats && b.board === f.board), firstSeen: new Date().toISOString(), source, score: null, verdict: null, reason: null, status: "new" });
      // Remember the board so tomorrow it's scanned directly.
      if (!boards.some((b) => b.ats === f.ats && b.board === f.board)) boards.push({ ats: f.ats, board: f.board, company: f.company, lastSeen: new Date().toISOString() });
    } catch (e) { errors.push(String(e)); }
  }
  store.saveBoards(boards);

  // 3b. Hide listed postings that have closed since they were found.
  let closed = 0;
  const open = [...known.values()].filter((j) => j.status === "new" && stillFits(j, boards, cfg));
  for (let i = 0; i < open.length; i += 6) {
    const batch = open.slice(i, i + 6);
    (await Promise.all(batch.map(isLive))).forEach((live, k) => { if (live === false) { batch[k].status = "closed"; closed++; } });
  }

  // 4. Score the new ones against the profile, in batches.
  let cost = 0;
  for (let i = 0; i < fresh.length; i += 8) {
    const batch = fresh.slice(i, i + 8);
    try {
      const r = await opts.score(batch);
      cost += r.cost;
      for (const s of r.scores) {
        const j = batch.find((x) => x.id === s.id);
        if (j) Object.assign(j, { score: s.score, verdict: s.verdict, reason: s.reason });
      }
    } catch (e) { errors.push(`scoring: ${String(e)}`); }
  }

  // Keep 60 days of history so a job is never shown twice.
  const cutoff = Date.now() - 60 * 86_400_000;
  const all = [...fresh, ...known.values()].filter((j) => new Date(j.firstSeen).getTime() > cutoff);
  store.saveJobs(all);
  const result = `${searches} searches, ${boards.length} boards, ${checked} postings checked, ${fresh.length} new, ${closed} closed`;
  store.saveMeta({ lastRun: new Date().toISOString(), lastResult: result });
  return { added: fresh.length, searches, boards: boards.length, checked, cost, errors: errors.slice(0, 10), result };
}
