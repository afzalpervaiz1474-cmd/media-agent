import supabase from '../../db-client.js';
import { preflight, getUser, requireUser, safeError } from '../../_auth.js';
import { SUPPORTED_PROVIDERS, healthCheckCandidate } from '../../_ai_manager.js';
import { decryptSecret } from '../../_crypto.js';

// POST /api/ai/providers/health
// Body: { id }  → test a stored config
//    or { provider, api_key, model?, base_url? } → test an ad-hoc/candidate config
// Never returns the API key. Persists the result on the row when id is provided.
export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const b = req.body || {};
    let provider, model, base_url, apiKey, id = null;

    if (b.id) {
      const { data } = await supabase.from('ai_provider_configs').select('*').eq('id', b.id).eq('user_id', user.id).maybeSingle();
      if (!data) return res.status(404).json({ error: 'config not found' });
      id = data.id; provider = data.provider; model = data.model; base_url = data.base_url;
      apiKey = data.api_key_ciphertext ? decryptSecret(data.api_key_ciphertext) : null;
    } else {
      provider = b.provider; model = b.model; base_url = b.base_url; apiKey = b.api_key || null;
      if (!provider || !SUPPORTED_PROVIDERS[provider]) return res.status(400).json({ error: 'unknown provider' });
    }

    const result = await healthCheckCandidate({ provider, model, base_url, apiKey });

    if (id) {
      const primary = result.checks.find((c) => c.id === 'probe') || result.checks[result.checks.length - 1];
      await supabase.from('ai_provider_configs').update({
        last_tested_at: new Date().toISOString(),
        last_test_status: result.overall,
        last_test_detail: primary?.detail?.slice(0, 240) || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('user_id', user.id);
    }

    res.status(200).json({ result });
  } catch (err) {
    console.error('ai/providers/health error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
