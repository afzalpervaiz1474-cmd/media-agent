import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError } from '../_auth.js';

export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const id = req.query.id;

    if (req.method === 'GET') {
      const [{ data: job }, { data: events }] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
        supabase.from('job_events').select('*').eq('job_id', id).order('created_at'),
      ]);
      if (!job) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ job, events: events || [] });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('jobs/[id] error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
