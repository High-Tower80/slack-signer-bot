import { FileText, ArrowLeft, Copy, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

const CopyBlock = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-relaxed">
        <code>{text}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Copy to clipboard"
      >
        {copied ? <CheckCircle className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
};

const sections = [
  {
    step: "1",
    title: "Create a Slack App",
    content: (
      <>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>
            Go to{" "}
            <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              api.slack.com/apps
            </a>{" "}
            and click <strong>Create New App</strong> → <strong>From scratch</strong>.
          </li>
          <li>Name it something like <strong>"Signature Bot"</strong> and pick your workspace.</li>
        </ol>
      </>
    ),
  },
  {
    step: "2",
    title: "Configure Bot Scopes (Permissions)",
    content: (
      <>
        <p className="text-muted-foreground mb-3">
          Go to <strong>OAuth & Permissions</strong> → <strong>Bot Token Scopes</strong> and add these scopes:
        </p>
        <CopyBlock
          text={`chat:write
files:read
files:write
im:history
im:read
im:write
users:read`}
        />
        <p className="mt-3 text-muted-foreground">
          Then click <strong>Install to Workspace</strong> and authorize the app. Copy the <strong>Bot User OAuth Token</strong> (starts with <code className="bg-muted px-1 rounded">xoxb-</code>).
        </p>
      </>
    ),
  },
  {
    step: "3",
    title: "Deploy the Edge Function",
    content: (
      <>
        <p className="text-muted-foreground mb-3">
          After remixing this project, the edge function at{" "}
          <code className="bg-muted px-1 rounded">supabase/functions/slack-events/index.ts</code>{" "}
          deploys automatically. Your edge function URL will be:
        </p>
        <CopyBlock text="https://<your-project-id>.supabase.co/functions/v1/slack-events" />
        <p className="mt-3 text-muted-foreground">
          Replace <code className="bg-muted px-1 rounded">&lt;your-project-id&gt;</code> with your actual project ID (visible in your Lovable Cloud settings).
        </p>
      </>
    ),
  },
  {
    step: "4",
    title: "Set Up Event Subscriptions",
    content: (
      <>
        <p className="text-muted-foreground mb-3">
          In your Slack app settings, go to <strong>Event Subscriptions</strong>:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Toggle <strong>Enable Events</strong> to On.</li>
          <li>Paste your edge function URL as the <strong>Request URL</strong>. Slack will send a verification challenge — the function handles it automatically.</li>
          <li>
            Under <strong>Subscribe to bot events</strong>, add:
            <CopyBlock text={`message.im\napp_home_opened`} />
          </li>
        </ol>
      </>
    ),
  },
  {
    step: "5",
    title: "Enable Interactivity & Shortcuts",
    content: (
      <>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Go to <strong>Interactivity & Shortcuts</strong> and toggle it On.</li>
          <li>Set the <strong>Request URL</strong> to the same edge function URL.</li>
          <li>
            Under <strong>Shortcuts</strong>, click <strong>Create New Shortcut</strong>:
            <ul className="list-disc list-inside ml-5 mt-1 space-y-1">
              <li>Type: <strong>On messages</strong></li>
              <li>Name: <strong>Sign PDF</strong></li>
              <li>Callback ID: <code className="bg-muted px-1 rounded">sign_pdf</code></li>
            </ul>
          </li>
        </ol>
      </>
    ),
  },
  {
    step: "6",
    title: "Enable the Messages Tab",
    content: (
      <>
        <p className="text-muted-foreground">
          Go to <strong>App Home</strong> → check <strong>"Allow users to send Slash commands and messages from the messages tab"</strong>. This lets users DM the bot.
        </p>
      </>
    ),
  },
  {
    step: "7",
    title: "Configure Secrets",
    content: (
      <>
        <p className="text-muted-foreground mb-3">
          In your Lovable project, go to <strong>Cloud → Secrets</strong> and add these:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-border text-foreground">
              <tr>
                <th className="py-2 pr-4 font-semibold">Secret Name</th>
                <th className="py-2 font-semibold">Where to Find It</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4"><code className="bg-muted px-1 rounded">SLACK_BOT_TOKEN</code></td>
                <td className="py-2">Slack app → OAuth & Permissions → Bot User OAuth Token</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><code className="bg-muted px-1 rounded">SLACK_SIGNING_SECRET</code></td>
                <td className="py-2">Slack app → Basic Information → Signing Secret</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    step: "8",
    title: "Create the Database Tables",
    content: (
      <>
        <p className="text-muted-foreground mb-3">
          The project needs two tables. Run this SQL migration in your Lovable Cloud database:
        </p>
        <CopyBlock
          text={`-- Signatures table
CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_user_id TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Last signed PDFs table (for adjustment commands)
CREATE TABLE IF NOT EXISTS public.last_signed_pdfs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_user_id TEXT NOT NULL UNIQUE,
  pdf_url TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  thread_ts TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_signatures_updated_at
  BEFORE UPDATE ON public.signatures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_last_signed_pdfs_updated_at
  BEFORE UPDATE ON public.last_signed_pdfs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`}
        />
      </>
    ),
  },
  {
    step: "9",
    title: "Create a Storage Bucket",
    content: (
      <>
        <p className="text-muted-foreground mb-3">
          Create a private storage bucket named <code className="bg-muted px-1 rounded">signatures</code> to store user signature images. This can be done through the Lovable Cloud Storage UI.
        </p>
      </>
    ),
  },
  {
    step: "10",
    title: "Test It!",
    content: (
      <>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Open Slack and find the bot in your Apps list.</li>
          <li>DM it a PNG or JPG of your signature.</li>
          <li>Upload a PDF — you should get it back signed in seconds.</li>
          <li>Reply with "make it bigger" or "page 2 top left" to adjust.</li>
          <li>Try the ⋮ → Sign PDF shortcut on any PDF in a channel (make sure the bot is invited to that channel first).</li>
        </ol>
      </>
    ),
  },
];

const Setup = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-semibold">Setup Guide</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          Self-Host Setup Guide
        </h1>
        <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
          Remix this project on Lovable and follow these steps to get your own Slack PDF Signature Bot running. No private keys or secrets are stored in the codebase — everything sensitive goes into Lovable Cloud secrets.
        </p>
        <p className="text-muted-foreground mb-12">
          <a href="https://github.com/High-Tower80/slack-signer-bot" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
            View source on GitHub →
          </a>
        </p>

        <div className="space-y-10">
          {sections.map((section) => (
            <div key={section.step} className="flex gap-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                {section.step}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
                {section.content}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-xl border border-border bg-muted/30 p-6">
          <h2 className="font-semibold mb-2">💡 Notes</h2>
          <ul className="list-disc list-inside space-y-1.5 text-muted-foreground text-sm">
            <li>The bot must be <strong>invited to a channel</strong> to use the "Sign PDF" message shortcut there (<code className="bg-muted px-1 rounded">/invite @BotName</code>).</li>
            <li>DM signing works immediately — no invitation needed.</li>
            <li>Each user's signature is stored separately. Multiple people can use the same bot.</li>
            <li>The bot uses AI (via Lovable AI) to understand placement instructions — you'll need a <code className="bg-muted px-1 rounded">LOVABLE_API_KEY</code> secret as well if you want adjustment commands to work.</li>
          </ul>
        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <Link to="/" className="text-primary hover:underline">← Back to landing page</Link>
      </footer>
    </div>
  );
};

export default Setup;
