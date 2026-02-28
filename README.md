# Slack PDF Signature Bot

Sign PDFs without leaving Slack. Save your signature once, drop in a PDF, get it back signed in seconds.

## What It Does

1. **DM the bot** your signature (PNG/JPG) — background is removed automatically
2. **Send a PDF** in the same DM — bot returns it signed in seconds
3. **Adjust with plain English** — "make it bigger", "page 2 top left", "try again smaller"
4. **Use the shortcut** — click ⋮ on any PDF in a channel → "Sign PDF"
   
<img width="696" height="641" alt="SCR-20260228-dgyd" src="https://github.com/user-attachments/assets/72e9f9e9-a295-4d96-86e8-7824089b2cd3" />
<img width="549" height="339" alt="SCR-20260228-djqw" src="https://github.com/user-attachments/assets/1bb5c7b9-5657-44fc-b807-4713bee80131" />
<img width="558" height="365" alt="SCR-20260228-dkoo" src="https://github.com/user-attachments/assets/350cbeb5-a19f-488f-a9e2-1d48bdfc9523" />

## Features

- ⚡ Instant PDF signing — no queues, no waiting
- 🔒 Secure — signatures and documents stay in your workspace
- 🧠 AI-powered placement — natural language adjustment commands
- 🖼️ Auto background removal for signature images
- 📍 7 placement positions × 4 sizes across any page
- 🔄 Update your signature anytime
- 📎 Works in DMs and channels (via message shortcut)
- 📄 Batch signing — upload multiple PDFs at once and get them all signed

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Edge Functions, Storage, Postgres)
- **AI**: Lovable AI for signature placement instructions
- **PDF Processing**: pdf-lib
- **Image Processing**: sharp (background removal)

## Self-Hosting

No secrets or API keys are stored in the codebase. To run your own instance:

**Option A — Remix on Lovable**
1. Open the project on [Lovable](https://lovable.dev) and click **Remix**
2. Follow the [Setup Guide](https://slack-signer-bot.lovable.app/setup)

**Option B — Fork / Clone from GitHub**
1. Fork or clone this repo
2. Follow the [Setup Guide](https://slack-signer-bot.lovable.app/setup) to configure your Slack app, database, and secrets

Or see `supabase/functions/slack-events/index.ts` for the full edge function source.

### Required Secrets (via Lovable Cloud)

| Secret | Source |
|--------|--------|
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information |

### Required Slack Bot Scopes

```
chat:write, files:read, files:write, im:history, im:read, im:write, users:read
```

### Database Tables

The project uses two tables (`signatures` and `last_signed_pdfs`) plus a `signatures` storage bucket. Full SQL is in the [setup guide](https://slack-signer-bot.lovable.app/setup).

## License

MIT
