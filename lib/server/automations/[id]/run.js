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

    const { data: a } = await supabase.from('automations').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!a) return res.status(404).json({ error: 'Automation not found' });

    const { data: steps } = await supabase.from('automation_steps').select('*').eq('automation_id', id).order('position');

    const { data: job, error } = await supabase.from('jobs').insert({
      user_id: user.id, automation_id: id,
      kind: `automation.${a.name.toLowerCase().replace(/\s+/g, '_').slice(0, 40)}`,
      status: 'PROCESSING',
      progress: 0,
      input: { steps: (steps || []).map((s) => ({ kind: s.kind, name: s.name, config: s.config })), approval_required: a.approval_required },
      max_attempts: 3,
      started_at: new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;

    await supabase.from('automations').update({ last_run_at: new Date().toISOString(), run_count: (a.run_count || 0) + 1 }).eq('id', id);
    await audit(user.id, 'automation.run', { type: 'automation', id, data: { job_id: job.id } });

    // Execute synchronously (short) or leave queued for a worker. We execute now so users see events.
    const finalJob = await runJob(job.id).catch((e) => e);
    res.status(201).json({ job: finalJob?.id ? finalJob : job });
  } catch (err) {
    console.error('automations run error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
