import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method === 'GET') {
      const unread = req.query.unread === '1';
      let q = supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
      if (unread) q = q.is('read_at', null);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ items: data });
    }
    if (req.method === 'POST') {
      const { action } = req.body || {};
      if (action === 'mark_all_read') {
        await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'unknown action' });
    }
    if (req.method === 'PUT') {
      const { id, read } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const patch = { read_at: read ? new Date().toISOString() : null };
      const { error } = await supabase.from('notifications').update(patch).eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('notifications error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
