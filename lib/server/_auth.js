import { createClient } from '@supabase/supabase-js';
import supabase from './db-client.js';
export { safeError } from './_safe.js';

export function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

export function preflight(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

export async function getUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return { user: null, token: null };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { user: null, token };
  return { user: data.user, token };
}

export function requireUser(user, res) {
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

export function scoped(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
  );
}



export async function audit(userId, action, target = {}) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId || null,
      action,
      target_type: target.type || null,
      target_id: target.id || null,
      data: target.data || {},
    });
  } catch { /* soft */ }
}
