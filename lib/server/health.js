import supabase from './db-client.js';
import { preflight } from './_auth.js';

export async function handler(req, res) {
  if (preflight(req, res)) return;
  const t0 = Date.now();
  let db = 'ok';
  try { await supabase.from('profiles').select('id').limit(1); } catch { db = 'error'; }
  res.status(200).json({
    status: 'ok',
    db,
    latency_ms: Date.now() - t0,
    providers: {
      ai: { openrouter: !!process.env.OPENROUTER_API_KEY, openai: !!process.env.OPENAI_API_KEY },
      youtube: !!process.env.YOUTUBE_CLIENT_ID,
      tiktok: !!process.env.TIKTOK_CLIENT_KEY,
      meta: !!process.env.META_APP_ID,
    },
    time: new Date().toISOString(),
  });
}
