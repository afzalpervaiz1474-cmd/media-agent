import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError } from '../_auth.js';

// GET /api/ai/usage → recent AI usage events + aggregates for the user.
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const { data: events } = await supabase.from('ai_usage_events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);

    const agg = { total_requests: 0, ok: 0, errors: 0, total_tokens: 0, by_provider: {}, by_model: {} };
    for (const e of events || []) {
      agg.total_requests += 1;
      if (e.status === 'ok') agg.ok += 1; else agg.errors += 1;
      if (e.total_tokens) agg.total_tokens += e.total_tokens;
      const bp = agg.by_provider[e.provider] || { requests: 0, tokens: 0, errors: 0 };
      bp.requests += 1; if (e.total_tokens) bp.tokens += e.total_tokens; if (e.status !== 'ok') bp.errors += 1;
      agg.by_provider[e.provider] = bp;
      const bm = agg.by_model[e.model || '(default)'] || { requests: 0, tokens: 0 };
      bm.requests += 1; if (e.total_tokens) bm.tokens += e.total_tokens;
      agg.by_model[e.model || '(default)'] = bm;
    }

    res.status(200).json({ events: events || [], aggregate: agg });
  } catch (err) {
    console.error('ai/usage error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
