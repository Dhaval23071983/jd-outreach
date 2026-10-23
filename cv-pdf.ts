import PDFDocument from "pdfkit";
import type { TailoredCV } from "./server.js";

const MARGIN = 48;
const INK = "#1a1a1a";
const MUTED = "#555555";
const LINK = "#0563C1";

// The built-in PDF fonts only cover WinAnsi; swap anything outside it for a close ASCII form.
const WIN_ANSI_EXTRAS = new Set("–—‘’“”•…€™‚„†‡ˆ‰Š‹ŒŽ˜šœžŸ");
function clean(text: string) {
  return text
    .replace(/[→⇒]/g, "->").replace(/[≈~]/g, "~").replace(/[≥]/g, ">=").replace(/[≤]/g, "<=")
    .replace(/[‐-‒]/g, "-")
    .replace(/./gu, (ch) => (ch.codePointAt(0)! <= 255 || WIN_ANSI_EXTRAS.has(ch) ? ch : ""));
}

const isLink = (part: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(part) && !part.includes("@");

export function cvToPdf(cv: TailoredCV): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 40, bottom: 40, left: MARGIN, right: MARGIN } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = MARGIN;
  const width = doc.page.width - MARGIN * 2;

  // Name
  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(clean(cv.name), left, doc.y, { width, align: "center" });
  doc.moveDown(0.2);

  // Contact line, centered, with clickable links
  doc.font("Helvetica").fontSize(9.5);
  const parts = clean(cv.contactLine).split(" | ");
  const sep = "  |  ";
  const total = parts.reduce((w, p, i) => w + doc.widthOfString(p) + (i ? doc.widthOfString(sep) : 0), 0);
  let x = left + (width - total) / 2;
  const y = doc.y;
  parts.forEach((p, i) => {
    if (i) { doc.fillColor(MUTED).text(sep, x, y, { lineBreak: false }); x += doc.widthOfString(sep); }
    if (isLink(p)) {
      doc.fillColor(LINK).text(p, x, y, { lineBreak: false, underline: true, link: p.startsWith("http") ? p : `https://${p}` });
    } else {
      doc.fillColor(INK).text(p, x, y, { lineBreak: false });
    }
    x += doc.widthOfString(p);
  });
  doc.x = left;
  doc.y = y + 16;

  const heading = (text: string) => {
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(text.toUpperCase(), left, doc.y, { width, characterSpacing: 0.5 });
    const ly = doc.y + 1;
    doc.moveTo(left, ly).lineTo(left + width, ly).lineWidth(0.6).strokeColor("#999999").stroke();
    doc.y = ly + 4;
  };
  const body = (text: string, opts: PDFKit.Mixins.TextOptions = {}) =>
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(clean(text), left, doc.y, { width, lineGap: 1.5, ...opts });
  const bullets = (items: string[]) => {
    doc.font("Helvetica").fontSize(9.5).fillColor(INK);
    for (const item of items) {
      const by = doc.y;
      doc.text("•", left + 4, by, { lineBreak: false });
      doc.text(clean(item), left + 14, by, { width: width - 14, lineGap: 1.5 });
      doc.moveDown(0.15);
    }
  };

  heading("Professional Summary");
  body(cv.summary);

  heading("Skills");
  for (const s of cv.skills) {
    const sy = doc.y;
    doc.font("Helvetica").fontSize(9.5).text("•", left + 4, sy, { lineBreak: false });
    doc.font("Helvetica-Bold").text(`${clean(s.category)}: `, left + 14, sy, { width: width - 14, continued: true, lineGap: 1.5 })
      .font("Helvetica").text(clean(s.items.join(", ")));
    doc.moveDown(0.15);
  }

  heading("Professional Experience");
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  for (const job of cv.experience) {
    doc.moveDown(0.35);
    // Keep a job's header with at least its first bullet.
    if (doc.y + 80 > bottom()) doc.addPage();
    const jy = doc.y;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(clean(job.company), left, jy, { width: width - 130 });
    const afterCompany = doc.y;
    doc.font("Helvetica-Bold").fontSize(9.5).text(clean(job.dates), left, jy, { width, align: "right" });
    doc.y = Math.max(afterCompany, doc.y);
    doc.font("Helvetica-BoldOblique").fontSize(9.5).text(clean(job.title), left, doc.y, { width });
    if (job.scopeLine) doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED).text(clean(job.scopeLine), left, doc.y, { width });
    doc.moveDown(0.2);
    bullets(job.bullets);
  }

  if (doc.y + 90 > bottom()) doc.addPage();
  heading("Education and Credentials");
  for (const e of cv.education) {
    const ey = doc.y;
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(clean(e.school), left, ey, { width: width - 130 });
    const afterSchool = doc.y;
    doc.text(clean(e.dates), left, ey, { width, align: "right" });
    doc.y = Math.max(afterSchool, doc.y);
    body(e.degree);
    doc.moveDown(0.2);
  }

  if (cv.certifications.length) {
    heading("Certifications");
    bullets(cv.certifications);
  }

  doc.end();
  return done;
}

export type CoverLetterDoc = {
  name: string;
  contactLine: string;
  date: string;
  greeting: string;
  paragraphs: string[];
  signoff: string;
};

export function coverLetterToPdf(cl: CoverLetterDoc): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 56, bottom: 56, left: 64, right: 64 } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const left = 64;
  const width = doc.page.width - 128;

  doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(clean(cl.name), left, doc.y, { width });
  doc.moveDown(0.15);
  // Contact line with clickable links, left-aligned to match the letter body; shrinks to fit one line.
  const parts = clean(cl.contactLine).split(" | ");
  let size = 9.5;
  doc.font("Helvetica").fontSize(size);
  const lineWidth = () => parts.reduce((w, p, i) => w + doc.widthOfString(p) + (i ? doc.widthOfString("  |  ") : 0), 0);
  while (lineWidth() > width && size > 7) doc.fontSize((size -= 0.25));
  const y = doc.y;
  let x = left;
  parts.forEach((p, i) => {
    if (i) { doc.fillColor(MUTED).text("  |  ", x, y, { lineBreak: false }); x += doc.widthOfString("  |  "); }
    const link = isLink(p) ? (p.startsWith("http") ? p : `https://${p}`) : undefined;
    doc.fillColor(link ? LINK : INK).text(p, x, y, { lineBreak: false, underline: !!link, link });
    x += doc.widthOfString(p);
  });
  doc.x = left;
  doc.y = y + 14;
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.6).strokeColor("#999999").stroke();
  doc.y += 18;

  const para = (text: string, gapAfter = 0.8) => {
    doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(clean(text), left, doc.y, { width, lineGap: 2.5 });
    doc.moveDown(gapAfter);
  };
  para(cl.date, 1);
  para(cl.greeting);
  for (const p of cl.paragraphs) para(p);
  doc.moveDown(0.4);
  para(cl.signoff, 0.1);
  doc.font("Helvetica-Bold").fontSize(10.5).text(clean(cl.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase())), left, doc.y, { width });

  doc.end();
  return done;
}
