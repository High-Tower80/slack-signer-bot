import { FileText, Upload, PenTool, CheckCircle, MessageSquare } from "lucide-react";

const steps = [
  {
    icon: <MessageSquare className="h-8 w-8" />,
    title: "1. DM the Bot",
    description: "Open a direct message with the Signature Bot in Slack.",
  },
  {
    icon: <PenTool className="h-8 w-8" />,
    title: "2. Upload Your Signature",
    description: "Send a PNG or JPG image of your signature. The bot saves it for you.",
  },
  {
    icon: <Upload className="h-8 w-8" />,
    title: "3. Upload a PDF",
    description: "Send any PDF document you need signed.",
  },
  {
    icon: <CheckCircle className="h-8 w-8" />,
    title: "4. Get Your Signed PDF",
    description: "The bot applies your signature and sends back the signed document.",
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
        <p className="max-w-xl text-lg text-muted-foreground">
          Sign PDFs without leaving Slack. Save your signature once, then upload
          any PDF to get it signed instantly — all in a DM.
        </p>
      </header>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
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

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Slack PDF Signature Bot &middot; All signing happens securely in your Slack workspace.
      </footer>
    </div>
  );
};

export default Index;
