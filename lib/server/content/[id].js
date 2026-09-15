import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';

export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const id = req.query.id;

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('content').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ item: data });
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      const patch = {
        title: b.title, topic: b.topic, audience: b.audience, tone: b.tone, cta: b.cta,
        platforms: b.platforms, description: b.description, hashtags: b.hashtags, tags: b.tags,
        thumbnail_concepts: b.thumbnail_concepts, platform_variants: b.platform_variants,
        media_asset_id: b.media_asset_id, status: b.status,
        scheduled_for: b.scheduled_for, approved_at: b.approved_at,
        updated_at: new Date().toISOString(),
      };
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
      const { data, error } = await supabase.from('content').update(patch).eq('id', id).eq('user_id', user.id).select('*').single();
      if (error) throw error;
      await audit(user.id, 'content.update', { type: 'content', id });
      return res.status(200).json({ item: data });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('content').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      await audit(user.id, 'content.delete', { type: 'content', id });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('content/[id] error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
