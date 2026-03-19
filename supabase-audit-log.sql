-- Run in Supabase SQL editor to create audit_log for destructive/critical action logging
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  brand_id TEXT,
  details JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Optional: allow service role to insert (server uses SUPABASE_SERVICE_KEY)
-- With RLS enabled and no policies, only service role can access by default in Supabase.
