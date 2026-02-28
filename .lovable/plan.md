
# Slack PDF Signature Bot

## Overview
A Slack bot that lets users save their personal signature image and automatically applies it to uploaded PDFs — all within Slack DMs.

## How It Works

### 1. Signature Setup (One-time)
- User DMs the bot with a signature image (PNG/JPG)
- Bot saves it and confirms: "✅ Signature saved! Upload a PDF anytime to sign it."
- User can update their signature by sending a new image

### 2. PDF Signing Flow
- User uploads one or more PDFs to the bot DM
- Bot processes each PDF:
  - **Primary**: Scans for a "Signature" line/field and places the signature there
  - **Fallback**: Places signature in white space at the bottom of the first page
- Signature is scaled appropriately and doesn't overlap existing content
- Bot replies with the signed PDF(s) as downloadable files

### 3. Error Handling
- If no signature is saved yet: "Please send me your signature image first!"
- If file isn't a PDF: "I can only sign PDF files. Please upload a PDF."
- Processing failures return a clear error message

## Technical Architecture

### Backend (Supabase / Lovable Cloud)
- **Database**: Store user signatures (Slack user ID → signature image reference)
- **Storage**: Supabase storage bucket for signature images
- **Edge Function**: Receives Slack events, processes PDFs using pdf-lib, uploads signed PDFs back to Slack

### Slack Integration
- Custom Slack app (since we need to **receive** file upload events, not just send messages)
- Bot listens for `message` events in DMs containing file uploads
- Uses Slack API to download files and upload signed PDFs back

### Web App (Minimal)
- Simple landing/status page — no user-facing functionality needed since everything is in Slack

## Setup Flow
We'll guide you through:
1. Creating the Slack app with the right permissions
2. Connecting it to the edge function for event handling
3. Storing credentials securely
