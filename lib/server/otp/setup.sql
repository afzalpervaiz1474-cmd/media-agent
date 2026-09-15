-- Create otp_verifications table for email verification before publishing
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  account_id UUID REFERENCES connected_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own OTP records" ON otp_verifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own OTP records" ON otp_verifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_otp_user_provider ON otp_verifications(user_id, provider, used);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);
