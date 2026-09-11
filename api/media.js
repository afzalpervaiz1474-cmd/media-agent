import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from './_auth.js';

const ALLOWED_MIMES = ['video/mp4','video/quicktime','video/webm','image/png','image/jpeg','image/webp'];
const MAX_BYTES = 500 * 1024 * 1024;

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('media_assets').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ items: data });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.filename || !b.storage_path) return res.status(400).json({ error: 'filename and storage_path required' });
      if (b.mime_type && !ALLOWED_MIMES.includes(b.mime_type)) return res.status(400).json({ error: 'Unsupported mime type' });
      if (b.size_bytes && Number(b.size_bytes) > MAX_BYTES) return res.status(400).json({ error: 'File exceeds 500MB limit' });

      const payload = {
        user_id: user.id,
        filename: String(b.filename).slice(0, 240),
        storage_path: b.storage_path,
        public_url: b.public_url || null,
        mime_type: b.mime_type || null,
        size_bytes: b.size_bytes || null,
        duration_sec: b.duration_sec || null,
        width: b.width || null,
        height: b.height || null,
        kind: b.kind || 'video',
        metadata: b.metadata || {},
      };
      const { data, error } = await supabase.from('media_assets').insert(payload).select('*').single();
      if (error) throw error;
      await audit(user.id, 'media.upload', { type: 'media', id: data.id });
      return res.status(201).json({ item: data });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('media error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
