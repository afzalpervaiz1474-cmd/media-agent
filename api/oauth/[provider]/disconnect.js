import supabase from '../../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../../_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const provider = String(req.query.provider || '').toLowerCase();

    const { data: account } = await supabase.from('connected_accounts').select('id').eq('user_id', user.id).eq('provider', provider).maybeSingle();
    if (!account) return res.status(404).json({ error: 'Not connected' });

    await supabase.from('oauth_tokens').delete().eq('account_id', account.id);
    await supabase.from('connected_accounts').delete().eq('id', account.id);
    await audit(user.id, 'oauth.disconnected', { type: 'connected_account', id: account.id, data: { provider } });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('oauth disconnect error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
