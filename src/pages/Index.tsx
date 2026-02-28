import { FileText, Upload, PenTool, CheckCircle, MessageSquare, Zap, Shield, RefreshCw, MousePointerClick, Move, Brain, ImageOff, Wrench } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    icon: <MessageSquare className="h-8 w-8" />,
    title: "1. DM the Bot",
    description: "Open a direct message with the Signature Bot in Slack. Find it in your workspace's app list or search for it in the sidebar.",
  },
  {
    icon: <PenTool className="h-8 w-8" />,
    title: "2. Upload Your Signature",
    description: "Send a PNG or JPG image of your signature. The bot automatically removes the background, making it transparent for clean overlays on any document.",
  },
  {
    icon: <Upload className="h-8 w-8" />,
    title: "3. Upload a PDF",
    description: "Drag and drop any PDF document into the DM — or use the 3-dot menu shortcut on any message with a PDF attachment.",
  },
  {
    icon: <CheckCircle className="h-8 w-8" />,
    title: "4. Get Your Signed PDF",
    description: "Within seconds, the bot replies with your signed PDF. Need it different? Just tell the bot — \"make it bigger\", \"page 2 bottom left\", \"try again smaller\".",
  },
];

const features = [
  {
    icon: <Zap className="h-6 w-6" />,
    title: "Instant Signing",
    description: "PDFs are processed and returned in seconds. No waiting, no queues.",
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: "Secure & Private",
    description: "Your signature and documents stay within your Slack workspace. Nothing is shared externally.",
  },
  {
    icon: <RefreshCw className="h-6 w-6" />,
    title: "Update Anytime",
    description: "Changed your signature? Simply send a new image and the bot replaces the old one instantly.",
  },
  {
    icon: <ImageOff className="h-6 w-6" />,
    title: "Auto Background Removal",
    description: "The bot automatically removes white/light backgrounds from your signature image, giving you a clean transparent overlay.",
  },
  {
    icon: <MousePointerClick className="h-6 w-6" />,
    title: "3-Dot Menu Shortcut",
    description: "See a PDF in any channel? Click the ⋮ menu → \"Sign PDF\" and the bot signs it right there in the thread.",
  },
  {
    icon: <Brain className="h-6 w-6" />,
    title: "AI-Powered Adjustments",
    description: "Tell the bot where to place your signature using plain English — \"bigger\", \"page 3 top center\", \"try again bottom left\".",
  },
  {
    icon: <Move className="h-6 w-6" />,
    title: "Flexible Placement",
    description: "Choose from 7 positions (top/bottom × left/center/right + center) across any page, with 4 size options from small to extra large.",
  },
];

const gettingStartedSteps = [
  {
    step: "1",
    title: "Install the Bot",
    description: "An admin in your Slack workspace needs to install the Signature Bot app. Once installed, it's available to everyone in the workspace.",
  },
  {
    step: "2",
    title: "Open a DM",
    description: "Navigate to the Apps section in your Slack sidebar and click on Signature Bot to open a direct message conversation.",
  },
  {
    step: "3",
    title: "Save Your Signature",
    description: "Take a photo of your signature on white paper, or use any drawing tool to create a digital signature. Save it as a PNG or JPG file, then send it to the bot. The background is removed automatically and you'll see: \"✅ Signature saved!\"",
  },
  {
    step: "4",
    title: "Sign Your First PDF",
    description: "Upload any PDF document to the DM. The bot will process it, apply your signature, and send back the signed version within seconds.",
  },
  {
    step: "5",
    title: "Adjust If Needed",
    description: "Not happy with the placement? Just reply with natural language instructions like \"make it bigger\", \"move to top left\", or \"page 2 bottom center\". The bot re-signs instantly.",
  },
  {
    step: "6",
    title: "Use the Shortcut",
    description: "See a PDF in any Slack channel? Click the ⋮ (three dots) on the message → More message shortcuts → \"Sign PDF\". The signed version appears as a threaded reply.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <header className="flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <FileText className="h-10 w-10" />
        </div>
        <h1 className="mb-4 text-5xl font-bold tracking-tight">
          Slack PDF Signature Bot
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
          Signing PDFs shouldn't mean leaving Slack, downloading files, opening another app, and re-uploading. For teams that live in Slack — sales, legal, HR, ops — this bot eliminates the friction. Save your signature once, drop in a PDF, and get it back signed in seconds. All without switching a single tab.
        </p>
      </header>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <h2 className="mb-12 text-center text-3xl font-semibold">
          How It Works
        </h2>
        <div className="grid gap-8 sm:grid-cols-2">
          {steps.map((step) => (
            <div
              key={step.title}
              className="rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="mb-4 text-primary">{step.icon}</div>
              <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-12 text-center text-3xl font-semibold">
            Why Use Signature Bot?
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-4">
                <div className="mt-1 text-primary">{feature.icon}</div>
                <div>
                  <h3 className="mb-1 font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Getting Started */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="mb-4 text-center text-3xl font-semibold">
          Getting Started
        </h2>
        <p className="mb-12 text-center text-muted-foreground">
          Follow these steps to start signing PDFs in under two minutes.
        </p>
        <div className="space-y-8">
          {gettingStartedSteps.map((item) => (
            <div key={item.step} className="flex gap-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                {item.step}
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="mb-12 text-center text-3xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 font-semibold">What file formats are supported for signatures?</h3>
              <p className="text-muted-foreground">PNG and JPG images. The bot automatically removes white/light backgrounds for a clean transparent signature.</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Can I update my signature?</h3>
              <p className="text-muted-foreground">Yes! Simply send a new signature image to the bot and it will automatically replace the previous one. You can also use the "Update Signature" button in the bot's Home Tab.</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Where does the signature get placed on the PDF?</h3>
              <p className="text-muted-foreground">By default, the signature is placed at the bottom-right of the first page. You can adjust this by replying with instructions like "top left", "page 2 center", or "make it bigger".</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Can I sign a PDF from any Slack channel?</h3>
              <p className="text-muted-foreground">Yes! Click the ⋮ (three dots) on any message with a PDF attachment, select "More message shortcuts", then "Sign PDF". The signed version appears as a threaded reply.</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">What if I want the signature in a different spot or size?</h3>
              <p className="text-muted-foreground">Just reply with natural language — "make it bigger", "page 3 bottom left", "try again smaller, top center". The bot uses AI to understand your intent and re-signs the document instantly.</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Is my data secure?</h3>
              <p className="text-muted-foreground">Absolutely. Your signature image and documents are processed securely and stored within the bot's private infrastructure. They are never shared with third parties.</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Can multiple people in my workspace use the bot?</h3>
              <p className="text-muted-foreground">Yes — each user saves their own signature independently. The bot keeps signatures separate per user.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground space-y-2">
        <p>Slack PDF Signature Bot &middot; All signing happens securely in your Slack workspace.</p>
        <p>
          <Link to="/setup" className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <Wrench className="h-3.5 w-3.5" />
            Self-host setup guide
          </Link>
        </p>
      </footer>
    </div>
  );
};

export default Index;