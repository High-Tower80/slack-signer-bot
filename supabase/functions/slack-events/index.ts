import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

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
  // Step 1: Get upload URL
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

  // Step 2: Upload the file
  await fetch(uploadData.upload_url, {
    method: "POST",
    body: fileData,
  });

  // Step 3: Complete the upload
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

// Save user's signature
async function saveSignature(
  slackUserId: string,
  imageData: Uint8Array,
  mimetype: string
): Promise<boolean> {
  const ext = mimetype.includes("png") ? "png" : "jpg";
  const path = `${slackUserId}/signature.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("signatures")
    .upload(path, imageData, {
      contentType: mimetype,
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

  // Scale signature to reasonable size (max 200px wide, proportional)
  const maxWidth = 200;
  const scale = Math.min(maxWidth / sigImage.width, 60 / sigImage.height);
  const sigWidth = sigImage.width * scale;
  const sigHeight = sigImage.height * scale;

  // Try to find "Signature" text position by scanning - fallback to bottom of page
  // For now, place at bottom-right of first page with some margin
  const x = pageWidth - sigWidth - 72; // 1 inch from right
  const y = 72; // 1 inch from bottom

  firstPage.drawImage(sigImage, {
    x,
    y,
    width: sigWidth,
    height: sigHeight,
  });

  return await pdfDoc.save();
}

// Determine file type
function isImage(mimetype: string): boolean {
  return mimetype.startsWith("image/");
}

function isPdf(mimetype: string): boolean {
  return mimetype === "application/pdf";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    const timestamp = req.headers.get("x-slack-request-timestamp") || "";
    const slackSignature = req.headers.get("x-slack-signature") || "";

    // Verify signature (skip for url_verification)
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

      // Ignore bot messages to prevent loops
      if (event.bot_id || event.subtype === "bot_message") {
        return new Response("ok", { headers: corsHeaders });
      }

      // Only handle messages with files
      if (event.type === "message" && event.files && event.files.length > 0) {
        const channel = event.channel;
        const userId = event.user;

        for (const file of event.files) {
          const mimetype = file.mimetype || "";

          if (isImage(mimetype)) {
            // Check if user already has a signature
            const existingSig = await getSignature(userId);
            const fileData = await downloadSlackFile(file.url_private);
            const saved = await saveSignature(userId, fileData, mimetype);
            if (saved) {
              const msg = existingSig
                ? "✅ Signature updated! Your new signature will be used for future PDFs."
                : "✅ Signature saved! Upload a PDF anytime to sign it.";
              await sendSlackMessage(channel, msg);
            } else {
              await sendSlackMessage(
                channel,
                "❌ Failed to save signature. Please try again."
              );
            }
          } else if (isPdf(mimetype)) {
            // Sign the PDF
            const signatureData = await getSignature(userId);
            if (!signatureData) {
              await sendSlackMessage(
                channel,
                "⚠️ Please send me your signature image first! Upload a PNG or JPG of your signature."
              );
              continue;
            }

            // Get signature mimetype from storage path
            const { data: sigRecord } = await supabase
              .from("signatures")
              .select("storage_path")
              .eq("slack_user_id", userId)
              .single();

            const sigMimetype = sigRecord?.storage_path?.endsWith(".png")
              ? "image/png"
              : "image/jpeg";

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
