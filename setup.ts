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
const PORT = parseInt(process.env.SETUP_PORT ?? "3099", 10);

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

// ── Friendly UI overrides (plain English, no jargon) ─────────────────────────

const overrides: Record<string, { label: string; description: string; icon: string; prompt?: string }> = {
  base_cv: {
    icon: "📄",
    label: "Your Resume",
    description: "Paste or upload your resume. Every tailored CV the app creates starts from this.",
  },
  facts: {
    icon: "📌",
    label: "Key Career Facts",
    description: "Your exact job titles, company names, dates, and key numbers. The app never contradicts these.",
    prompt: "One fact per line. Example:\n- Director of Product at Amazon, Jan 2020–Mar 2023\n- Grew activation 34%→61% (Q3 2022)\n- Led a team of 12",
  },
  email_example: {
    icon: "✉️",
    label: "An Email You Wrote",
    description: "Paste a real email you sent. The app copies your writing style from this when it drafts outreach.",
  },
  intro_example: {
    icon: "💬",
    label: "Cover Letter Opening (Optional)",
    description: "Paste an opening paragraph from a cover letter you've written. Skip this if you don't have one handy.",
  },
  signature: {
    icon: "✍️",
    label: "Your Email Signature",
    description: "Paste the block at the bottom of your emails — name, title, phone, LinkedIn.",
  },
  story_rules: {
    icon: "📖",
    label: "Story Rules (Optional)",
    description: "Any personal rules for interviews — topics to avoid, or stories you always lead with. Skip to use the built-in defaults.",
  },
  ties: {
    icon: "🏢",
    label: "Your Career Connections",
    description: "List every company, school, and city connected to your career. The app uses these to find common ground with hiring managers.",
    prompt: "One per line (or separate with commas):\n\nAmazon\nCopart\nNMIMS\nMumbai\nDallas",
  },
  env_owner_name: {
    icon: "👤",
    label: "Your Full Name",
    description: "The app puts this on every file it creates — e.g. Jane_Doe_Google_PM.pdf.",
  },
  env_anthropic: {
    icon: "🔑",
    label: "Anthropic API Key",
    description: "This powers the AI. Get one free at console.anthropic.com — click API Keys after signing in.",
  },
  env_hunter: {
    icon: "🔍",
    label: "Hunter.io API Key (Optional)",
    description: "Helps find hiring manager email addresses. Skip this if you don't have one.",
  },
};

// ── HTML ──────────────────────────────────────────────────────────────────────

function buildHtml(): string {
  const slots = manifest.slots as Array<Record<string, unknown>>;

  const slotsJson = JSON.stringify(
    slots.map((s) => {
      const o = overrides[s.key as string] || {};
      return {
        key: s.key,
        label: o.label || s.label,
        description: o.description || s.description,
        icon: o.icon || "📝",
        prompt: o.prompt || (s.prompt as string) || "",
        type: s.type,
        path: s.path,
        env_var: s.env_var,
        required: s.required,
        sensitive: s.sensitive,
        fallback_note: s.fallback_note,
        existing: existingValue(s),
      };
    })
  );

  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JD Outreach — Setup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0d0d; --surface: #1a1a1a; --border: #2a2a2a;
    --text: #f0f0f0; --muted: #888; --accent: #5b9cf6;
    --accent-dim: #1e3566; --success: #4ade80; --danger: #f87171;
    --radius: 10px; --font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  body {
    background: var(--bg); color: var(--text); font-family: var(--font);
    font-size: 16px; line-height: 1.6; min-height: 100vh;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; width: 100%; max-width: 680px; overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
  }
  .progress-track { height: 4px; background: var(--border); }
  .progress-fill { height: 100%; background: var(--accent); transition: width .4s ease; }
  .progress-label {
    padding: 14px 40px 0; font-size: 12px; color: var(--muted);
    letter-spacing: .05em; text-transform: uppercase; min-height: 34px;
  }
  .body { padding: 28px 40px 32px; }
  /* Welcome */
  .welcome { text-align: center; padding: 8px 0 8px; }
  .welcome .app-icon { font-size: 52px; margin-bottom: 14px; }
  .welcome h1 { font-size: 26px; font-weight: 700; margin-bottom: 8px; }
  .welcome .tagline { color: var(--muted); font-size: 15px; margin-bottom: 28px; line-height: 1.55; }
  .need-list { list-style: none; text-align: left; display: inline-block; margin-bottom: 28px; }
  .need-list li { padding: 5px 0; font-size: 15px; }
  .need-list li .bullet { margin-right: 10px; }
  .time-note { font-size: 13px; color: var(--muted); margin-top: 12px; }
  /* Step */
  .step-icon { font-size: 38px; margin-bottom: 10px; }
  .step h2 { font-size: 21px; font-weight: 600; margin-bottom: 6px; }
  .step .desc { color: var(--muted); font-size: 14px; margin-bottom: 16px; line-height: 1.6; }
  .badge-req { display: inline-block; font-size: 10px; background: var(--accent-dim);
    color: var(--accent); border-radius: 4px; padding: 2px 7px; margin-left: 8px;
    vertical-align: middle; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
  .badge-opt { display: inline-block; font-size: 10px; background: #252525;
    color: var(--muted); border-radius: 4px; padding: 2px 7px; margin-left: 8px;
    vertical-align: middle; text-transform: uppercase; letter-spacing: .05em; }
  .already-set { font-size: 13px; color: var(--success); margin-bottom: 12px; }
  /* File upload */
  .upload-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
    background: #212121; border: 1px dashed #3a3a3a; border-radius: var(--radius);
    color: var(--text); font-size: 14px; padding: 11px 18px; cursor: pointer;
    transition: background .15s, border-color .15s; margin-bottom: 8px;
  }
  .upload-btn:hover { background: #282828; border-color: var(--accent); }
  input[type="file"] { display: none; }
  .upload-name { font-size: 12px; color: var(--accent); text-align: center; margin-bottom: 8px; display: none; }
  .or-divider { text-align: center; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
  textarea {
    width: 100%; background: #111; border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text);
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 13px; line-height: 1.6; padding: 14px; resize: vertical;
    min-height: 180px; outline: none; transition: border-color .15s;
  }
  textarea:focus { border-color: var(--accent); }
  textarea::placeholder { color: #555; white-space: pre; }
  input[type="password"], input[type="text"] {
    width: 100%; background: #111; border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text);
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 14px; padding: 12px 16px; outline: none; transition: border-color .15s;
  }
  input:focus { border-color: var(--accent); }
  .fallback-note {
    font-size: 13px; color: var(--muted); background: #161616;
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 10px 14px; margin-top: 10px;
  }
  .error-msg { color: var(--danger); font-size: 13px; margin-top: 8px; display: none; }
  /* Footer */
  .footer {
    padding: 20px 40px 28px; border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
  }
  .btn {
    border: none; border-radius: var(--radius); cursor: pointer;
    font-size: 15px; font-weight: 500; padding: 11px 24px; transition: opacity .15s;
  }
  .btn:disabled { opacity: .35; cursor: default; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { opacity: .85; }
  .btn-secondary { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-secondary:hover:not(:disabled) { background: #252525; color: var(--text); }
  .btn-large { padding: 14px 36px; font-size: 16px; }
  .skip-link { background: none; border: none; color: var(--muted); font-size: 13px;
    cursor: pointer; text-decoration: underline; }
  .skip-link:hover { color: var(--text); }
  /* Done */
  .done { text-align: center; padding: 12px 0 4px; }
  .done .done-icon { font-size: 52px; margin-bottom: 14px; }
  .done h2 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
  .done p { color: var(--muted); font-size: 14px; margin-bottom: 6px; }
  .cmd {
    background: #111; border: 1px solid var(--border); border-radius: var(--radius);
    padding: 12px 20px; display: inline-block;
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 14px; color: var(--accent); margin-top: 14px;
  }
</style>
</head>
<body>
<div class="card">
  <div class="progress-track"><div class="progress-fill" id="progress"></div></div>
  <div class="progress-label" id="progressLabel"></div>
  <div class="body" id="body"></div>
  <div class="footer" id="footer"></div>
</div>

<script>
const slots = ${slotsJson};
let phase = 'welcome';
let current = 0;
const values = {};

slots.forEach(s => {
  if (s.existing && s.existing !== '••••••••') values[s.key] = s.existing;
});

function render() {
  document.getElementById('progress').style.width =
    phase === 'welcome' ? '0%' :
    phase === 'done' ? '100%' :
    Math.round((current / slots.length) * 100) + '%';

  if (phase === 'welcome') { renderWelcome(); return; }
  if (phase === 'done' || current >= slots.length) { submitSetup(); return; }
  renderSlot(slots[current]);
}

function renderWelcome() {
  document.getElementById('progressLabel').textContent = '';
  document.getElementById('body').innerHTML = \`
    <div class="welcome">
      <div class="app-icon">📋</div>
      <h1>JD Outreach</h1>
      <p class="tagline">Paste a job description and get a tailored CV,<br>the hiring manager's contact, and a draft outreach email.</p>
      <ul class="need-list">
        <li><span class="bullet">📄</span> Your resume (you can paste it or upload a file)</li>
        <li><span class="bullet">🔑</span> Anthropic API key — free at <strong>console.anthropic.com</strong></li>
        <li><span class="bullet">🔍</span> Hunter.io key — optional, helps find emails</li>
      </ul>
      <button class="btn btn-primary btn-large" onclick="startSetup()">Let's get started →</button>
      <p class="time-note">Takes about 5 minutes</p>
    </div>
  \`;
  document.getElementById('footer').innerHTML = '';
}

function startSetup() { phase = 'slots'; current = 0; render(); }

function renderSlot(slot) {
  document.getElementById('progressLabel').textContent =
    'Step ' + (current + 1) + ' of ' + slots.length + '  ·  ' + slot.label;

  const isFile = slot.type !== 'env';
  const badge = slot.required
    ? '<span class="badge-req">required</span>'
    : '<span class="badge-opt">optional</span>';
  const alreadySet = slot.existing
    ? '<p class="already-set">✓ Already saved — leave blank to keep it</p>' : '';

  let inputHtml = '';
  if (isFile) {
    inputHtml = \`
      <button class="upload-btn" onclick="document.getElementById('fileIn').click()">
        📎  Upload a file instead
      </button>
      <div class="upload-name" id="uploadName"></div>
      <input type="file" id="fileIn" accept=".md,.txt,.pdf,.doc,.docx">
      <div class="or-divider">— or paste below —</div>
      <textarea id="slotInput" placeholder="\${(slot.prompt||'').replace(/"/g,'&quot;')}" spellcheck="false">\${values[slot.key]||''}</textarea>
    \`;
  } else {
    inputHtml = \`
      <input type="\${slot.sensitive ? 'password' : 'text'}" id="slotInput"
        placeholder="\${slot.sensitive ? 'Paste your key here' : 'Type here'}"
        value="\${(slot.existing && slot.existing !== '••••••••') ? slot.existing : ''}">
      \${slot.fallback_note ? '<div class="fallback-note">' + slot.fallback_note + '</div>' : ''}
    \`;
  }

  document.getElementById('body').innerHTML = \`
    <div class="step">
      <div class="step-icon">\${slot.icon}</div>
      <h2>\${slot.label}\${badge}</h2>
      <p class="desc">\${slot.description}</p>
      \${alreadySet}
      \${inputHtml}
      <div class="error-msg" id="errMsg">This field is required.</div>
    </div>
  \`;

  if (isFile) {
    document.getElementById('fileIn').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const nameEl = document.getElementById('uploadName');
      nameEl.textContent = '✓ ' + f.name + ' loaded';
      nameEl.style.display = 'block';
      const r = new FileReader();
      r.onload = ev => { document.getElementById('slotInput').value = ev.target.result; };
      r.readAsText(f);
    });
  }

  const isLast = current === slots.length - 1;
  document.getElementById('footer').innerHTML = \`
    \${!slot.required
      ? '<button class="skip-link" onclick="skip()">Skip this step</button>'
      : '<span></span>'}
    <div style="display:flex;gap:10px;align-items:center;">
      \${current > 0 ? '<button class="btn btn-secondary" onclick="back()">← Back</button>' : '<span></span>'}
      <button class="btn btn-primary" onclick="next()">
        \${isLast ? 'Finish setup ✓' : 'Next step →'}
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
    if (err) err.style.display = 'block';
    return;
  }
  if (val) values[slot.key] = val;
  current++;
  render();
}

function skip() { current++; render(); }
function back() { if (current > 0) { current--; render(); } }

function submitSetup() {
  phase = 'done';
  document.getElementById('progressLabel').textContent = '';
  document.getElementById('progress').style.width = '100%';
  document.getElementById('footer').innerHTML = '';
  document.getElementById('body').innerHTML = \`
    <div class="done">
      <div class="done-icon">⏳</div>
      <h2>Saving your setup…</h2>
      <p>Writing your profile files and keys.</p>
    </div>
  \`;

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
          <div class="done-icon">🎉</div>
          <h2>You're all set!</h2>
          <p>Your profile and API keys are saved.</p>
          <p style="margin-top:6px;">Now start the app in your terminal:</p>
          <div class="cmd">npm run dev</div>
          <p style="margin-top:18px;font-size:13px;color:var(--muted);">
            Then open <strong style="color:var(--accent);">http://localhost:3040</strong> in your browser.
          </p>
          <p style="margin-top:8px;font-size:12px;color:var(--muted);">
            Run <code style="font-size:12px;">npm run setup</code> again at any time to change a setting.
          </p>
        </div>
      \`;
    } else {
      document.getElementById('body').innerHTML = \`
        <div class="done">
          <div class="done-icon">⚠️</div>
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
      let val = values[slot.key as string];
      if (!val) continue;

      if (slot.type === "env") {
        envVars[slot.env_var as string] = val;
      } else {
        // Convert plain-text ties list → JSON object
        if (slot.key === "ties") {
          try {
            JSON.parse(val);
          } catch {
            const items = val.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
            val = JSON.stringify({ employers: items, schools: [], places: [] }, null, 2);
          }
        }
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
  const cmd = process.platform === "darwin" ? `open ${url}` : `xdg-open ${url}`;
  exec(cmd);
});
