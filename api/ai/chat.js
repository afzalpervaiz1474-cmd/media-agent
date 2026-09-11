import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError } from '../_auth.js';
import { isConfiguredFor } from '../_ai.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method === 'GET') {
      const { data } = await supabase.from('ai_conversations').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
      return res.status(200).json({ items: data || [], configured: await isConfiguredFor(user.id) });
    }
    if (req.method === 'POST') {
      const { title = 'New chat' } = req.body || {};
      const { data, error } = await supabase.from('ai_conversations').insert({ user_id: user.id, title }).select('*').single();
      if (error) throw error;
      return res.status(201).json({ item: data });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('ai/chat error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
