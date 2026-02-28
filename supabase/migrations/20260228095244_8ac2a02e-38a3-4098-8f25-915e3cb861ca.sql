CREATE TABLE public.last_signed_pdfs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_user_id TEXT NOT NULL UNIQUE,
  pdf_url TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT 'document.pdf',
  channel TEXT NOT NULL,
  thread_ts TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.last_signed_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.last_signed_pdfs
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_last_signed_pdfs_updated_at
  BEFORE UPDATE ON public.last_signed_pdfs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();