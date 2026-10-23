#!/usr/bin/env npx tsx
/**
 * JD Outreach installer — reads app.manifest.json and seeds all user-specific slots.
 * Run: npx tsx install.ts
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, "app.manifest.json");

// ── Types ────────────────────────────────────────────────────────────────────

interface FileSlot {
  key: string;
  label: string;
  description: string;
  type: "markdown_file" | "text_file";
  path: string;
  required: boolean;
  multiline: boolean;
  prompt: string;
  intro_example?: string;
}

interface EnvSlot {
  key: string;
  label: string;
  description: string;
  type: "env";
  env_var: string;
  required: boolean;
  sensitive: boolean;
  fallback_note?: string;
}

type Slot = FileSlot | EnvSlot;

interface Manifest {
  display_name: string;
  version: string;
  description: string;
  slots: Slot[];
  setup: {
    install_commands: string[];
    start_command: string;
    open_url: string;
  };
}

// ── Readline helpers ─────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/** Reads lines until the user enters END on its own line. */
async function askMultiline(prompt: string): Promise<string> {
  console.log(`\n${prompt}`);
  console.log("  (Paste your content, then type END on a new line and press Enter)\n");
  const lines: string[] = [];
  return new Promise((resolve) => {
    rl.on("line", function handler(line) {
      if (line.trim() === "END") {
        rl.removeListener("line", handler);
        resolve(lines.join("\n").trim());
      } else {
        lines.push(line);
      }
    });
  });
}

function hr() { console.log("\n" + "─".repeat(60) + "\n"); }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }

// ── Env file helpers ─────────────────────────────────────────────────────────

function readEnvFile(envPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(envPath)) return map;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return map;
}

function writeEnvFile(envPath: string, vars: Map<string, string>) {
  const lines = Array.from(vars.entries()).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
}

// ── Slot handlers ────────────────────────────────────────────────────────────

async function handleFileSlot(slot: FileSlot, installDir: string): Promise<boolean> {
  const destPath = path.join(installDir, slot.path);
  const existing = fs.existsSync(destPath);

  console.log(bold(`\n${slot.label}`));
  console.log(dim(slot.description));

  if (existing) {
    const answer = await ask(`  ${slot.label} already exists. Overwrite? (y/N) `);
    if (answer.trim().toLowerCase() !== "y") {
      console.log(dim("  Kept existing file."));
      return true;
    }
  }

  if (!slot.required) {
    const skip = await ask("  Skip this optional slot? (y/N) ");
    if (skip.trim().toLowerCase() === "y") {
      console.log(dim("  Skipped."));
      return true;
    }
  }

  // Offer file import or paste
  const mode = await ask("  Import from a file path, or paste inline? (f/p) ");
  let content = "";

  if (mode.trim().toLowerCase() === "f") {
    const filePath = (await ask("  File path: ")).trim();
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      if (fs.existsSync(resolved)) {
        console.log(yellow(`  That path is a directory. Provide a file path instead, or switch to paste mode.`));
      } else {
        console.log(yellow(`  File not found: ${resolved}. Switching to paste mode.`));
      }
      content = await askMultiline(slot.prompt);
    } else {
      content = fs.readFileSync(resolved, "utf8").trim();
      console.log(green(`  Imported ${content.split("\n").length} lines from ${resolved}`));
    }
  } else {
    content = await askMultiline(slot.prompt);
  }

  if (!content && slot.required) {
    console.log(yellow("  No content provided for a required slot. You can re-run install.ts to fill it."));
    return false;
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content + "\n", "utf8");
  console.log(green(`  Saved → ${slot.path}`));
  return true;
}

async function handleEnvSlot(slot: EnvSlot, envPath: string, vars: Map<string, string>): Promise<boolean> {
  const existing = vars.get(slot.env_var);

  console.log(bold(`\n${slot.label}`));
  console.log(dim(slot.description));
  if (slot.fallback_note) console.log(dim(`  Note: ${slot.fallback_note}`));

  if (existing) {
    const answer = await ask(`  ${slot.env_var} is already set. Replace it? (y/N) `);
    if (answer.trim().toLowerCase() !== "y") {
      console.log(dim("  Kept existing value."));
      return true;
    }
  }

  if (!slot.required) {
    const skip = await ask("  Skip this optional key? (y/N) ");
    if (skip.trim().toLowerCase() === "y") {
      console.log(dim("  Skipped."));
      return true;
    }
  }

  // Use readline's hidden input trick: we can't hide chars in raw Node.js readline,
  // so we tell the user the value won't be echoed to the screen and use a prompt.
  // For true hidden input, a TTY-level approach would be needed.
  const value = (await ask(`  Paste your ${slot.env_var} (input visible in terminal): `)).trim();

  if (!value && slot.required) {
    console.log(yellow("  No value provided for a required key. Set it manually in .env."));
    return false;
  }

  if (value) vars.set(slot.env_var, value);
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error("app.manifest.json not found. Run this script from the app directory.");
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  console.clear();
  console.log(bold(`Installing: ${manifest.display_name} v${manifest.version}`));
  console.log(manifest.description);
  hr();
  console.log("This installer will set up your personal context — the parts that stay private to you.");
  console.log("App logic files are already in this directory and will not be changed.\n");

  const slotCount = manifest.slots.filter((s) => s.required).length;
  console.log(dim(`${slotCount} required slots + optional ones. You can re-run this script at any time to update.\n`));

  const envPath = path.join(here, ".env");
  const envVars = readEnvFile(envPath);

  let allRequired = true;

  for (const slot of manifest.slots) {
    hr();
    let ok: boolean;
    if (slot.type === "env") {
      ok = await handleEnvSlot(slot as EnvSlot, envPath, envVars);
    } else {
      ok = await handleFileSlot(slot as FileSlot, here);
    }
    if (!ok && slot.required) allRequired = false;
  }

  // Write .env with any env vars we collected
  writeEnvFile(envPath, envVars);

  hr();
  console.log(bold("Running npm install…"));
  try {
    for (const cmd of manifest.setup.install_commands) {
      execSync(cmd, { cwd: here, stdio: "inherit" });
    }
  } catch {
    console.log(yellow("npm install failed. Run it manually: npm install"));
  }

  hr();
  if (allRequired) {
    console.log(green("✓ Setup complete."));
  } else {
    console.log(yellow("⚠  Some required slots were not filled. Re-run install.ts to complete them."));
  }
  console.log(`\nTo start the app:\n  ${bold(manifest.setup.start_command)}`);
  console.log(`Then open: ${manifest.setup.open_url}\n`);

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
