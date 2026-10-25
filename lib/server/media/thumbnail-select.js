// POST /api/media/:id/thumbnail/select
// Body: { storage_path }
// Marks one of the asset's generated thumbnails as selected. Selecting IS
// the approval for the thumbnail itself (the user explicitly picks it);
// publishing still goes through the existing job approval flow.
// The path must match one of the stored thumbnail options, or live under
// thumbnails/<assetId>/ — anything else is rejected.
import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';
import { getVideoAnalysis, saveVideoAnalysis } from '../video/analysis-store.js';

function idFromReq(req) {
  if (req.query?.id) return req.query.id;
  const path = String(req.url || '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  const i = parts.indexOf('media');
  return i >= 0 ? parts[i + 1] : null;
}

export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const id = idFromReq(req);
    if (!id) return res.status(400).json({ error: 'Media id required' });

    const { storage_path } = req.body || {};
    if (!storage_path) return res.status(400).json({ error: 'storage_path required' });

    const { data: asset } = await supabase.from('media_assets').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!asset) return res.status(404).json({ error: 'Media asset not found' });

    const analysis = getVideoAnalysis(asset) || {};
    const options = analysis.thumbnailOptions || [];
    const matchesOption = options.some((o) => o && o.storage_path === storage_path);
    const matchesPrefix = String(storage_path).startsWith(`thumbnails/${id}/`);
    if (!matchesOption && !matchesPrefix) {
      return res.status(400).json({ error: 'storage_path is not one of this asset\'s generated thumbnails.' });
    }

    const updated = { ...analysis, selectedThumbnailPath: storage_path };
    await saveVideoAnalysis(supabase, asset, updated);
    await audit(user.id, 'media.thumbnail_select', { type: 'media', id, data: { storage_path } });
    return res.status(200).json({ item: { ...asset, video_analysis: updated }, selected_thumbnail_path: storage_path });
  } catch (err) {
    console.error('thumbnail-select error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
