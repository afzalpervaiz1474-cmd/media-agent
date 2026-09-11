import supabase from '../../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../../_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const id = req.query.id;

    const { data: job } = await supabase.from('jobs').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!job) return res.status(404).json({ error: 'Not found' });
    if (['COMPLETED','CANCELLED'].includes(job.status)) return res.status(400).json({ error: `Cannot cancel a ${job.status} job` });

    const { data: updated } = await supabase.from('jobs').update({ status: 'CANCELLED', finished_at: new Date().toISOString() }).eq('id', id).select('*').single();
    await supabase.from('job_events').insert({ job_id: id, level: 'warn', message: 'Cancelled by user.' });
    await audit(user.id, 'job.cancel', { type: 'job', id });
    res.status(200).json({ job: updated });
  } catch (err) {
    console.error('cancel error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
