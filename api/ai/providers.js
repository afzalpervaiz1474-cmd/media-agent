import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';
import { SUPPORTED_PROVIDERS, envDefaults } from '../_ai_manager.js';
import { encryptSecret, keyHint } from '../_crypto.js';

// GET  /api/ai/providers          → list configs (never returns key ciphertext)
// POST /api/ai/providers          → create/update  { id?, provider, model?, base_url?, api_key?, is_primary?, allow_fallback?, label? }
// DELETE /api/ai/providers        → { id }
// (Health check + test lives at /api/ai/providers/health)
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method === 'GET') {
      const { data } = await supabase.from('ai_provider_configs').select('id,provider,label,model,base_url,api_key_hint,is_primary,allow_fallback,last_tested_at,last_test_status,last_test_detail,created_at,updated_at').eq('user_id', user.id).order('is_primary', { ascending: false }).order('created_at');
      const envList = envDefaults().map((e) => ({ source: 'env', provider: e.provider, model: e.model, base_url: e.base_url, hint: 'server env' }));
      return res.status(200).json({
        supported: SUPPORTED_PROVIDERS,
        configs: data || [],
        env_defaults: envList,
      });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.provider || !SUPPORTED_PROVIDERS[b.provider]) return res.status(400).json({ error: 'unknown provider' });
      const spec = SUPPORTED_PROVIDERS[b.provider];
      if (spec.needs_key && !b.api_key && !b.id) return res.status(400).json({ error: 'api_key required' });

      const patch = {
        user_id: user.id,
        provider: b.provider,
        label: b.label || spec.name,
        model: b.model || spec.default_model || null,
        base_url: b.base_url || spec.default_base_url || null,
        is_primary: !!b.is_primary,
        allow_fallback: !!b.allow_fallback,
        extra: b.extra || {},
        updated_at: new Date().toISOString(),
      };
      if (b.api_key) {
        patch.api_key_ciphertext = encryptSecret(String(b.api_key));
        patch.api_key_hint = keyHint(String(b.api_key));
      }

      // Only one primary per user
      if (patch.is_primary) {
        await supabase.from('ai_provider_configs').update({ is_primary: false, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      }

      let row;
      if (b.id) {
        const { data, error } = await supabase.from('ai_provider_configs').update(patch).eq('id', b.id).eq('user_id', user.id).select('id,provider,label,model,base_url,api_key_hint,is_primary,allow_fallback').single();
        if (error) throw error;
        row = data;
        await audit(user.id, 'ai_provider.update', { type: 'ai_provider_config', id: b.id, data: { provider: b.provider, has_new_key: !!b.api_key } });
      } else {
        const { data, error } = await supabase.from('ai_provider_configs').insert(patch).select('id,provider,label,model,base_url,api_key_hint,is_primary,allow_fallback').single();
        if (error) throw error;
        row = data;
        await audit(user.id, 'ai_provider.create', { type: 'ai_provider_config', id: row.id, data: { provider: b.provider } });
      }
      return res.status(200).json({ item: row });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('ai_provider_configs').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      await audit(user.id, 'ai_provider.delete', { type: 'ai_provider_config', id });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('ai/providers error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
