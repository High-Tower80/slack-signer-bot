CREATE TABLE public.pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  thread_ts text NOT NULL,
  bot_msg_ts text,
  signer_id text NOT NULL,
  file_names text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_reminded_at timestamptz,
  approved_at timestamptz,
  UNIQUE (channel, thread_ts)
);
GRANT ALL ON public.pending_approvals TO service_role;
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access" ON public.pending_approvals FOR ALL USING (false) WITH CHECK (false);