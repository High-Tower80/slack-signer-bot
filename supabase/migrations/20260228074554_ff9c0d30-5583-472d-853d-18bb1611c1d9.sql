
-- Create signatures table to map Slack users to their signature images
CREATE TABLE public.signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_user_id TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (edge function uses service role key, so no user-facing policies needed)
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge function uses SUPABASE_SERVICE_ROLE_KEY)
CREATE POLICY "Service role full access" ON public.signatures
  FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for signature images
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', false);

-- Storage policies: allow service role access
CREATE POLICY "Service role can upload signatures" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'signatures');

CREATE POLICY "Service role can read signatures" ON storage.objects
  FOR SELECT USING (bucket_id = 'signatures');

CREATE POLICY "Service role can update signatures" ON storage.objects
  FOR UPDATE USING (bucket_id = 'signatures');

CREATE POLICY "Service role can delete signatures" ON storage.objects
  FOR DELETE USING (bucket_id = 'signatures');

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_signatures_updated_at
  BEFORE UPDATE ON public.signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
