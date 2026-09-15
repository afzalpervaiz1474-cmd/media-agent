import supabase from '../../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../../_auth.js';
import { runJob } from '../../_jobs.js';

export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const id = req.query.id;
    const { data: job } = await supabase.from('jobs').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!job) return res.status(404).json({ error: 'Not found' });
    if (!['QUEUED','SCHEDULED','PROCESSING'].includes(job.status)) return res.status(400).json({ error: `Cannot run in state ${job.status}` });
    await audit(user.id, 'job.run', { type: 'job', id });
    const finalJob = await runJob(id).catch((e) => e);
    res.status(200).json({ job: finalJob?.id ? finalJob : job });
  } catch (err) {
    console.error('run error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
