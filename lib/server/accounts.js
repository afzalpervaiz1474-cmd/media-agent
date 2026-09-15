import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError } from './_auth.js';
import { PROVIDER_META, providerConfigStatus } from './_providers.js';

export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const cfg = providerConfigStatus();

    if (req.method === 'GET') {
      const { data: rows } = await supabase.from('connected_accounts').select('*').eq('user_id', user.id);
      const byProvider = {};
      for (const r of rows || []) { if (!byProvider[r.provider]) byProvider[r.provider] = r; }
      const providers = {};
      for (const p of Object.keys(PROVIDER_META)) {
        const account = byProvider[p] || null;
        // Do NOT leak token values into API responses. Only surface presence + expiry.
        let tokenHealth = null;
        if (account) {
          const { data: tok } = await supabase.from('oauth_tokens').select('id,expires_at,scope,updated_at').eq('account_id', account.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (tok) {
            const expired = tok.expires_at ? new Date(tok.expires_at).getTime() < Date.now() : false;
            tokenHealth = { has_token: true, expires_at: tok.expires_at, scope: tok.scope, expired };
          } else {
            tokenHealth = { has_token: false };
          }
        }
        providers[p] = { ...cfg[p], meta: PROVIDER_META[p], account, tokenHealth };
      }
      return res.status(200).json({ providers });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: acct } = await supabase.from('connected_accounts').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!acct) return res.status(404).json({ error: 'Not found' });
      await supabase.from('oauth_tokens').delete().eq('account_id', id);
      await supabase.from('connected_accounts').delete().eq('id', id);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('accounts error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
