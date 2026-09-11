import crypto from 'node:crypto';
import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';
import { PROVIDER_META, providerConfigStatus } from '../_providers.js';
import { publishYouTube, publishTikTok, publishInstagram, publishFacebook } from '../_publishers.js';

// POST /api/social/compose
// The Social Media Orchestrator.
//
// Body: {
//   media_asset_id: uuid,
//   platforms: string[],
//   metadata_by_platform: { [provider]: { title, description, caption, tags, hashtags, cta, content_type, options } },
//   mode: 'manual' | 'approval' | 'auto',   // controls whether we actually call providers
//   idempotency_key?: string,
// }
//
// Returns { orchestration: { job_id, results: { [provider]: { status, ...detail } } } }
// where per-provider status is one of:
//   'SUCCESS'  - platform confirmed publication (real ID / URL saved)
//   'FAILED'   - platform returned an error (message included)
//   'SKIPPED'  - provider not configured or no connected account
//   'PENDING_APPROVAL'  - Approval mode: content prepared, awaiting user confirmation
//   'MANUAL'   - Manual mode: nothing was called; user must publish from provider page
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const { media_asset_id, platforms = [], metadata_by_platform = {}, mode = 'manual', idempotency_key } = req.body || {};
    if (!media_asset_id) return res.status(400).json({ error: 'media_asset_id required' });
    if (!Array.isArray(platforms) || platforms.length === 0) return res.status(400).json({ error: 'platforms[] required' });
    const validPlatforms = platforms.filter((p) => PROVIDER_META[p]);
    if (validPlatforms.length !== platforms.length) return res.status(400).json({ error: 'Unknown platform in list' });
    if (!['manual', 'approval', 'auto'].includes(mode)) return res.status(400).json({ error: 'mode must be manual|approval|auto' });

    const { data: media } = await supabase.from('media_assets').select('*').eq('id', media_asset_id).eq('user_id', user.id).maybeSingle();
    if (!media) return res.status(404).json({ error: 'media_asset not found' });

    // Idempotency: refuse to reprocess the same batch.
    const key = idempotency_key || crypto.createHash('sha256').update(`${user.id}:orchestrate:${media_asset_id}:${validPlatforms.join(',')}:${mode}`).digest('hex').slice(0, 40);
    const { data: existingJob } = await supabase.from('jobs').select('*').eq('user_id', user.id).eq('kind', 'orchestrate.publish').contains('input', { idempotency_key: key }).maybeSingle();
    if (existingJob) {
      const { data: results } = await supabase.from('publish_results').select('*').eq('job_id', existingJob.id);
      return res.status(200).json({ orchestration: { job_id: existingJob.id, mode, results: shapeExisting(results, validPlatforms) }, idempotent: true });
    }

    const cfg = providerConfigStatus();
    const accountsMap = {};
    {
      const { data: acc } = await supabase.from('connected_accounts').select('*').eq('user_id', user.id).in('provider', validPlatforms);
      for (const a of acc || []) accountsMap[a.provider] = a;
    }

    // Parent job so the whole orchestration is trackable
    const { data: parentJob } = await supabase.from('jobs').insert({
      user_id: user.id,
      kind: 'orchestrate.publish',
      status: mode === 'manual' ? 'COMPLETED' : (mode === 'approval' ? 'WAITING_FOR_APPROVAL' : 'PROCESSING'),
      progress: mode === 'auto' ? 10 : 100,
      input: { media_asset_id, platforms: validPlatforms, mode, idempotency_key: key },
      started_at: new Date().toISOString(),
      max_attempts: 1,
    }).select('*').single();

    const results = {};
    for (const provider of validPlatforms) {
      const meta = metadata_by_platform[provider] || {};

      if (!cfg[provider].configured) {
        results[provider] = { status: 'SKIPPED', reason: `Configuration required. Missing: ${cfg[provider].missing.join(', ')}` };
        await logEvent(parentJob.id, 'warn', `${provider}: configuration required`);
        continue;
      }
      const account = accountsMap[provider];
      if (!account) {
        results[provider] = { status: 'AUTHORIZATION_REQUIRED', reason: `${PROVIDER_META[provider].name} account not connected. Complete OAuth on /${provider}.` };
        await logEvent(parentJob.id, 'warn', `${provider}: authorization required`);
        continue;
      }

      const violations = validateFor(provider, media, meta.content_type);
      if (violations.length) {
        results[provider] = { status: 'FAILED', reason: violations.map((v) => v.message).join(' • '), violations };
        await logEvent(parentJob.id, 'error', `${provider}: validation failed`);
        await supabase.from('publish_results').insert({ user_id: user.id, job_id: parentJob.id, account_id: account.id, provider, status: 'failed', error: violations.map((v) => v.message).join(' • ') });
        continue;
      }

      if (mode === 'manual') {
        results[provider] = { status: 'MANUAL', reason: 'Manual mode: open the provider workspace to publish.' };
        continue;
      }
      if (mode === 'approval') {
        results[provider] = { status: 'PENDING_APPROVAL', reason: 'Approval mode: content prepared. Open Jobs to approve.' };
        continue;
      }

      // AUTO MODE — call the real provider API. Never faked.
      try {
        const out = await callPublisher(provider, {
          userId: user.id, media, metadata: meta,
          contentType: meta.content_type,
          options: meta.options || {},
        });
        results[provider] = { status: 'SUCCESS', provider_post_id: out.provider_post_id, provider_url: out.provider_url };
        await supabase.from('publish_results').insert({
          user_id: user.id, job_id: parentJob.id, account_id: account.id, provider,
          provider_post_id: out.provider_post_id, provider_url: out.provider_url,
          status: 'published', raw: out.raw || {},
        });
        await logEvent(parentJob.id, 'info', `${provider}: published${out.provider_url ? ' (' + out.provider_url + ')' : ''}`);
        await supabase.from('notifications').insert({ user_id: user.id, kind: 'publish.completed', title: `${PROVIDER_META[provider].name}: published`, body: out.provider_url || `id: ${out.provider_post_id}`, link: `/jobs/${parentJob.id}` });
      } catch (e) {
        const msg = safeError(e);
        results[provider] = { status: 'FAILED', reason: msg };
        await supabase.from('publish_results').insert({ user_id: user.id, job_id: parentJob.id, account_id: account.id, provider, status: 'failed', error: msg });
        await logEvent(parentJob.id, 'error', `${provider}: ${msg}`);
        await supabase.from('notifications').insert({ user_id: user.id, kind: 'publish.failed', title: `${PROVIDER_META[provider].name}: publish failed`, body: msg, link: `/jobs/${parentJob.id}` });
      }
    }

    // Finalize
    const anyFail = Object.values(results).some((r) => r.status === 'FAILED');
    const anyOk = Object.values(results).some((r) => r.status === 'SUCCESS');
    let finalStatus = parentJob.status;
    if (mode === 'auto') finalStatus = anyOk ? 'COMPLETED' : (anyFail ? 'FAILED' : 'COMPLETED');
    const { data: done } = await supabase.from('jobs').update({
      status: finalStatus, progress: 100, finished_at: new Date().toISOString(),
      output: { results },
    }).eq('id', parentJob.id).select('*').single();

    await audit(user.id, 'orchestrate.publish', { type: 'job', id: parentJob.id, data: { platforms: validPlatforms, mode } });
    res.status(200).json({ orchestration: { job_id: done.id, mode, results } });
  } catch (err) {
    console.error('orchestrate error', err);
    res.status(500).json({ error: safeError(err) });
  }
}

async function callPublisher(provider, args) {
  if (provider === 'youtube') return publishYouTube({ ...args, contentType: args.contentType || 'long', privacyStatus: args.options?.privacy_status || 'private' });
  if (provider === 'tiktok') return publishTikTok({ ...args, privacy_level: args.options?.privacy_level || 'SELF_ONLY' });
  if (provider === 'instagram') return publishInstagram({ ...args, contentType: args.contentType || 'reel' });
  if (provider === 'facebook') return publishFacebook({ ...args, pageId: args.options?.page_id || null });
  throw new Error(`Unsupported provider: ${provider}`);
}

async function logEvent(job_id, level, message) {
  try { await supabase.from('job_events').insert({ job_id, level, message }); } catch { /* soft */ }
}

function validateFor(provider, media, contentType) {
  const rules = PROVIDER_META[provider].limits || {};
  const v = [];
  if (rules.mimeTypes && media.mime_type && !rules.mimeTypes.includes(media.mime_type)) {
    v.push({ level: 'error', message: `${media.mime_type} not accepted by ${provider}. Allowed: ${rules.mimeTypes.join(', ')}.` });
  }
  const dur = media.duration_sec != null ? Number(media.duration_sec) : null;
  if (provider === 'youtube' && contentType === 'short' && dur != null && dur > 60) v.push({ level: 'error', message: 'YouTube Shorts must be ≤60s.' });
  if (provider === 'tiktok' && dur != null && dur < (rules.minSec || 3)) v.push({ level: 'error', message: `TikTok requires ≥${rules.minSec}s.` });
  if (provider === 'instagram' && contentType === 'reel' && dur != null && (dur < rules.reelMinSec || dur > rules.reelMaxSec)) v.push({ level: 'error', message: `Reels must be ${rules.reelMinSec}–${rules.reelMaxSec}s.` });
  const maxBytes = rules.videoMaxBytes || rules.longMaxBytes || rules.maxBytes;
  if (maxBytes && media.size_bytes && Number(media.size_bytes) > maxBytes) v.push({ level: 'error', message: `File exceeds ${provider} max size.` });
  return v;
}

function shapeExisting(rows, providers) {
  const out = {};
  for (const p of providers) {
    const r = (rows || []).find((x) => x.provider === p);
    if (!r) out[p] = { status: 'PENDING' };
    else if (r.status === 'published') out[p] = { status: 'SUCCESS', provider_post_id: r.provider_post_id, provider_url: r.provider_url };
    else out[p] = { status: 'FAILED', reason: r.error };
  }
  return out;
}
