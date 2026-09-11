import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('jobs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return res.status(200).json({ items: data });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('jobs error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
