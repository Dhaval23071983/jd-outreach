// Fills a Greenhouse, Lever or Ashby application form from JD Outreach.
// Green outline: filled from your profile. Amber: drafted answer, read it. Red: you need to answer.
// It never clicks Submit.
(() => {
  if (window.__jdoApply) return;
  window.__jdoApply = true;

  // ---------- talking to JD Outreach (through background.js) ----------
  const call = (msg) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (r) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (r && r.ok) resolve(r.data); else reject(new Error((r && r.error) || "No reply from the extension."));
    });
  });
  const api = (path, method, body) => call({ type: "api", path, method, body });
  const enc = encodeURIComponent;

  // ---------- reading the page ----------
  const text = (el) => ((el && el.textContent) || "").replace(/\s+/g, " ").trim();
  const cleanLabel = (s) => String(s || "").replace(/\(required\)/ig, "").replace(/[*✱]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();

  function pageTitle() {
    const h = document.querySelector("h1, .posting-headline h2");
    return text(h) || document.title.split(/[|–@]/)[0].trim();
  }
  function pageCompany() {
    const u = new URL(location.href);
    if (u.searchParams.get("for")) return u.searchParams.get("for");
    const first = u.pathname.split("/").filter(Boolean)[0] || "";
    return decodeURIComponent(first === "embed" ? "" : first).replace(/[-_]+/g, " ");
  }

  // File inputs sit behind styled buttons, so they count as visible.
  function visible(el) {
    if (el.type === "file") return true;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  }
  function labelFor(el) {
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => text(document.getElementById(id))).join(" ").trim();
      if (t) return t;
    }
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (text(l)) return text(l);
    }
    const lever = questionText(el);
    if (lever) return lever;
    const wrap = el.closest("label");
    if (wrap && text(wrap)) return text(wrap);
    const box = el.closest(".application-question, .field, fieldset, [class*='_fieldEntry'], [class*='question'], li");
    if (box) {
      const l = box.querySelector("legend, label, .application-label, [class*='label']");
      if (text(l)) return text(l);
    }
    return el.getAttribute("aria-label") || el.placeholder || el.name || "";
  }
  // Upload boxes are labelled by their button ("Attach"); the field's name sits a few levels up.
  const GENERIC = /^(attach|upload|browse|choose( a)? file|select file|drop|enter manually)?$/i;
  function fileLabel(el) {
    const own = cleanLabel(labelFor(el));
    if (!GENERIC.test(own)) return own;
    let p = el;
    for (let i = 0; i < 7 && p; i++) {
      p = p.parentElement;
      const l = p && p.querySelector("[id$='-label'], .label, legend, label:not(.visually-hidden), h3, h4");
      if (l && !GENERIC.test(cleanLabel(text(l)))) return text(l);
    }
    return el.id || el.name || own;
  }
  const optionLabel = (el) => cleanLabel(
    (el.id && text(document.querySelector(`label[for="${CSS.escape(el.id)}"]`))) || text(el.closest("label")) || el.value);
  // Lever keeps each question's wording in .application-label (its <label> also wraps the options).
  function questionText(el) {
    const q = el.closest(".application-question");
    const l = q && q.querySelector(".application-label .text, .application-label");
    return l ? text(l) : "";
  }
  function groupQuestion(el) {
    const fs = el.closest("fieldset");
    const own = questionText(el) || text(fs && fs.querySelector("legend, .ashby-application-form-question-title, :scope > label"));
    if (own) return own;
    const box = el.closest("[class*='_fieldEntry'], [class*='question'], li");
    const q = box && (box.querySelector("legend") || box.querySelector(".application-label") || box.querySelector("[class*='label']:not(label)"));
    return text(q) || el.name || "";
  }

  // Every fillable control on the page, with radio and checkbox groups merged into one question.
  function fields() {
    const out = [], seen = new Set();
    for (const el of document.querySelectorAll("input, textarea, select")) {
      if (el.closest("#jdo-panel")) continue;
      const t = (el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image", "search"].includes(t) || el.disabled || !visible(el)) continue;
      if (el.getAttribute("aria-hidden") === "true") continue; // helper inputs behind custom dropdowns
      if (t === "radio" || t === "checkbox") {
        const group = el.name ? [...document.querySelectorAll(`input[type="${t}"][name="${CSS.escape(el.name)}"]`)] : [el];
        const k = `${t}:${el.name || Math.random()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const raw = group.length > 1 ? groupQuestion(el) : (groupQuestion(el) || optionLabel(el));
        out.push({ kind: t, els: group, raw, label: cleanLabel(raw), options: group.map(optionLabel) });
        continue;
      }
      const raw = t === "file" ? fileLabel(el) : labelFor(el);
      const kind = el.tagName === "SELECT" ? "select" : el.getAttribute("role") === "combobox" ? "combobox"
        : t === "file" ? "file" : el.tagName === "TEXTAREA" ? "textarea" : "text";
      out.push({
        kind, els: [el], raw, label: cleanLabel(raw),
        options: kind === "select" ? [...el.options].map((o) => o.text.trim()).filter((o) => o && !/^(select|--|please select|choose)/i.test(o)) : undefined,
        maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      });
    }
    // Ashby asks yes/no questions with two buttons instead of inputs.
    const boxes = new Set([...document.querySelectorAll("button")].filter((b) => /^(yes|no)$/i.test(text(b)) && !b.closest("#jdo-panel"))
      .map((b) => b.closest("[class*='_fieldEntry'], fieldset")).filter(Boolean));
    for (const box of boxes) {
      const buttons = [...box.querySelectorAll("button")].filter((b) => /^(yes|no)$/i.test(text(b)));
      const raw = text(box.querySelector(".ashby-application-form-question-title, label, legend"));
      out.push({ kind: "yesno", els: buttons, box, raw, label: cleanLabel(raw), options: buttons.map(text) });
    }
    for (const f of out) {
      f.required = /[*✱]|required/i.test(f.raw) || f.els.some((e) => e.required || e.getAttribute("aria-required") === "true");
      f.anchor = anchorOf(f); // found now: Greenhouse removes the file input once a file is attached
    }
    return out;
  }
  const comboShell = (el) => el.closest(".select-shell, .select__container, [class*='select-container']")
    || (el.closest("[class*='control']") || el).parentElement;
  const hasValue = (f) => f.kind === "yesno" ? f.els.some((b) => /active|selected/i.test(b.className) || b.getAttribute("aria-pressed") === "true")
    : f.kind === "radio" || f.kind === "checkbox" ? f.els.some((e) => e.checked)
    : f.kind === "file" ? f.els[0].files && f.els[0].files.length > 0
    : f.kind === "combobox" ? Boolean(comboShell(f.els[0]).querySelector("[class*='singleValue'], [class*='single-value'], [class*='multiValue']"))
    : Boolean(f.els[0].value && f.els[0].value.trim());

  // React dropdowns are driven by page.js, which runs inside the page. They talk through DOM events.
  let seq = 0;
  function combo(el, action, label) {
    if (!el.dataset.jdoId) el.dataset.jdoId = `c${++seq}`;
    const reqId = ++seq;
    return new Promise((resolve) => {
      const done = (r) => { document.removeEventListener("jdo:combo:reply", on); resolve(r); };
      const on = (e) => { let r; try { r = JSON.parse(e.detail); } catch { return; } if (r.reqId === reqId) done(r); };
      document.addEventListener("jdo:combo:reply", on);
      document.dispatchEvent(new CustomEvent("jdo:combo", { detail: JSON.stringify({ reqId, id: el.dataset.jdoId, action, label }) }));
      setTimeout(() => done({ ok: false, options: [] }), 1500);
    });
  }

  // ---------- writing to the page (works with React-controlled inputs) ----------
  function setValue(el, v) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    for (const type of ["input", "change", "blur"]) el.dispatchEvent(new Event(type, { bubbles: true }));
  }
  // Exact match first, then whole-word prefix ("United States" → "United States +1"), then containment.
  function pick(options, answer) {
    const a = norm(answer), n = options.map(norm);
    let i = n.indexOf(a);
    if (i >= 0) return i;
    i = n.findIndex((o) => o && (o.startsWith(`${a} `) || a.startsWith(`${o} `)));
    if (i >= 0) return i;
    return a.length > 3 ? n.findIndex((o) => o.length > 3 && (o.includes(a) || a.includes(o))) : -1;
  }
  function selectOption(sel, answer) {
    const opts = [...sel.options];
    const i = pick(opts.map((o) => o.text.trim()), answer);
    if (i < 0) return false;
    setValue(sel, opts[i].value);
    return true;
  }
  async function applyAnswer(f, answer) {
    const el = f.els[0];
    if (f.kind === "select") return selectOption(el, answer);
    if (f.kind === "combobox") {
      const i = pick(f.options || [], answer);
      return i >= 0 && (await combo(el, "select", f.options[i])).ok;
    }
    if (f.kind === "radio" || f.kind === "yesno") {
      const i = pick(f.options, answer);
      if (i < 0) return false;
      f.els[i].click();
      return true;
    }
    if (f.kind === "checkbox") {
      const wanted = answer.split(/\s*[|;]\s*/).filter(Boolean);
      if (f.els.length === 1) {
        if (/^(yes|true|checked|agree)/i.test(answer) && !el.checked) el.click();
        return true;
      }
      let any = false;
      for (const w of wanted) {
        const i = pick(f.options, w);
        if (i >= 0) { if (!f.els[i].checked) f.els[i].click(); any = true; }
      }
      return any;
    }
    setValue(el, answer);
    return true;
  }
  async function attach(input, name) {
    const { b64 } = await call({ type: "file", name });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type: "application/pdf" }));
    input.files = dt.files;
    for (const type of ["input", "change"]) input.dispatchEvent(new Event(type, { bubbles: true }));
  }

  // ---------- outlines and notes ----------
  function anchorOf(f) {
    const el = f.els[0];
    if (f.kind === "yesno") return f.box;
    if (f.kind === "file") return el.closest(".file-upload, [class*='upload'], .field-wrapper, .application-question, fieldset, li") || el.parentElement;
    if (f.kind === "radio" || f.kind === "checkbox") {
      return el.closest("fieldset, .application-question, [class*='_fieldEntry'], .field, li") || el.parentElement;
    }
    if (f.kind === "combobox") return el.closest("[class*='control']") || comboShell(el);
    return el;
  }
  function mark(f, kind, note) {
    const a = f.anchor || anchorOf(f);
    a.classList.remove("jdo-ok", "jdo-review", "jdo-need");
    a.classList.add(`jdo-${kind}`);
    const old = a.nextElementSibling;
    if (old && old.classList.contains("jdo-note")) old.remove();
    if (note) {
      const n = document.createElement("div");
      n.className = `jdo-note jdo-${kind}-note`;
      n.textContent = note;
      a.insertAdjacentElement("afterend", n);
    }
  }
  function clearMarks() {
    document.querySelectorAll(".jdo-note").forEach((n) => n.remove());
    document.querySelectorAll(".jdo-ok, .jdo-review, .jdo-need").forEach((n) => n.classList.remove("jdo-ok", "jdo-review", "jdo-need"));
  }

  // ---------- standard fields from profile/apply-profile.json ----------
  const STD = [
    [/twitter|github|^x url|^other (website|url)/i, "skip"], // optional profiles he doesn't use
    [/^(legal )?first name|given name|preferred (first )?name/i, "firstName"],
    [/^(legal )?last name|family name|surname/i, "lastName"],
    [/^(full |legal )?name$|^your name/i, "fullName"],
    [/e-?mail/i, "email"],
    [/phone|mobile/i, "phone"],
    [/linkedin/i, "linkedin"],
    [/website|portfolio|personal (site|url)|^blog/i, "website"],
    [/current (company|employer)|^company( name)?$|^organization$|^org$/i, "currentCompany"],
    [/current (job )?(title|role|position)/i, "currentTitle"],
    [/^city$/i, "city"],
    [/^state|province/i, "state"],
    [/^country$/i, "country"],
    [/^location|where are you (currently )?(based|located)|current location|city,? state/i, "location"],
  ];
  const TEXTLIKE = new Set(["text", "textarea", "combobox", "email", "tel", "url"]);

  // ---------- the fill ----------
  let entry = null;

  async function fill() {
    setBusy(true);
    clearMarks();
    try {
      status("Looking up this role in JD Outreach…");
      const look = await api(`/api/apply/lookup?url=${enc(location.href)}&title=${enc(pageTitle())}&company=${enc(pageCompany())}`);
      if (!look.found) {
        status(`JD Outreach has no CV for this role yet${look.job ? ` (${look.job.title} at ${look.job.company})` : ""}. Run the job through JD Outreach first, then click Fill again.`);
        return;
      }
      entry = look.entry;
      try { sessionStorage.setItem("jdoEntry", entry.id); } catch {}
      roleLine(`${entry.roleTitle} · ${entry.company}${entry.appliedAt ? " · already marked applied" : ""}`);
      const p = look.profile;
      const all = fields();
      let filled = 0, drafted = 0, needs = 0;
      const resume = [], cover = [], rest = [];
      for (const f of all) if (f.kind === "combobox") f.options = (await combo(f.els[0], "options")).options;

      for (const f of all) {
        if (f.kind === "file") {
          if (/autofill|auto-fill|parse/i.test(f.label)) continue; // Ashby's "autofill from resume" box
          if (/cover/i.test(f.label)) cover.push(f);
          else if (/resume|résumé|\bcv\b|curriculum/i.test(f.label)) resume.push(f);
          else if (f.required) { mark(f, "need", "Upload this yourself"); needs++; }
          continue;
        }
        if (hasValue(f)) continue;
        const key = (STD.find(([re]) => re.test(f.label)) || [])[1];
        if (key === "skip" && !f.required) continue;
        const isList = f.kind === "select" || (f.kind === "combobox" && f.options.length > 0);
        if (key && (TEXTLIKE.has(f.kind) || f.kind === "select")) {
          const v = key === "fullName" ? `${p.firstName || ""} ${p.lastName || ""}`.trim() : p[key];
          if (v && isList) {
            if (await applyAnswer(f, v)) { mark(f, "ok"); filled++; continue; }
          } else if (v && f.kind === "combobox") {
            // A search box that loads its list as you type (e.g. Location): type it, then he picks.
            setValue(f.els[0], v);
            mark(f, "review", "Typed in. Pick the matching item from the list."); drafted++;
            continue;
          } else if (v) {
            setValue(f.els[0], v); mark(f, "ok"); filled++;
            continue;
          }
          if (f.required) { mark(f, "need", v ? `Couldn't find "${v}" in the list` : "Not in your apply profile"); needs++; }
          continue;
        }
        if (f.kind === "combobox" && !isList) {
          if (f.required) { mark(f, "need", "Choose this yourself"); needs++; }
          continue;
        }
        if (f.label) rest.push(f);
      }

      if (resume.length) {
        status("Attaching your tailored CV…");
        for (const f of resume) { await attach(f.els[0], entry.cvFile); mark(f, "ok", null); filled++; }
      }
      // A cover letter only when the form requires one, or one already exists for this role.
      const optionalCover = cover.filter((f) => !f.required && !entry.coverLetterFile);
      for (const f of optionalCover) mark(f, "review", "Optional. To include one, click Create cover letter in JD Outreach's Tracker, then Fill again.");
      cover.splice(0, cover.length, ...cover.filter((f) => !optionalCover.includes(f)));
      if (cover.length) {
        let file = entry.coverLetterFile;
        if (!file) {
          status("This form takes a cover letter. Writing one for this role (about 30 seconds)…");
          file = (await api(`/api/tracker/${entry.id}/cover-letter`, "POST", {})).file;
          entry.coverLetterFile = file;
        }
        for (const f of cover) { await attach(f.els[0], file); mark(f, "review", "Cover letter attached. Open it in JD Outreach to read it."); drafted++; }
      }

      if (rest.length) {
        status(`Drafting answers to ${rest.length} question${rest.length > 1 ? "s" : ""}…`);
        const questions = rest.map((f, i) => ({
          id: String(i), label: f.label, kind: f.kind, required: f.required, maxLength: f.maxLength,
          options: f.options && f.options.slice(0, 80),
        }));
        const { answers } = await api("/api/apply/answers", "POST", { entryId: entry.id, questions });
        for (const a of answers) {
          const f = rest[Number(a.id)];
          if (!f) continue;
          if (a.needsYou || !a.answer) {
            if (f.required || a.note) { mark(f, "need", a.note || "Answer this yourself"); needs++; }
            continue;
          }
          if (await applyAnswer(f, a.answer)) { mark(f, "review", "Drafted. Read it before you submit."); drafted++; }
          else { mark(f, "need", `Couldn't match an option to: ${a.answer}`); needs++; }
        }
      }

      status(`Filled ${filled} field${filled === 1 ? "" : "s"} from your profile.\n${drafted} drafted answer${drafted === 1 ? "" : "s"} to read (amber).\n${needs} for you to answer (red).\nCheck the whole form, then click the site's Submit button.`);
      const first = document.querySelector(".jdo-need, .jdo-review");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      status(`Stopped: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function markSubmitted(auto) {
    const id = entry ? entry.id : (() => { try { return sessionStorage.getItem("jdoEntry"); } catch { return null; } })();
    if (!id) return status("Click Fill first, so the extension knows which role this is.");
    try {
      await api("/api/apply/submitted", "POST", { entryId: id, url: location.href });
      try { sessionStorage.removeItem("jdoEntry"); } catch {}
      status(auto ? "Application submitted. JD Outreach marked it as applied." : "Marked as applied in JD Outreach.");
    } catch (e) {
      status(`Couldn't mark it as applied: ${e.message}`);
    }
  }

  // ---------- the panel ----------
  let panel;
  const status = (s) => { if (panel) panel.querySelector(".jdo-status").textContent = s; };
  const roleLine = (s) => { if (panel) panel.querySelector(".jdo-role").textContent = s; };
  const setBusy = (b) => panel && panel.querySelectorAll("button.jdo-btn").forEach((x) => { x.disabled = b; });

  function showPanel() {
    if (panel) return;
    panel = document.createElement("div");
    panel.id = "jdo-panel";
    if (window !== window.top) panel.classList.add("jdo-inline"); // inside a company site's embedded form
    panel.innerHTML = `<div class="jdo-head"><span>JD Outreach</span><button class="jdo-x" title="Hide">×</button></div>
      <div class="jdo-role"></div>
      <div class="jdo-btns"><button class="jdo-btn" data-fill>Fill application</button><button class="jdo-btn jdo-ghost" data-done>I submitted it</button></div>
      <div class="jdo-status">Fills your details, tailored CV and drafted answers. You review everything and click Submit yourself.</div>
      <div class="jdo-legend"><span style="background:#16a34a"></span>filled<span style="background:#d97706"></span>read<span style="background:#dc2626"></span>you</div>`;
    panel.querySelector("[data-fill]").onclick = fill;
    panel.querySelector("[data-done]").onclick = () => markSubmitted(false);
    panel.querySelector(".jdo-x").onclick = () => { panel.remove(); panel = null; };
    if (panel.classList.contains("jdo-inline")) document.body.prepend(panel); else document.body.appendChild(panel);
  }

  // Greenhouse shows a confirmation page after Submit; mark the role applied there.
  if (/confirmation|thank|submitted|success/i.test(location.pathname)) {
    try { if (sessionStorage.getItem("jdoEntry")) { showPanel(); markSubmitted(true); return; } } catch {}
  }

  // The forms render late (Ashby and Lever are React apps), so look for one for up to 30 seconds.
  const hasForm = () => document.querySelector("input[type='file'], input[type='email'], input[name='email'], input[autocomplete='email']");
  let tries = 0;
  const timer = setInterval(() => {
    if (hasForm()) { clearInterval(timer); showPanel(); }
    else if (++tries > 30) clearInterval(timer);
  }, 1000);
})();
