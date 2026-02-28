# Slack PDF Signature Bot

Sign PDFs without leaving Slack. Save your signature once, drop in a PDF, get it back signed in seconds.

## What It Does

1. **DM the bot** your signature (PNG/JPG) — background is removed automatically
2. **Send a PDF** in the same DM — bot returns it signed in seconds
3. **Adjust with plain English** — "make it bigger", "page 2 top left", "try again smaller"
4. **Use the shortcut** — click ⋮ on any PDF in a channel → "Sign PDF"

## Features

- ⚡ Instant PDF signing — no queues, no waiting
- 🔒 Secure — signatures and documents stay in your workspace
- 🧠 AI-powered placement — natural language adjustment commands
- 🖼️ Auto background removal for signature images
- 📍 7 placement positions × 4 sizes across any page
- 🔄 Update your signature anytime
- 📎 Works in DMs and channels (via message shortcut)

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Edge Functions, Storage, Postgres)
- **AI**: Lovable AI for signature placement instructions
- **PDF Processing**: pdf-lib
- **Image Processing**: sharp (background removal)

## Self-Hosting

No secrets or API keys are stored in the codebase. To run your own instance:

1. Remix this project on [Lovable](https://lovable.dev)
2. Follow the [Setup Guide](https://slack-signer-bot.lovable.app/setup)

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
