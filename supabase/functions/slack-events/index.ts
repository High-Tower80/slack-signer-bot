import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import UPNG from "https://esm.sh/upng-js@2.1.0";
import { getDocumentProxy } from "npm:unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const processedEventIds = new Set<string>();
const MAX_EVENT_CACHE = 1000;

const VALID_POSITIONS = new Set(["near-total", "bottom-right", "bottom-left", "bottom-center", "top-right", "top-left", "top-center", "center"]);
const VALID_SCALES = new Set(["small", "medium", "large", "xlarge"]);

// ─── Placement types ───────────────────────────────────────────────
interface SigningOptions {
  page: number; // 0-indexed, -1 = last page
  position: "near-total" | "bottom-right" | "bottom-left" | "bottom-center" | "top-right" | "top-left" | "top-center" | "center";
  scale: "small" | "medium" | "large" | "xlarge";
}

const DEFAULT_OPTIONS: SigningOptions = {
  page: 0,
  position: "near-total",
  scale: "xlarge",
};

const SCALE_MAP: Record<string, { maxWidth: number; maxHeight: number }> = {
  small: { maxWidth: 150, maxHeight: 50 },
  medium: { maxWidth: 250, maxHeight: 80 },
  large: { maxWidth: 350, maxHeight: 120 },
  xlarge: { maxWidth: 500, maxHeight: 170 },
};

// ─── Slack helpers ─────────────────────────────────────────────────
async function verifySlackSignature(
  body: string, timestamp: string, signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sigBasestring));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return `v0=${hex}` === signature;
}

// Fetch fresh file info from Slack API to get a valid download URL
async function getSlackFileInfo(fileId: string): Promise<{ url_private_download: string; url_private: string; name: string; mimetype: string }> {
  const res = await fetch(`https://slack.com/api/files.info?file=${fileId}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("files.info failed:", data);
    throw new Error(`files.info failed: ${data.error}`);
  }
  return data.file;
}

async function downloadSlackFile(url: string): Promise<Uint8Array> {
  // Follow redirects manually to preserve auth header
  let currentUrl = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(currentUrl, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      redirect: "manual",
    });

    // Handle redirects — re-attach auth header
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        // Consume body to avoid resource leak
        await res.text();
        currentUrl = location;
        continue;
      }
    }

    if (!res.ok) {
      await res.text();
      throw new Error(`Slack file download failed: ${res.status} ${res.statusText}`);
    }

    // Check file size before downloading
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      await res.body?.cancel();
      throw new Error(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    const contentType = res.headers.get("content-type") || "";
    const bytes = new Uint8Array(await res.arrayBuffer());

    // Double-check actual size
    if (bytes.length > MAX_FILE_SIZE) {
      throw new Error(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    // Detect if Slack returned an HTML page instead of the actual file
    if (contentType.includes("text/html") || (bytes.length > 4 && bytes[0] === 0x3C)) {
      console.error("Slack returned HTML instead of file. Content-Type:", contentType, "URL:", currentUrl);
      throw new Error("Slack returned HTML instead of file data. The file URL may have expired or the bot lacks files:read scope.");
    }
    return bytes;
  }
  throw new Error("Too many redirects downloading Slack file");
}

async function sendSlackMessage(channel: string, text: string, threadTs?: string) {
  const body: Record<string, string> = { channel, text };
  if (threadTs) body.thread_ts = threadTs;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function uploadSlackFile(
  channel: string, fileData: Uint8Array, filename: string, title: string, threadTs?: string
) {
  const uploadRes = await fetch("https://slack.com/api/files.getUploadURLExternal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ filename, length: fileData.length.toString() }),
  });
  const uploadData = await uploadRes.json();
  if (!uploadData.ok) {
    console.error("Failed to get upload URL:", uploadData);
    throw new Error("Failed to get upload URL");
  }

  await fetch(uploadData.upload_url, { method: "POST", body: fileData.buffer as ArrayBuffer });

  const completeBody: Record<string, unknown> = {
    files: [{ id: uploadData.file_id, title }],
    channel_id: channel,
  };
  if (threadTs) completeBody.thread_ts = threadTs;

  const completeRes = await fetch("https://slack.com/api/files.completeUploadExternal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(completeBody),
  });
  const completeData = await completeRes.json();
  if (!completeData.ok) {
    console.error("Failed to complete upload:", completeData);
  }
}

// ─── Image processing ──────────────────────────────────────────────
function removeBackground(imageData: Uint8Array): Uint8Array {
  const img = UPNG.decode(imageData.buffer as ArrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const threshold = 230;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      rgba[i + 3] = 0;
    }
  }
  const encoded = UPNG.encode([rgba.buffer], img.width, img.height, 0);
  return new Uint8Array(encoded);
}

// ─── Signature storage ─────────────────────────────────────────────
async function getSignature(slackUserId: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from("signatures").select("storage_path")
    .eq("slack_user_id", slackUserId).maybeSingle();
  if (error || !data) return null;

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("signatures").download(data.storage_path);
  if (downloadError || !fileData) return null;
  return new Uint8Array(await fileData.arrayBuffer());
}

async function saveSignature(
  slackUserId: string, imageData: Uint8Array, mimetype: string
): Promise<boolean> {
  let processedData: Uint8Array;
  try {
    processedData = removeBackground(imageData);
  } catch (err) {
    console.error("Background removal failed, saving original:", err);
    processedData = imageData;
  }

  const path = `${slackUserId}/signature.png`;
  const { error: uploadError } = await supabase.storage
    .from("signatures").upload(path, processedData, { contentType: "image/png", upsert: true });
  if (uploadError) { console.error("Upload error:", uploadError); return false; }

  const { error: dbError } = await supabase.from("signatures").upsert(
    { slack_user_id: slackUserId, storage_path: path },
    { onConflict: "slack_user_id" }
  );
  if (dbError) { console.error("DB error:", dbError); return false; }
  return true;
}

// ─── AI intent parsing ─────────────────────────────────────────────
async function parseSigningInstruction(userText: string, totalPages: number): Promise<SigningOptions | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You parse signature placement instructions for a PDF signing bot. The PDF has ${totalPages} page(s).
Return ONLY a JSON object with these fields:
- "page": 1-indexed page number, or "last" for last page. Default 1.
- "position": one of "near-total" (next to/under the document's Total amount), "bottom-right", "bottom-left", "bottom-center", "top-right", "top-left", "top-center", "center". Default "near-total" unless the user names a specific spot.
- "scale": one of "small", "medium", "large", "xlarge". Default "large".

Examples:
"make it bigger" → {"page":1,"position":"near-total","scale":"xlarge"}
"put it by the total" → {"page":1,"position":"near-total","scale":"large"}
"page 2 bottom left" → {"page":2,"position":"bottom-left","scale":"large"}
"smaller, top right, last page" → {"page":"last","position":"top-right","scale":"small"}
"center of page 3" → {"page":3,"position":"center","scale":"large"}

Return ONLY the JSON, no markdown, no explanation.`,
          },
          { role: "user", content: userText },
        ],
        temperature: 0,
        max_tokens: 100,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content);
    const pageNum = parsed.page === "last" ? -1 : (parseInt(parsed.page) || 1) - 1;
    const clampedPage = pageNum === -1 ? totalPages - 1 : Math.max(0, Math.min(pageNum, totalPages - 1));

    const position = VALID_POSITIONS.has(parsed.position) ? parsed.position : "near-total";
    const scale = VALID_SCALES.has(parsed.scale) ? parsed.scale : "large";

    return {
      page: clampedPage,
      position,
      scale,
    };
  } catch (err) {
    console.error("AI parsing error:", err);
    return null;
  }
}

// ─── PDF signing ───────────────────────────────────────────────────
async function signPdf(
  pdfBytes: Uint8Array, signatureBytes: Uint8Array, options: SigningOptions = DEFAULT_OPTIONS
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pagesAll = pdfDoc.getPages();
  if (options.position === "near-total") {
    const hit = await findTotal(pdfBytes);
    if (hit) {
      const sigImage = await pdfDoc.embedPng(signatureBytes);
      const page = pagesAll[hit.page];
      const { width: pw } = page.getSize();
      const dims = SCALE_MAP[options.scale] || SCALE_MAP.large;
      // keep it proportionate to the line; cap so it fits on the page
      const maxW = Math.min(dims.maxWidth * 0.6, pw - hit.x - 20);
      const maxH = dims.maxHeight * 0.6;
      const sc = Math.min(maxW / sigImage.width, maxH / sigImage.height);
      const w = sigImage.width * sc, h = sigImage.height * sc;
      let x = hit.x, y = hit.y - h - 4; // directly under the Total line
      if (y < 20) { x = Math.min(hit.x + hit.w + 12, pw - w - 20); y = hit.y - h / 3; } // no room below → beside it
      page.drawImage(sigImage, { x, y, width: w, height: h });
      return await pdfDoc.save();
    }
    console.log("No 'Total' found, falling back to bottom-right");
    options = { ...options, position: "bottom-right" };
  }
  const sigImage = await pdfDoc.embedPng(signatureBytes);

  const pages = pdfDoc.getPages();
  const targetPage = pages[Math.min(options.page, pages.length - 1)];
  const { width: pageWidth, height: pageHeight } = targetPage.getSize();

  const dims = SCALE_MAP[options.scale] || SCALE_MAP.large;
  const scale = Math.min(dims.maxWidth / sigImage.width, dims.maxHeight / sigImage.height);
  const sigWidth = sigImage.width * scale;
  const sigHeight = sigImage.height * scale;

  const margin = 72;
  let x: number, y: number;

  switch (options.position) {
    case "bottom-left":
      x = margin; y = margin; break;
    case "bottom-center":
      x = (pageWidth - sigWidth) / 2; y = margin; break;
    case "bottom-right":
      x = pageWidth - sigWidth - margin; y = margin; break;
    case "top-left":
      x = margin; y = pageHeight - sigHeight - margin; break;
    case "top-center":
      x = (pageWidth - sigWidth) / 2; y = pageHeight - sigHeight - margin; break;
    case "top-right":
      x = pageWidth - sigWidth - margin; y = pageHeight - sigHeight - margin; break;
    case "center":
      x = (pageWidth - sigWidth) / 2; y = (pageHeight - sigHeight) / 2; break;
    default:
      x = pageWidth - sigWidth - margin; y = margin;
  }

  targetPage.drawImage(sigImage, { x, y, width: sigWidth, height: sigHeight });
  return await pdfDoc.save();
}

// Find the "Total" line (prefers Grand Total / Total Due; ignores Subtotal). Returns PDF coords.
async function findTotal(pdfBytes: Uint8Array): Promise<{ page: number; x: number; y: number; w: number } | null> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
    let best: { page: number; x: number; y: number; w: number; score: number } | null = null;
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p);
      const tc = await pg.getTextContent();
      for (const it of tc.items as any[]) {
        const t = (it.str || "").trim();
        if (!/\btotal\b/i.test(t) || /sub\s*-?\s*total/i.test(t)) continue;
        let score = 1;
        if (/grand\s+total|total\s+(due|amount|payable)|amount\s+due/i.test(t)) score = 3;
        else if (/^total\b/i.test(t)) score = 2;
        const x = it.transform[4], y = it.transform[5];
        // later pages and lower positions win ties (final total is usually last)
        const cand = { page: p - 1, x, y, w: it.width || 60, score };
        if (!best || score > best.score || (score === best.score && (p - 1 > best.page || (p - 1 === best.page && y < best.y)))) best = cand;
      }
    }
    return best;
  } catch (e) {
    console.error("findTotal error:", e);
    return null;
  }
}

// Owner whose signature is applied to PDFs dropped in channels.
async function getChannelSignerId(): Promise<string | null> {
  const envId = Deno.env.get("SIGNER_SLACK_USER_ID");
  if (envId) return envId;
  const { data } = await supabase.from("signatures").select("slack_user_id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data?.slack_user_id ?? null;
}

function isImage(mimetype: string): boolean { return mimetype.startsWith("image/"); }
function isPdf(mimetype: string): boolean { return mimetype === "application/pdf"; }

// ─── Last-signed PDF persistence (DB-backed) ──────────────────────
async function cacheLastPdf(userId: string, pdfUrl: string, fileName: string, channel: string, threadTs?: string) {
  await supabase.from("last_signed_pdfs").upsert(
    { slack_user_id: userId, pdf_url: pdfUrl, file_name: fileName, channel, thread_ts: threadTs || null },
    { onConflict: "slack_user_id" }
  );
}

async function getLastPdf(userId: string) {
  const { data } = await supabase
    .from("last_signed_pdfs").select("*")
    .eq("slack_user_id", userId).maybeSingle();
  return data;
}

// Channel threads: find the cached PDF by the thread it was signed in,
// so anyone in the thread (not just the signer) can request adjustments.
async function getLastPdfByThread(threadTs: string) {
  const { data } = await supabase
    .from("last_signed_pdfs").select("*")
    .eq("thread_ts", threadTs).maybeSingle();
  return data;
}

// ─── Home Tab ──────────────────────────────────────────────────────
async function publishHomeTab(userId: string) {
  const { data: sigRecord } = await supabase
    .from("signatures").select("storage_path, updated_at")
    .eq("slack_user_id", userId).maybeSingle();

  const hasSig = !!sigRecord;
  const sigStatus = hasSig
    ? `✅ *Signature saved* (last updated: ${new Date(sigRecord.updated_at).toLocaleDateString()})`
    : "⚠️ *No signature saved yet*";

  const blocks = [
    { type: "header", text: { type: "plain_text", text: "📝 Slack PDF Signature Bot", emoji: true } },
    {
      type: "section",
      text: { type: "mrkdwn", text: "Sign PDFs without leaving Slack. Save your signature once, then upload any PDF to get it signed instantly — all in a DM." },
    },
    { type: "divider" },
    { type: "header", text: { type: "plain_text", text: "Your Signature", emoji: true } },
    {
      type: "section",
      text: { type: "mrkdwn", text: sigStatus },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: hasSig ? "🔄 Update Signature" : "📤 Upload Signature", emoji: true },
        action_id: "upload_signature_prompt",
        style: hasSig ? undefined : "primary",
      },
    },
    { type: "divider" },
    { type: "header", text: { type: "plain_text", text: "How It Works", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: "*1. 💬 DM the Bot*\nOpen a direct message with this bot from the sidebar." } },
    { type: "section", text: { type: "mrkdwn", text: "*2. ✍️ Upload Your Signature*\nSend a PNG or JPG image of your signature. The bot removes the background automatically." } },
    { type: "section", text: { type: "mrkdwn", text: "*3. 📄 Upload a PDF*\nSend any PDF document you need signed." } },
    { type: "section", text: { type: "mrkdwn", text: "*4. ✅ Get Your Signed PDF*\nThe bot applies your signature and sends back the signed document in seconds." } },
    { type: "section", text: { type: "mrkdwn", text: '*5. 🗣️ Adjust Placement*\nReply with instructions like "make it bigger", "page 2 bottom left", or "try again smaller, top center".' } },
    { type: "divider" },
    { type: "context", elements: [{ type: "mrkdwn", text: "🔒 Your signature and documents are processed securely. Nothing is shared externally." }] },
  ];

  const res = await fetch("https://slack.com/api/views.publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, view: { type: "home", blocks } }),
  });
  const data = await res.json();
  if (!data.ok) console.error("Failed to publish home tab:", data);
}

// ─── Message shortcut handler ──────────────────────────────────────
async function handleMessageShortcut(payload: any) {
  const userId = payload.user?.id;
  const message = payload.message;
  const channel = payload.channel?.id;

  if (!message || !channel || !userId) {
    console.error("Missing data in message shortcut payload");
    return;
  }

  const files = message.files || [];
  const pdfFiles = files.filter((f: any) => isPdf(f.mimetype || ""));

  if (pdfFiles.length === 0) {
    await sendSlackMessage(channel, "⚠️ That message doesn't contain any PDF files to sign.");
    return;
  }

  const signatureData = await getSignature(userId);
  if (!signatureData) {
    await sendSlackMessage(channel, `<@${userId}> ⚠️ You haven't saved a signature yet. DM me a PNG/JPG of your signature first!`);
    return;
  }

  const threadTs = message.ts;

  for (const file of pdfFiles) {
    try {
      // Use files.info API to get fresh download URL (shortcut URLs from channels may be stale)
      let downloadUrl = file.url_private_download || file.url_private;
      let fileName = file.name || "document.pdf";
      if (file.id) {
        try {
          const freshFile = await getSlackFileInfo(file.id);
          downloadUrl = freshFile.url_private_download || freshFile.url_private || downloadUrl;
          fileName = freshFile.name || fileName;
          console.log("Got fresh download URL via files.info for file:", file.id);
        } catch (e) {
          console.warn("files.info failed, falling back to payload URL:", e);
        }
      }

      const pdfData = await downloadSlackFile(downloadUrl);

      // Cache original PDF URL for follow-up adjustments
      await cacheLastPdf(userId, downloadUrl, fileName, channel, threadTs);

      const signedPdf = await signPdf(pdfData, signatureData, DEFAULT_OPTIONS);
      const signedFilename = `signed_${fileName}`;

      await uploadSlackFile(channel, signedPdf, signedFilename, `Signed: ${file.title || fileName}`, threadTs);
      await sendSlackMessage(channel, `✅ Signed! Reply here to adjust — e.g. "make it bigger", "page 2 bottom left", "try again smaller, top center"`, threadTs);
    } catch (err) {
      console.error("Shortcut PDF signing error:", err);
      await sendSlackMessage(channel, `❌ Failed to sign "${file.name || "PDF"}". Make sure it's a valid PDF.`);
    }
  }
}

// ─── Interaction handler ───────────────────────────────────────────
async function handleInteraction(payload: any) {
  console.log("Interaction type:", payload.type, "callback_id:", payload.callback_id);

  if (payload.type === "message_action" && payload.callback_id === "sign_pdf") {
    await handleMessageShortcut(payload);
    return;
  }

  const userId = payload.user?.id;
  const actions = payload.actions || [];

  for (const action of actions) {
    if (action.action_id === "upload_signature_prompt") {
      const convRes = await fetch("https://slack.com/api/conversations.open", {
        method: "POST",
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ users: userId }),
      });
      const convData = await convRes.json();
      if (convData.ok) {
        await sendSlackMessage(convData.channel.id, "📤 Send me your signature image here! Upload a PNG or JPG file of your signature and I'll save it (with background automatically removed).");
      }
    }
  }
}

// ─── Check if text is a signing adjustment command ─────────────────
function looksLikeAdjustment(text: string): boolean {
  const keywords = ["bigger", "smaller", "larger", "tiny", "huge", "page", "bottom", "top", "left", "right", "center", "middle", "try again", "move", "resize", "xlarge", "small", "medium", "large"];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ─── Main server ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    const timestamp = req.headers.get("x-slack-request-timestamp") || "";
    const slackSignature = req.headers.get("x-slack-signature") || "";
    const contentType = req.headers.get("content-type") || "";

    // Reject oversized request bodies (1MB limit for Slack payloads)
    if (bodyText.length > 1024 * 1024) {
      return new Response("Payload too large", { status: 413, headers: corsHeaders });
    }

    console.log("Incoming request:", { contentType, hasTimestamp: !!timestamp, hasSignature: !!slackSignature, bodyLength: bodyText.length });

    // Handle interactive payloads (URL-encoded form data)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(bodyText);
      const payloadStr = params.get("payload");
      if (payloadStr) {
        const interactionPayload = JSON.parse(payloadStr);
        // Respond to Slack immediately (<3s), process in background via waitUntil
        const bgWork = handleInteraction(interactionPayload).catch(
          (err) => console.error("Interaction handler error:", err)
        );
        // @ts-ignore - Deno Deploy / Supabase Edge Runtime global
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(bgWork);
        }
        return new Response("", { headers: corsHeaders });
      }
    }

    const payload = JSON.parse(bodyText);
    console.log("Parsed payload type:", payload.type, "event type:", payload.event?.type);

    // URL verification
    if (payload.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify signature
    const valid = await verifySlackSignature(bodyText, timestamp, slackSignature);
    if (!valid) {
      console.error("Invalid Slack signature");
      return new Response("Unauthorized", { status: 401 });
    }

    // Event callbacks
    if (payload.type === "event_callback") {
      const event = payload.event;

      // Deduplicate: Slack retries if we take >3s
      const eventId = payload.event_id;
      if (eventId && processedEventIds.has(eventId)) {
        console.log("Duplicate event, skipping:", eventId);
        return new Response("ok", { headers: corsHeaders });
      }
      if (eventId) {
        processedEventIds.add(eventId);
        // Evict oldest entries if cache grows too large
        if (processedEventIds.size > MAX_EVENT_CACHE) {
          const first = processedEventIds.values().next().value;
          if (first) processedEventIds.delete(first);
        }
      }

      if (event.type === "app_home_opened" && event.tab === "home") {
        await publishHomeTab(event.user);
        return new Response("ok", { headers: corsHeaders });
      }

      if (event.bot_id || event.subtype === "bot_message") {
        return new Response("ok", { headers: corsHeaders });
      }

      if (event.type === "message") {
        // Return immediately, process in background to avoid Slack retries
        const bgWork = (async () => {
          const channel = event.channel;
          const userId = event.user;
          const isDm = event.channel_type === "im";

          // Channel workflow: any PDF dropped in a channel the bot is in gets signed with the owner's signature
          if (!isDm && event.files && event.files.length > 0) {
            const pdfs = event.files.filter((f: any) => isPdf(f.mimetype || ""));
            if (pdfs.length === 0) return;
            const signerId = await getChannelSignerId();
            const signatureData = signerId ? await getSignature(signerId) : null;
            if (!signerId || !signatureData) {
              await sendSlackMessage(channel, "⚠️ No saved signature found. DM me a signature image first.", event.ts);
              return;
            }
            for (const file of pdfs) {
              try {
                let url = file.url_private_download || file.url_private;
                try { const fi = await getSlackFileInfo(file.id); url = fi.url_private_download || fi.url_private || url; } catch (_) { /* fallback */ }
                const pdfData = await downloadSlackFile(url);
                await cacheLastPdf(signerId, url, file.name || "document.pdf", channel, event.ts);
                const signedPdf = await signPdf(pdfData, signatureData, DEFAULT_OPTIONS);
                await uploadSlackFile(channel, signedPdf, `signed_${file.name || "document.pdf"}`, `Signed: ${file.title || file.name || "document.pdf"}`, event.ts);
                await sendSlackMessage(channel, `✅ Signed for <@${signerId}> to review. <@${signerId}>, reply in this thread to adjust — e.g. "make it bigger" or "page 2 bottom left".`, event.ts);
              } catch (err) {
                console.error("Channel PDF signing error:", err);
                await sendSlackMessage(channel, `❌ Failed to sign "${file.name || "PDF"}".`, event.ts);
              }
            }
            return;
          }
          // In channels, any thread reply (e.g. the accountant) can request adjustments
          if (!isDm && !event.files) {
            if (!event.thread_ts) return;
          }

          // Handle file uploads
          if (event.files && event.files.length > 0) {
            for (const file of event.files) {
              const mimetype = file.mimetype || "";

              if (isImage(mimetype)) {
                const existingSig = await getSignature(userId);
                const fileData = await downloadSlackFile(file.url_private_download || file.url_private);
                const saved = await saveSignature(userId, fileData, mimetype);
                if (saved) {
                  const msg = existingSig
                    ? "✅ Signature updated! Your new signature will be used for future PDFs."
                    : "✅ Signature saved! Upload a PDF anytime to sign it.";
                  await sendSlackMessage(channel, msg);
                  await publishHomeTab(userId);
                } else {
                  await sendSlackMessage(channel, "❌ Failed to save signature. Please try again.");
                }
              } else if (isPdf(mimetype)) {
                const signatureData = await getSignature(userId);
                if (!signatureData) {
                  await sendSlackMessage(channel, "⚠️ Please send me your signature image first! Upload a PNG or JPG of your signature.");
                  continue;
                }

                try {
                  const pdfData = await downloadSlackFile(file.url_private_download || file.url_private);
                  await cacheLastPdf(userId, file.url_private_download || file.url_private, file.name || "document.pdf", channel);

                  const signedPdf = await signPdf(pdfData, signatureData, DEFAULT_OPTIONS);
                  const signedFilename = `signed_${file.name || "document.pdf"}`;
                  await uploadSlackFile(channel, signedPdf, signedFilename, `Signed: ${file.title || file.name || "document.pdf"}`);
                  await sendSlackMessage(channel, '✅ Signed! Want to adjust? Just tell me — e.g. "make it bigger", "page 2 bottom left", or "try again smaller"');
                } catch (err) {
                  console.error("PDF signing error:", err);
                  await sendSlackMessage(channel, `❌ Failed to sign "${file.name || "PDF"}". Please make sure it's a valid PDF file.`);
                }
              } else {
                await sendSlackMessage(channel, "I can only process image files (for signatures) and PDF files (for signing). Please upload a PNG/JPG signature or a PDF to sign.");
              }
            }
          }
          // Handle text-only messages (adjustment commands)
          else if (event.text && !event.files) {
            const text = event.text.trim();

            // Check if user has a cached PDF to re-sign
            const cached = await getLastPdf(userId);
            if (cached && looksLikeAdjustment(text)) {
              const signatureData = await getSignature(userId);
              if (!signatureData) {
                await sendSlackMessage(channel, "⚠️ No signature found. Please upload one first.");
                return;
              }

              // Re-download the original PDF from Slack
              let pdfBytes: Uint8Array;
              try {
                pdfBytes = await downloadSlackFile(cached.pdf_url);
              } catch {
                await sendSlackMessage(channel, "⚠️ Could not retrieve the original PDF. Please upload it again.");
                return;
              }

              const tempDoc = await PDFDocument.load(pdfBytes);
              const totalPages = tempDoc.getPageCount();

              await sendSlackMessage(channel, "🔄 Adjusting placement...");

              const options = await parseSigningInstruction(text, totalPages);
              if (!options) {
                await sendSlackMessage(channel, '❌ I couldn\'t understand that. Try something like "bigger, top left" or "page 2 bottom center".');
                return;
              }

              try {
                const signedPdf = await signPdf(pdfBytes, signatureData, options);
                const signedFilename = `signed_${cached.file_name}`;

                const posLabel = options.position.replace("-", " ");
                const pageLabel = options.page === totalPages - 1 && totalPages > 1 ? "last page" : `page ${options.page + 1}`;
                const sizeLabel = options.scale;

                await uploadSlackFile(channel, signedPdf, signedFilename, `Signed: ${cached.file_name}`, cached.thread_ts || undefined);
                await sendSlackMessage(channel, `✅ Re-signed — ${sizeLabel} signature, ${posLabel}, ${pageLabel}. Tell me to adjust again or upload a new PDF!`);
              } catch (err) {
                console.error("Re-sign error:", err);
                await sendSlackMessage(channel, "❌ Failed to re-sign. Please try uploading the PDF again.");
              }
            }
          }
        })().catch((err) => console.error("Event processing error:", err));

        // @ts-ignore - Deno Deploy / Supabase Edge Runtime global
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(bgWork);
        }
        return new Response("ok", { headers: corsHeaders });
      }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (err) {
    console.error("Error processing Slack event:", err);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});
