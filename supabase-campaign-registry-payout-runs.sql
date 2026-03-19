-- Campaign registry + payout_runs: run in Supabase Dashboard → SQL Editor
-- Migrates financial data off ephemeral filesystem (Railway) into Supabase.

-- Campaign registry: maps Meta campaign IDs to brands/creators with commission rates
CREATE TABLE IF NOT EXISTS campaign_registry (
  campaign_id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  creator_handle TEXT,
  creator_id TEXT,
  commission NUMERIC DEFAULT 10,
  commission_history JSONB DEFAULT '[]'::jsonb,
  campaign_name TEXT,
  campaign_type TEXT DEFAULT 'always-on',
  meta_ad_account TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaign_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON campaign_registry FOR ALL USING (true) WITH CHECK (true);

-- Payout runs: immutable log of every payout attempt
CREATE TABLE IF NOT EXISTS payout_runs (
  id TEXT PRIMARY KEY DEFAULT 'payout_' || extract(epoch from now())::text,
  period_key TEXT NOT NULL,
  creator_handle TEXT NOT NULL,
  creator_stripe_account TEXT,
  brand_id TEXT,
  campaign_id TEXT,
  ad_spend NUMERIC DEFAULT 0,
  commission_rate NUMERIC DEFAULT 10,
  earnings NUMERIC DEFAULT 0,
  payout_amount NUMERIC DEFAULT 0,
  stripe_transfer_id TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payout_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON payout_runs FOR ALL USING (true) WITH CHECK (true);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_campaign_registry_brand ON campaign_registry(brand_id);
CREATE INDEX IF NOT EXISTS idx_payout_runs_period ON payout_runs(period_key);
CREATE INDEX IF NOT EXISTS idx_payout_runs_creator ON payout_runs(creator_handle);
