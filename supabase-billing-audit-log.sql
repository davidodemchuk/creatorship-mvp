-- Billing audit trail: run in Supabase Dashboard → SQL Editor
CREATE TABLE IF NOT EXISTS billing_audit_log (
  id BIGSERIAL PRIMARY KEY,
  brand_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE billing_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON billing_audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_audit_brand ON billing_audit_log(brand_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON billing_audit_log(event_type);
