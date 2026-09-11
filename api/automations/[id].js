import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const id = req.query.id;

    if (req.method === 'GET') {
      const { data: a } = await supabase.from('automations').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!a) return res.status(404).json({ error: 'Not found' });
      const { data: steps } = await supabase.from('automation_steps').select('*').eq('automation_id', id).order('position');
      return res.status(200).json({ item: { ...a, steps: steps || [] } });
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      const patch = {
        name: b.name, description: b.description, trigger_type: b.trigger_type, schedule_cron: b.schedule_cron,
        status: b.status, approval_required: b.approval_required, config: b.config,
        updated_at: new Date().toISOString(),
      };
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
      const { data: a, error } = await supabase.from('automations').update(patch).eq('id', id).eq('user_id', user.id).select('*').single();
      if (error) throw error;

      if (Array.isArray(b.steps)) {
        await supabase.from('automation_steps').delete().eq('automation_id', id);
        if (b.steps.length) {
          const rows = b.steps.map((s, i) => ({ automation_id: id, position: s.position || i + 1, kind: s.kind, name: s.name, config: s.config || {} }));
          await supabase.from('automation_steps').insert(rows);
        }
      }
      await audit(user.id, 'automation.update', { type: 'automation', id });
      return res.status(200).json({ item: a });
    }

    if (req.method === 'DELETE') {
      await supabase.from('automation_steps').delete().eq('automation_id', id);
      const { error } = await supabase.from('automations').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      await audit(user.id, 'automation.delete', { type: 'automation', id });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('automations/[id] error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
