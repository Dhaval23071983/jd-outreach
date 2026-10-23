#!/usr/bin/env npx tsx
/**
 * Web-based setup wizard — reads app.manifest.json, opens a browser form,
 * and writes profile files + .env on submit.
 *
 * Run: npm run setup
 */

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3041;

const manifest = JSON.parse(fs.readFileSync(path.join(here, "app.manifest.json"), "utf8"));

// ── Env file helpers ──────────────────────────────────────────────────────────

function readEnvFile(): Record<string, string> {
  const p = path.join(here, ".env");
  if (!fs.existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq !== -1) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function writeEnvFile(vars: Record<string, string>) {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(path.join(here, ".env"), lines.join("\n") + "\n", "utf8");
}

// ── Existing values for pre-fill ─────────────────────────────────────────────

function existingValue(slot: Record<string, unknown>): string {
  if (slot.type === "env") {
    const env = readEnvFile();
    return env[slot.env_var as string] ? "••••••••" : "";
  }
  const filePath = path.join(here, slot.path as string);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").trim() : "";
}

// ── HTML ──────────────────────────────────────────────────────────────────────

function buildHtml(): string {
  const slots = manifest.slots as Array<Record<string, unknown>>;
  const slotsJson = JSON.stringify(
    slots.map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description,
      type: s.type,
      path: s.path,
      env_var: s.env_var,
      required: s.required,
      sensitive: s.sensitive,
      fallback_note: s.fallback_note,
      prompt: s.prompt,
      existing: existingValue(s),
    }))
  );

  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${manifest.display_name} — Setup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f0f0f; --surface: #1a1a1a; --border: #2e2e2e;
    --text: #e8e8e8; --muted: #888; --accent: #4f8ef7;
    --accent-dim: #1e3a6e; --danger: #f75252; --success: #52c77c;
    --radius: 8px; --font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font);
    font-size: 15px; line-height: 1.6; min-height: 100vh;
    display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; width: 100%; max-width: 640px; overflow: hidden; }
  .header { padding: 28px 32px 20px; border-bottom: 1px solid var(--border); }
  .header h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
  .header p { color: var(--muted); font-size: 13px; }
  .progress-bar { height: 3px; background: var(--border); }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; }
  .body { padding: 28px 32px; }
  .step { display: none; }
  .step.active { display: block; }
  .step-meta { font-size: 12px; color: var(--muted); margin-bottom: 6px; letter-spacing: .04em; text-transform: uppercase; }
  .step h2 { font-size: 17px; font-weight: 600; margin-bottom: 6px; }
  .step .desc { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
  .required-badge { display: inline-block; font-size: 10px; background: var(--accent-dim);
    color: var(--accent); border-radius: 4px; padding: 1px 6px; margin-left: 8px;
    vertical-align: middle; text-transform: uppercase; letter-spacing: .06em; }
  .optional-badge { display: inline-block; font-size: 10px; background: #2a2a2a;
    color: var(--muted); border-radius: 4px; padding: 1px 6px; margin-left: 8px;
    vertical-align: middle; text-transform: uppercase; letter-spacing: .06em; }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  textarea { width: 100%; background: #111; border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text); font-family: "SF Mono", "Fira Code", monospace;
    font-size: 12px; line-height: 1.55; padding: 12px; resize: vertical;
    min-height: 200px; outline: none; transition: border-color .15s; }
  textarea:focus { border-color: var(--accent); }
  input[type="password"], input[type="text"] { width: 100%; background: #111;
    border: 1px solid var(--border); border-radius: var(--radius); color: var(--text);
    font-family: "SF Mono", "Fira Code", monospace; font-size: 13px;
    padding: 10px 14px; outline: none; transition: border-color .15s; }
  input[type="password"]:focus, input[type="text"]:focus { border-color: var(--accent); }
  .file-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }
  .file-btn { background: #222; border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--text); font-size: 13px; padding: 8px 14px; cursor: pointer;
    white-space: nowrap; transition: background .15s; }
  .file-btn:hover { background: #2a2a2a; }
  .file-name { font-size: 12px; color: var(--muted); overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  input[type="file"] { display: none; }
  .fallback { font-size: 12px; color: var(--muted); background: #161616;
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 10px 12px; margin-top: 12px; }
  .existing-note { font-size: 12px; color: var(--success); margin-bottom: 10px; }
  .footer { padding: 20px 32px; border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .btn { border: none; border-radius: var(--radius); cursor: pointer;
    font-size: 14px; font-weight: 500; padding: 10px 22px; transition: opacity .15s; }
  .btn:disabled { opacity: .4; cursor: default; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { opacity: .85; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover:not(:disabled) { background: #222; color: var(--text); }
  .skip-link { font-size: 13px; color: var(--muted); cursor: pointer; background: none;
    border: none; text-decoration: underline; }
  .skip-link:hover { color: var(--text); }
  .done { text-align: center; padding: 16px 0 8px; }
  .done .icon { font-size: 48px; margin-bottom: 16px; }
  .done h2 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
  .done p { color: var(--muted); font-size: 14px; margin-bottom: 6px; }
  .done code { background: #111; border: 1px solid var(--border);
    border-radius: 6px; padding: 10px 16px; display: inline-block;
    font-family: "SF Mono", "Fira Code", monospace; font-size: 13px;
    color: var(--accent); margin-top: 16px; }
  .error-msg { color: var(--danger); font-size: 12px; margin-top: 8px; display: none; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>${manifest.display_name} <span style="font-weight:400;color:var(--muted);font-size:14px;">v${manifest.version}</span></h1>
    <p>${manifest.description}</p>
  </div>
  <div class="progress-bar"><div class="progress-fill" id="progress"></div></div>
  <div class="body" id="body"></div>
  <div class="footer" id="footer"></div>
</div>

<script>
const slots = ${slotsJson};
let current = 0;
const values = {};

// Pre-fill with existing values
slots.forEach(s => { if (s.existing && s.existing !== '••••••••') values[s.key] = s.existing; });

function pct() {
  return Math.round(((current + 1) / (slots.length + 1)) * 100);
}

function render() {
  document.getElementById('progress').style.width = pct() + '%';

  if (current >= slots.length) {
    renderDone();
    return;
  }

  const slot = slots[current];
  const isFile = slot.type !== 'env';
  const isSensitive = slot.sensitive;

  const body = document.getElementById('body');
  const footer = document.getElementById('footer');

  const badge = slot.required
    ? '<span class="required-badge">required</span>'
    : '<span class="optional-badge">optional</span>';

  const existingNote = slot.existing
    ? '<div class="existing-note">✓ Already set — leave blank to keep existing value</div>'
    : '';

  const fallbackNote = slot.fallback_note
    ? '<div class="fallback">' + slot.fallback_note + '</div>'
    : '';

  if (isFile) {
    body.innerHTML = \`
      <div class="step-meta">Step \${current + 1} of \${slots.length}</div>
      <h2>\${slot.label}\${badge}</h2>
      <div class="desc">\${slot.description}</div>
      \${existingNote}
      <div class="file-row">
        <button class="file-btn" onclick="document.getElementById('fileInput').click()">Import file</button>
        <span class="file-name" id="fileName">or paste below</span>
        <input type="file" id="fileInput" accept=".md,.txt,.pdf,.doc,.docx">
      </div>
      <label>Content</label>
      <textarea id="slotInput" placeholder="\${(slot.prompt || '').replace(/"/g, '&quot;')}" spellcheck="false">\${values[slot.key] || ''}</textarea>
      <div class="error-msg" id="errMsg">This field is required.</div>
    \`;

    document.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById('fileName').textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => { document.getElementById('slotInput').value = ev.target.result; };
      reader.readAsText(file);
    });
  } else {
    body.innerHTML = \`
      <div class="step-meta">Step \${current + 1} of \${slots.length}</div>
      <h2>\${slot.label}\${badge}</h2>
      <div class="desc">\${slot.description}</div>
      \${existingNote}
      <label>\${slot.env_var}</label>
      <input type="\${isSensitive ? 'password' : 'text'}" id="slotInput"
        placeholder="\${isSensitive ? 'Paste your key here' : 'Enter value'}"
        value="\${(slot.existing && slot.existing !== '••••••••') ? slot.existing : ''}">
      \${fallbackNote}
      <div class="error-msg" id="errMsg">This field is required.</div>
    \`;
  }

  const skipBtn = !slot.required
    ? \`<button class="skip-link" onclick="skip()">Skip</button>\`
    : '<span></span>';

  footer.innerHTML = \`
    \${skipBtn}
    <div style="display:flex;gap:10px;">
      \${current > 0 ? '<button class="btn btn-ghost" onclick="back()">Back</button>' : '<span></span>'}
      <button class="btn btn-primary" onclick="next()">
        \${current < slots.length - 1 ? 'Next →' : 'Finish setup'}
      </button>
    </div>
  \`;

  document.getElementById('slotInput')?.focus();
}

function getValue() {
  const el = document.getElementById('slotInput');
  return el ? el.value.trim() : '';
}

function next() {
  const slot = slots[current];
  const val = getValue();

  if (slot.required && !val && (!slot.existing || slot.existing === '••••••••')) {
    const err = document.getElementById('errMsg');
    if (err) { err.style.display = 'block'; }
    return;
  }

  if (val) values[slot.key] = val;
  current++;
  render();
}

function skip() {
  current++;
  render();
}

function back() {
  if (current > 0) { current--; render(); }
}

function renderDone() {
  document.getElementById('progress').style.width = '100%';
  document.getElementById('body').innerHTML = \`
    <div class="done">
      <div class="icon">✓</div>
      <h2>Saving your setup…</h2>
      <p>Writing profile files and environment variables.</p>
    </div>
  \`;
  document.getElementById('footer').innerHTML = '';

  fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      document.getElementById('body').innerHTML = \`
        <div class="done">
          <div class="icon">✅</div>
          <h2>Setup complete</h2>
          <p>Your profile files and API keys are saved.</p>
          <p style="margin-top:8px;">Start the app in your terminal:</p>
          <code>npm run dev</code>
          <p style="margin-top:16px;font-size:12px;color:var(--muted);">
            Run <code style="font-size:12px;padding:2px 6px;">npm run setup</code> again at any time to update a slot.
          </p>
        </div>
      \`;
    } else {
      document.getElementById('body').innerHTML = \`
        <div class="done">
          <div class="icon">⚠️</div>
          <h2>Something went wrong</h2>
          <p style="color:var(--danger);">\${data.error || 'Unknown error'}</p>
        </div>
      \`;
    }
  });
}

render();
</script>
</body>
</html>`;
}

// ── Server ────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => res.send(buildHtml()));

app.post("/api/save", (req, res) => {
  try {
    const { values } = req.body as { values: Record<string, string> };
    const envVars = readEnvFile();

    for (const slot of manifest.slots as Array<Record<string, unknown>>) {
      const val = values[slot.key as string];
      if (!val) continue;

      if (slot.type === "env") {
        envVars[slot.env_var as string] = val;
      } else {
        const dest = path.join(here, slot.path as string);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, val + "\n", "utf8");
      }
    }

    writeEnvFile(envVars);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nJD Outreach setup → ${url}\n`);
  // Open browser
  const cmd = process.platform === "darwin" ? `open ${url}` : `xdg-open ${url}`;
  exec(cmd);
});
