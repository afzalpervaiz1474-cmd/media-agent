// POST /api/ai/analyze-video
// Body: { media_asset_id, platform?, hints? }
// Enqueues a media.analyze_video job (QUEUED) that runs the full pipeline:
// audio -> transcript -> frames -> vision notes -> visual summary ->
// thumbnail images -> saved analysis. The job is picked up by the polling
// video worker (node scripts/video-worker.mjs), or run immediately via
// POST /api/jobs/:id/run. Nothing is published here: AI output still goes
// through the existing approval flow before any publish job runs.
import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';
import { maxVideoMinutes } from '../video/config.js';

export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const { media_asset_id, platform = null, hints = {} } = req.body || {};
    if (!media_asset_id) return res.status(400).json({ error: 'media_asset_id required' });

    const { data: asset } = await supabase.from('media_assets').select('*').eq('id', media_asset_id).eq('user_id', user.id).maybeSingle();
    if (!asset) return res.status(404).json({ error: 'Media asset not found' });
    const isVideo = asset.kind === 'video' || String(asset.mime_type || '').startsWith('video/');
    if (!isVideo) return res.status(400).json({ error: 'analyze-video requires a video asset.' });

    const limitMin = maxVideoMinutes();
    if (asset.duration_sec != null && Number(asset.duration_sec) > limitMin * 60) {
      return res.status(400).json({ error: `Video is ${(Number(asset.duration_sec) / 60).toFixed(1)} minutes; v1 limit is ${limitMin} minutes (MAX_VIDEO_MINUTES).` });
    }

    const { data: job, error } = await supabase.from('jobs').insert({
      user_id: user.id,
      kind: 'media.analyze_video',
      status: 'QUEUED',
      progress: 0,
      input: { media_asset_id, platform, hints },
      max_attempts: 3,
    }).select('*').single();
    if (error) throw error;

    await audit(user.id, 'ai.analyze_video', { type: 'job', id: job.id, data: { media_asset_id } });
    return res.status(201).json({
      job_id: job.id,
      status: 'QUEUED',
      note: 'Picked up by the video worker (node scripts/video-worker.mjs), or run now via POST /api/jobs/:id/run.',
    });
  } catch (err) {
    console.error('analyze-video error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
