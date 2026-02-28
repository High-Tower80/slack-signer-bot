import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { Image } from "https://esm.sh/imagescript@1.3.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Verify Slack request signature
async function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sigBasestring));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v0=${hex}` === signature;
}

// Download file from Slack
async function downloadSlackFile(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  return new Uint8Array(await res.arrayBuffer());
}

// Send message to Slack
async function sendSlackMessage(channel: string, text: string) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text }),
  });
}

// Upload file to Slack
async function uploadSlackFile(
  channel: string,
  fileData: Uint8Array,
  filename: string,
  title: string
) {
  const uploadRes = await fetch(
    "https://slack.com/api/files.getUploadURLExternal",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        filename,
        length: fileData.length.toString(),
      }),
    }
  );
  const uploadData = await uploadRes.json();
  if (!uploadData.ok) {
    console.error("Failed to get upload URL:", uploadData);
    throw new Error("Failed to get upload URL");
  }

  await fetch(uploadData.upload_url, {
    method: "POST",
    body: fileData,
  });

  const completeRes = await fetch(
    "https://slack.com/api/files.completeUploadExternal",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [{ id: uploadData.file_id, title }],
        channel_id: channel,
      }),
    }
  );
  const completeData = await completeRes.json();
  if (!completeData.ok) {
    console.error("Failed to complete upload:", completeData);
  }
}

// Remove white/light background from signature image, return transparent PNG bytes
async function removeBackground(imageData: Uint8Array): Promise<Uint8Array> {
  const img = await Image.decode(imageData);
  const threshold = 230; // pixels with R,G,B all above this are considered "white"

  for (let x = 1; x <= img.width; x++) {
    for (let y = 1; y <= img.height; y++) {
      const color = img.getPixelAt(x, y);
      const r = (color >> 24) & 0xff;
      const g = (color >> 16) & 0xff;
      const b = (color >> 8) & 0xff;
      if (r >= threshold && g >= threshold && b >= threshold) {
        // Set alpha to 0 (transparent)
        img.setPixelAt(x, y, (r << 24) | (g << 16) | (b << 8) | 0);
      }
    }
  }

  return await img.encode();
}

// Get user's saved signature
async function getSignature(
  slackUserId: string
): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from("signatures")
    .select("storage_path")
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (error || !data) return null;

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("signatures")
    .download(data.storage_path);

  if (downloadError || !fileData) return null;
  return new Uint8Array(await fileData.arrayBuffer());
}

// Save user's signature (with background removal)
async function saveSignature(
  slackUserId: string,
  imageData: Uint8Array,
  mimetype: string
): Promise<boolean> {
  // Remove background and always save as PNG for transparency
  let processedData: Uint8Array;
  try {
    processedData = await removeBackground(imageData);
  } catch (err) {
    console.error("Background removal failed, saving original:", err);
    processedData = imageData;
  }

  const path = `${slackUserId}/signature.png`;

  const { error: uploadError } = await supabase.storage
    .from("signatures")
    .upload(path, processedData, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return false;
  }

  const { error: dbError } = await supabase.from("signatures").upsert(
    {
      slack_user_id: slackUserId,
      storage_path: path,
    },
    { onConflict: "slack_user_id" }
  );

  if (dbError) {
    console.error("DB error:", dbError);
    return false;
  }

  return true;
}

// Publish the Home Tab view for a user
async function publishHomeTab(userId: string) {
  // Check if user has a signature saved
  const { data: sigRecord } = await supabase
    .from("signatures")
    .select("storage_path, updated_at")
    .eq("slack_user_id", userId)
    .maybeSingle();

  const hasSig = !!sigRecord;
  const sigStatus = hasSig
    ? `✅ *Signature saved* (last updated: ${new Date(sigRecord.updated_at).toLocaleDateString()})`
    : "⚠️ *No signature saved yet*";

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "📝 Slack PDF Signature Bot", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Sign PDFs without leaving Slack. Save your signature once, then upload any PDF to get it signed instantly — all in a DM.",
      },
    },
    { type: "divider" },
    {
      type: "header",
      text: { type: "plain_text", text: "Your Signature", emoji: true },
    },
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
    {
      type: "header",
      text: { type: "plain_text", text: "How It Works", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*1. 💬 DM the Bot*\nOpen a direct message with this bot from the sidebar.",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*2. ✍️ Upload Your Signature*\nSend a PNG or JPG image of your signature. The bot removes the background automatically and saves it securely.",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*3. 📄 Upload a PDF*\nSend any PDF document you need signed.",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*4. ✅ Get Your Signed PDF*\nThe bot applies your signature and sends back the signed document in seconds.",
      },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "🔒 Your signature and documents are processed securely. Nothing is shared externally.",
        },
      ],
    },
  ];

  const res = await fetch("https://slack.com/api/views.publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      view: { type: "home", blocks },
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("Failed to publish home tab:", data);
  }
}

// Apply signature to PDF
async function signPdf(
  pdfBytes: Uint8Array,
  signatureBytes: Uint8Array,
  signatureMimetype: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  let sigImage;
  if (signatureMimetype.includes("png")) {
    sigImage = await pdfDoc.embedPng(signatureBytes);
  } else {
    sigImage = await pdfDoc.embedJpg(signatureBytes);
  }

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width: pageWidth, height: pageHeight } = firstPage.getSize();

  const maxWidth = 200;
  const scale = Math.min(maxWidth / sigImage.width, 60 / sigImage.height);
  const sigWidth = sigImage.width * scale;
  const sigHeight = sigImage.height * scale;

  const x = pageWidth - sigWidth - 72;
  const y = 72;

  firstPage.drawImage(sigImage, {
    x,
    y,
    width: sigWidth,
    height: sigHeight,
  });

  return await pdfDoc.save();
}

function isImage(mimetype: string): boolean {
  return mimetype.startsWith("image/");
}

function isPdf(mimetype: string): boolean {
  return mimetype === "application/pdf";
}

// Handle interactive payloads (button clicks etc.)
async function handleInteraction(payload: any) {
  const userId = payload.user?.id;
  const actions = payload.actions || [];

  for (const action of actions) {
    if (action.action_id === "upload_signature_prompt") {
      // Open a DM with the user and send instructions
      const convRes = await fetch("https://slack.com/api/conversations.open", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ users: userId }),
      });
      const convData = await convRes.json();
      if (convData.ok) {
        await sendSlackMessage(
          convData.channel.id,
          "📤 Send me your signature image here! Upload a PNG or JPG file of your signature and I'll save it (with background automatically removed)."
        );
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    const timestamp = req.headers.get("x-slack-request-timestamp") || "";
    const slackSignature = req.headers.get("x-slack-signature") || "";
    const contentType = req.headers.get("content-type") || "";

    // Handle interactive payloads (URL-encoded form data from button clicks)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(bodyText);
      const payloadStr = params.get("payload");
      if (payloadStr) {
        const interactionPayload = JSON.parse(payloadStr);
        await handleInteraction(interactionPayload);
        return new Response("", { headers: corsHeaders });
      }
    }

    const payload = JSON.parse(bodyText);

    // Handle Slack URL verification challenge
    if (payload.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Slack signature
    const valid = await verifySlackSignature(bodyText, timestamp, slackSignature);
    if (!valid) {
      console.error("Invalid Slack signature");
      return new Response("Unauthorized", { status: 401 });
    }

    // Handle event callbacks
    if (payload.type === "event_callback") {
      const event = payload.event;

      // Handle Home Tab opened
      if (event.type === "app_home_opened" && event.tab === "home") {
        await publishHomeTab(event.user);
        return new Response("ok", { headers: corsHeaders });
      }

      // Ignore bot messages
      if (event.bot_id || event.subtype === "bot_message") {
        return new Response("ok", { headers: corsHeaders });
      }

      // Handle messages with files
      if (event.type === "message" && event.files && event.files.length > 0) {
        const channel = event.channel;
        const userId = event.user;

        for (const file of event.files) {
          const mimetype = file.mimetype || "";

          if (isImage(mimetype)) {
            const existingSig = await getSignature(userId);
            const fileData = await downloadSlackFile(file.url_private);
            const saved = await saveSignature(userId, fileData, mimetype);
            if (saved) {
              const msg = existingSig
                ? "✅ Signature updated! Background removed and your new signature will be used for future PDFs."
                : "✅ Signature saved with background removed! Upload a PDF anytime to sign it.";
              await sendSlackMessage(channel, msg);
              // Refresh the Home Tab
              await publishHomeTab(userId);
            } else {
              await sendSlackMessage(
                channel,
                "❌ Failed to save signature. Please try again."
              );
            }
          } else if (isPdf(mimetype)) {
            const signatureData = await getSignature(userId);
            if (!signatureData) {
              await sendSlackMessage(
                channel,
                "⚠️ Please send me your signature image first! Upload a PNG or JPG of your signature."
              );
              continue;
            }

            // Signatures are now always stored as PNG
            const sigMimetype = "image/png";

            try {
              const pdfData = await downloadSlackFile(file.url_private);
              const signedPdf = await signPdf(pdfData, signatureData, sigMimetype);
              const signedFilename = `signed_${file.name || "document.pdf"}`;
              await uploadSlackFile(
                channel,
                signedPdf,
                signedFilename,
                `Signed: ${file.title || file.name || "document.pdf"}`
              );
            } catch (err) {
              console.error("PDF signing error:", err);
              await sendSlackMessage(
                channel,
                `❌ Failed to sign "${file.name || "PDF"}". Please make sure it's a valid PDF file.`
              );
            }
          } else {
            await sendSlackMessage(
              channel,
              "I can only process image files (for signatures) and PDF files (for signing). Please upload a PNG/JPG signature or a PDF to sign."
            );
          }
        }
      }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (err) {
    console.error("Error processing Slack event:", err);
    return new Response("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
