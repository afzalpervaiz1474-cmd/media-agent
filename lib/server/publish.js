import crypto from 'node:crypto';
import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from './_auth.js';
import { PROVIDER_META, providerConfigStatus } from './_providers.js';
import { publishYouTube, publishTikTok, publishInstagram, publishFacebook } from './_publishers.js';

// POST /api/publish
// Body: { provider, media_asset_id, metadata, content_type?, content_id?, idempotency_key?, options? }
// Attempts a real publish through the provider's official API. Returns the real ID/URL,
// or a specific error explaining why the provider refused. NEVER fabricates success.
export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const { provider, media_asset_id, metadata = {}, content_type, content_id = null, idempotency_key = null, options = {} } = req.body || {};
    if (!provider || !PROVIDER_META[provider]) return res.status(400).json({ error: 'valid provider required' });
    if (!media_asset_id) return res.status(400).json({ error: 'media_asset_id required' });

    // Idempotency: if a same-user job with this key already exists, return it.
    const key = idempotency_key || crypto.createHash('sha256').update(`${user.id}:${provider}:${media_asset_id}:${JSON.stringify(metadata).slice(0,200)}`).digest('hex').slice(0, 40);

    const { data: existingJob } = await supabase.from('jobs').select('*').eq('user_id', user.id).eq('kind', `publish.${provider}`).contains('input', { idempotency_key: key }).maybeSingle();
    if (existingJob) return res.status(200).json({ job: existingJob, idempotent: true });

    // Sanity: provider must be configured (env vars) AND user must have a connected account with a token.
    const cfg = providerConfigStatus()[provider];
    if (!cfg.configured) return res.status(400).json({ error: `Provider not configured. Missing env: ${cfg.missing.join(', ')}` });

    const { data: account } = await supabase.from('connected_accounts').select('*').eq('user_id', user.id).eq('provider', provider).maybeSingle();
    if (!account) return res.status(400).json({ error: `${PROVIDER_META[provider].name} account not connected. Complete OAuth on /${provider}.` });

    const { data: media } = await supabase.from('media_assets').select('*').eq('id', media_asset_id).eq('user_id', user.id).maybeSingle();
    if (!media) return res.status(404).json({ error: 'Media asset not found' });

    // Validate against provider rules
    const violations = validateFor(provider, media, content_type);
    if (violations.length) return res.status(400).json({ error: violations.map((v) => v.message).join(' • '), violations });

    // Create job in PROCESSING state; execute inline. A worker can take over identical logic if desired.
    const { data: job, error: jerr } = await supabase.from('jobs').insert({
      user_id: user.id, content_id, kind: `publish.${provider}`,
      status: 'PROCESSING', progress: 5,
      input: { provider, media_asset_id, metadata, content_type, options, idempotency_key: key },
      max_attempts: 1,
      started_at: new Date().toISOString(),
    }).select('*').single();
    if (jerr) throw jerr;

    await supabase.from('job_events').insert({ job_id: job.id, level: 'info', message: `Publishing to ${provider} for ${account.display_name || account.handle || account.provider_account_id}` });

    let result;
    try {
      if (provider === 'youtube') result = await publishYouTube({ userId: user.id, media, metadata, contentType: content_type || 'long', privacyStatus: options.privacy_status || 'private' });
      else if (provider === 'tiktok') result = await publishTikTok({ userId: user.id, media, metadata, privacy_level: options.privacy_level || 'SELF_ONLY' });
      else if (provider === 'instagram') result = await publishInstagram({ userId: user.id, media, metadata, contentType: content_type || 'reel' });
      else if (provider === 'facebook') result = await publishFacebook({ userId: user.id, media, metadata, pageId: options.page_id || null });
      else throw new Error(`No adapter for ${provider}`);
    } catch (e) {
      await supabase.from('jobs').update({ status: 'FAILED', progress: 100, finished_at: new Date().toISOString(), error: safeError(e) }).eq('id', job.id);
      await supabase.from('job_events').insert({ job_id: job.id, level: 'error', message: safeError(e) });
      await supabase.from('publish_results').insert({
        user_id: user.id, job_id: job.id, content_id, account_id: account.id, provider,
        status: 'failed', error: safeError(e),
      });
      await supabase.from('notifications').insert({ user_id: user.id, kind: 'publish.failed', title: `${PROVIDER_META[provider].name} publish failed`, body: safeError(e), link: `/jobs/${job.id}` });
      return res.status(502).json({ error: safeError(e), job_id: job.id });
    }

    await supabase.from('publish_results').insert({
      user_id: user.id, job_id: job.id, content_id, account_id: account.id, provider,
      provider_post_id: result.provider_post_id,
      provider_url: result.provider_url,
      status: 'published',
      raw: result.raw || {},
    });
    const { data: doneJob } = await supabase.from('jobs').update({
      status: 'COMPLETED', progress: 100, finished_at: new Date().toISOString(),
      output: { provider_post_id: result.provider_post_id, provider_url: result.provider_url },
    }).eq('id', job.id).select('*').single();
    await supabase.from('job_events').insert({ job_id: job.id, level: 'info', message: `Published${result.provider_url ? `: ${result.provider_url}` : ''}` });
    if (content_id) {
      await supabase.from('content').update({ status: 'published' }).eq('id', content_id).eq('user_id', user.id);
    }
    await supabase.from('notifications').insert({ user_id: user.id, kind: 'publish.completed', title: `${PROVIDER_META[provider].name} publish succeeded`, body: result.provider_url || `id: ${result.provider_post_id}`, link: `/jobs/${job.id}` });
    await audit(user.id, `publish.${provider}`, { type: 'job', id: job.id });

    res.status(200).json({ job: doneJob, result });
  } catch (err) {
    console.error('publish error', err);
    res.status(500).json({ error: safeError(err) });
  }
}

function validateFor(provider, media, contentType) {
  const rules = PROVIDER_META[provider].limits;
  const v = [];
  if (rules.mimeTypes && media.mime_type && !rules.mimeTypes.includes(media.mime_type)) {
    v.push({ level: 'error', message: `${media.mime_type} not accepted. Allowed: ${rules.mimeTypes.join(', ')}.` });
  }
  const dur = media.duration_sec != null ? Number(media.duration_sec) : null;
  if (provider === 'youtube' && contentType === 'short' && dur != null && dur > 60) {
    v.push({ level: 'error', message: 'YouTube Shorts must be 60 seconds or less.' });
  }
  if (provider === 'tiktok' && dur != null && dur < (rules.minSec || 3)) {
    v.push({ level: 'error', message: `TikTok requires at least ${rules.minSec}s.` });
  }
  if (provider === 'instagram' && contentType === 'reel' && dur != null && (dur < rules.reelMinSec || dur > rules.reelMaxSec)) {
    v.push({ level: 'error', message: `Reels must be ${rules.reelMinSec}–${rules.reelMaxSec}s.` });
  }
  const maxBytes = rules.videoMaxBytes || rules.longMaxBytes || rules.maxBytes;
  if (maxBytes && media.size_bytes && Number(media.size_bytes) > maxBytes) {
    v.push({ level: 'error', message: `File exceeds ${provider} max size (${Math.round(maxBytes / 1024 / 1024)} MB).` });
  }
  return v;
}
