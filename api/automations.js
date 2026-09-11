import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('automations').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ items: data });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const payload = {
        user_id: user.id,
        name: (b.name || 'New automation').slice(0, 200),
        description: b.description || null,
        trigger_type: b.trigger_type || 'manual',
        schedule_cron: b.schedule_cron || null,
        status: b.status || 'active',
        approval_required: b.approval_required !== false,
        config: b.config || {},
      };
      const { data: a, error } = await supabase.from('automations').insert(payload).select('*').single();
      if (error) throw error;

      if (Array.isArray(b.steps) && b.steps.length) {
        const rows = b.steps.map((s, i) => ({ automation_id: a.id, position: s.position || i + 1, kind: s.kind, name: s.name, config: s.config || {} }));
        await supabase.from('automation_steps').insert(rows);
      }
      await audit(user.id, 'automation.create', { type: 'automation', id: a.id });
      return res.status(201).json({ item: a });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('automations error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
