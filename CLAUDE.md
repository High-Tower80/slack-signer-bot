# CLAUDE.md — Slack PDF Signature Bot

## What this is
A Slack bot that signs PDFs with a user's saved signature image. Users DM the bot
(or use the "Sign PDF" message shortcut in channels), the bot applies the signature
with pdf-lib, and replies with the signed PDF. Channel workflows support an
approval flow: the bot posts "react ✅ to approve", reminds hourly (business hours
Mon–Fri 9am–5pm Pacific) until approved, and confirms with a 👀 reaction.

## Layout
- `src/` — React + Vite landing page (marketing only; no user functionality)
  - `src/pages/Index.tsx` — landing page
  - `src/pages/Setup.tsx` — self-hosting setup guide
- `supabase/functions/slack-events/index.ts` — **the entire bot** (~42k chars).
  One edge function handling: Slack Events API (messages, app_home_opened,
  reaction_added), Interactivity payloads (Home tab button, `sign_pdf` message
  shortcut), and the hourly reminder job (`__reminder` route via pg_cron).

## Backend (Lovable Cloud / Supabase, project ref gkrucyxdsycxsohxkula)
- Tables (all service-role only, deny-all RLS — never add broad policies):
  - `signatures` — slack_user_id → storage_path (private `signatures` bucket)
  - `last_signed_pdfs` — per-user cache of the last signed PDF (channel, thread_ts,
    pdf_url, rotation) so "make it bigger" / "page 2 bottom left" work later
  - `pending_approvals` — open approval requests (channel, thread_ts, signer_id,
    bot_msg_ts, approved_at, last_reminded_at)
- Types: `src/integrations/supabase/types.ts` (auto-generated, do not hand-edit)

## Secrets (never commit; supplied at deploy time)
- `SLACK_BOT_TOKEN` — Slack app → OAuth & Permissions
- `SLACK_SIGNING_SECRET` — Slack app → Basic Information → App Credentials

## Slack app configuration (must match the code's callback IDs)
- Scopes (bot): chat:write, files:read, files:write, im:history, im:read,
  im:write, users:read, channels:history, groups:history, reactions:read,
  reactions:write
- Events: message.im, message.channels, message.groups, app_home_opened,
  reaction_added
- Interactivity + the function URL; message shortcut with callback ID `sign_pdf`
- Changes require a Slack app reinstall.

## Behavior rules baked into the code
- Default stamp size: xlarge (max 500×170)
- Placement: text search for "Total"/"Grand Total"/"Total Due"/"Amount Due"
  (needs selectable PDF text; scanned PDFs fall back to bottom-right)
- Natural-language adjustments via Gemini Flash Lite with strict
  position/size/rotation allowlists (never trust raw AI output)
- Rotations supported: 90/180/270, persisted in `last_signed_pdfs.rotation`
- Channel uploads are signed with the configured owner's signature
  (`SIGNER_SLACK_USER_ID` fallback: most recently updated signature)
- A ✅ anywhere in the approval thread counts as approval
- File cap 50 MB, request body cap 1 MB, event-ID dedup, only
  `url_private_download` is used for file fetches (HTML responses rejected)
- Reminders post with `reply_broadcast: false` (thread only)

## Deploy
Edge function is deployed via Lovable (`supabase/functions/slack-events`).
For self-hosting, follow `src/pages/Setup.tsx` / the published /setup page.

## Gotchas
- Slack's 3s ack deadline: heavy work runs inside `EdgeRuntime.waitUntil()`
  with an immediate 200 ack — keep this pattern.
- Don't remove the deny-all RLS; access is intentionally service-role only.
- Adjustment commands must run in the thread; bot messages must not broadcast.
