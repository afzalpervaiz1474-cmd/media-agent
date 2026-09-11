import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const id = req.query.id;

    if (req.method === 'DELETE') {
      const { data: existing } = await supabase.from('media_assets').select('storage_path').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (existing?.storage_path) {
        try { await supabase.storage.from('media').remove([existing.storage_path]); } catch { /* soft */ }
      }
      const { error } = await supabase.from('media_assets').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      await audit(user.id, 'media.delete', { type: 'media', id });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('media/[id] error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
