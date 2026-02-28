
-- Drop the overly permissive policies on both tables
DROP POLICY IF EXISTS "Service role full access" ON public.last_signed_pdfs;
DROP POLICY IF EXISTS "Service role full access" ON public.signatures;

-- Add deny-all policies (service role bypasses RLS, so the edge function still works)
CREATE POLICY "Deny all access" ON public.last_signed_pdfs FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "Deny all access" ON public.signatures FOR ALL USING (false) WITH CHECK (false);
