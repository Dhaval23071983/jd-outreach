# JD Outreach

Paste a job description. The app returns:

1. The department and sub-department the role most likely sits in.
2. The likely hiring manager's title, plus named candidates found with web search, each with evidence and sources.
3. The candidate's email from Hunter.io (Email Finder), or a list of senior people in the matching Hunter department.
4. A drafted outreach email and follow-up, based on your background.

## Install (first time)

Clone the repo, then run the setup wizard. It walks you through adding your CV, career facts, writing samples, and API keys — none of that data is in this repo.

```bash
git clone <repo-url>
cd jd-outreach
npm run setup
```

The wizard saves your context to `profile/` (gitignored) and your API keys to `.env` (also gitignored). Re-run `npm run setup` at any time to update a slot.

You need:
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com)
- **Hunter.io API key** (optional) — [hunter.io](https://hunter.io). Without it, hiring manager lookup falls back to web search only.

After setup:

```bash
npm run dev   # http://localhost:3040
```

## How it works

1. **Check fit** (`POST /api/assess`): reads the JD against your `profile/base-cv.md` and returns a verdict with reasons.
2. **Go ahead** (`POST /api/go`): tailors the CV (PDF in `output/`), finds the hiring manager (Hunter first, web search only if Hunter has no strong match), drafts the email with 3 subject-line options, and saves it to the tracker as "drafted".
3. **Tracker** (`data/tracker.json`): "I sent it" starts the follow-up timer (5 days, then 7). Follow-ups are drafted only when you click "Draft follow-up".

## Profile files (your context — not in this repo)

| File | What goes in it |
|---|---|
| `profile/base-cv.md` | Your master CV in Markdown |
| `profile/facts.md` | Hard facts the AI must never contradict |
| `profile/email-example.txt` | A real email in your voice |
| `profile/signature.txt` | Your email signature |
| `profile/story-rules.md` | Optional overrides for the story coaching standard |

See `profile.example/` for format templates.
