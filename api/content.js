import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('content').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(200);
      if (error) throw error;
      return res.status(200).json({ items: data });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const payload = normalize(body, user.id);
      const { data, error } = await supabase.from('content').insert(payload).select('*').single();
      if (error) throw error;
      await audit(user.id, 'content.create', { type: 'content', id: data.id });
      return res.status(201).json({ item: data });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('content error', err);
    res.status(500).json({ error: safeError(err) });
  }
}

function normalize(body, uid) {
  const p = {
    user_id: uid,
    title: (body.title || 'Untitled').slice(0, 240),
    topic: body.topic || null,
    audience: body.audience || null,
    tone: body.tone || null,
    cta: body.cta || null,
    platforms: Array.isArray(body.platforms) ? body.platforms : [],
    description: body.description || null,
    captions: body.captions || {},
    hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
    tags: Array.isArray(body.tags) ? body.tags : [],
    thumbnail_concepts: Array.isArray(body.thumbnail_concepts) ? body.thumbnail_concepts : [],
    platform_variants: body.platform_variants && typeof body.platform_variants === 'object' ? body.platform_variants : {},
    media_asset_id: body.media_asset_id || null,
    status: body.status || 'draft',
    scheduled_for: body.scheduled_for || null,
    approved_at: body.approved_at || null,
    updated_at: new Date().toISOString(),
  };
  return p;
}
