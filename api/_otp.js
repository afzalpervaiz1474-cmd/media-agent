import crypto from 'node:crypto';
import supabase from './db-client.js';
import { safeError } from './_safe.js';

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const RATE_LIMIT_MS = 60 * 1000;
const RATE_LIMIT_MAX = 3;

const otpRequests = new Map();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function ensureOtpTable() {
  try {
    const { data } = await supabase.from('otp_verifications').select('id').limit(1);
    if (data !== undefined) return;
  } catch { /* table doesn't exist */ }
  try {
    const ref = SUPABASE_URL.match(/^(?:https?:\/\/)?([a-zA-Z0-9-]+)\.supabase\.(?:co|db)/)?.[1];
    if (!ref || !SUPABASE_URL || !SUPABASE_KEY) return;
    await fetch(`https://api.supabase.com/v1/projects/${ref}/sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({
        query: `CREATE TABLE IF NOT EXISTS otp_verifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, account_id UUID REFERENCES connected_accounts(id) ON DELETE CASCADE, provider TEXT NOT NULL, email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TIMESTAMP WITH TIME ZONE NOT NULL, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()); ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY; CREATE POLICY IF NOT EXISTS "Users can read their own OTP" ON otp_verifications FOR SELECT USING (auth.uid() = user_id); CREATE POLICY IF NOT EXISTS "Users can update their own OTP" ON otp_verifications FOR UPDATE USING (auth.uid() = user_id); CREATE INDEX IF NOT EXISTS idx_otp_user_provider ON otp_verifications(user_id, provider, used); CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);`
      })
    });
  } catch { /* ignore management API errors */ }
}

export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(OTP_LENGTH, '0');
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function verifyCode(code, hash) {
  return hashCode(code) === hash;
}

export function now() {
  return new Date().toISOString();
}

export async function rateLimitOk(userId, provider) {
  const key = `${userId}:${provider}`;
  const now = Date.now();
  const requests = otpRequests.get(key) || [];
  const recent = requests.filter((t) => now - t < RATE_LIMIT_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  otpRequests.set(key, recent);
  return true;
}

export function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, reqs] of otpRequests) {
    const filtered = reqs.filter((t) => now - t < RATE_LIMIT_MS);
    if (filtered.length === 0) otpRequests.delete(key);
    else otpRequests.set(key, filtered);
  }
}

setInterval(cleanupRateLimit, 30_000);
ensureOtpTable();

export async function requestOtp(userId, provider, accountId, email) {
  const ok = await rateLimitOk(userId, provider);
  if (!ok) throw new Error('Too many OTP requests. Please wait a moment.');

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from('otp_verifications')
    .insert({
      user_id: userId,
      account_id: accountId,
      provider,
      email,
      code_hash: codeHash,
      expires_at: expiresAt,
      used: false,
      created_at: now(),
      updated_at: now(),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to store OTP: ${safeError(error)}`);
  return { id: data.id, code, expiresAt };
}

export async function verifyOtp(code, otpId) {
  const { data: otp, error: fetchErr } = await supabase
    .from('otp_verifications')
    .select('*')
    .eq('id', otpId)
    .maybeSingle();

  if (fetchErr || !otp) throw new Error('OTP record not found');
  if (otp.used) throw new Error('OTP already used');
  if (new Date(otp.expires_at).getTime() < Date.now()) throw new Error('OTP expired');

  const valid = await verifyCode(code, otp.code_hash);
  if (!valid) throw new Error('Invalid verification code');

  const { error: updateErr } = await supabase
    .from('otp_verifications')
    .update({ used: true, used_at: now(), updated_at: now() })
    .eq('id', otpId);

  if (updateErr) throw new Error(`Failed to mark OTP as used: ${safeError(updateErr)}`);
  return { verified: true };
}

export async function resendOtp(userId, provider, accountId, email, oldOtpId) {
  if (oldOtpId) {
    await supabase
      .from('otp_verifications')
      .update({ used: true, updated_at: now() })
      .eq('id', oldOtpId)
      .eq('user_id', userId);
  }
  return requestOtp(userId, provider, accountId, email);
}

export async function hasPendingOtp(userId, provider, accountId) {
  const { data: otp } = await supabase
    .from('otp_verifications')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('account_id', accountId)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp) return null;
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    await supabase.from('otp_verifications').update({ used: true }).eq('id', otp.id);
    return null;
  }
  return otp;
}
