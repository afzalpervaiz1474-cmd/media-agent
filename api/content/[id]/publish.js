import supabase from '../../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../../_auth.js';
import { providerConfigStatus, PROVIDER_META } from '../../_providers.js';
import { publishYouTube, publishTikTok, publishInstagram, publishFacebook } from '../../_publishers.js';

// POST /api/content/:id/publish
// For every selected platform:
//  - If provider is configured AND user has a connected account: attempt REAL publish, save result.
//  - Otherwise: create a WAITING_FOR_APPROVAL job with a specific reason.
// NEVER fabricates a successful publish.
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const id = req.query.id;
    const { data: content, error } = await supabase.from('content').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!content) return res.status(404).json({ error: 'Content not found' });

    const platforms = Array.isArray(content.platforms) ? content.platforms.filter((p) => PROVIDER_META[p]) : [];
    if (platforms.length === 0) return res.status(400).json({ error: 'No target platforms selected on this content.' });
    if (content.status !== 'approved' && content.status !== 'scheduled') {
      return res.status(400).json({ error: `Content must be approved before publishing (current: ${content.status}).` });
    }

    // Load media asset if any (required for real publishes).
    let media = null;
    if (content.media_asset_id) {
      const { data: m } = await supabase.from('media_assets').select('*').eq('id', content.media_asset_id).eq('user_id', user.id).maybeSingle();
      media = m || null;
    }

    const cfg = providerConfigStatus();
    const results = {};
    const warnings = [];
    let anyReal = false;
    const jobId = await createParentJob(user.id, content, platforms);

    for (const p of platforms) {
      if (!cfg[p].configured) {
        results[p] = { status: 'skipped', reason: `Provider not configured. Missing: ${cfg[p].missing.join(', ')}` };
        warnings.push(`${PROVIDER_META[p].name}: configuration required`);
        await supabase.from('job_events').insert({ job_id: jobId, level: 'warn', message: `${p}: provider not configured` });
        continue;
      }
      const { data: account } = await supabase.from('connected_accounts').select('id').eq('user_id', user.id).eq('provider', p).maybeSingle();
      if (!account) {
        results[p] = { status: 'skipped', reason: `${PROVIDER_META[p].name} account not connected. Connect via /${p}.` };
        warnings.push(`${PROVIDER_META[p].name}: not connected`);
        await supabase.from('job_events').insert({ job_id: jobId, level: 'warn', message: `${p}: no connected account` });
        continue;
      }
      if (!media) {
        results[p] = { status: 'skipped', reason: 'No media asset attached to this content record.' };
        warnings.push(`${PROVIDER_META[p].name}: missing media`);
        continue;
      }

      anyReal = true;
      const variant = content.platform_variants?.[p] || {};
      const meta = {
        title: variant.title || content.title,
        description: variant.description || content.description,
        caption: variant.caption || content.description,
        tags: content.tags,
        hashtags: content.hashtags,
        cta: content.cta,
      };
      try {
        let out;
        if (p === 'youtube') out = await publishYouTube({ userId: user.id, media, metadata: meta, contentType: (variant.content_type || 'long'), privacyStatus: 'private' });
        else if (p === 'tiktok') out = await publishTikTok({ userId: user.id, media, metadata: meta });
        else if (p === 'instagram') out = await publishInstagram({ userId: user.id, media, metadata: meta, contentType: (variant.content_type || 'reel') });
        else if (p === 'facebook') out = await publishFacebook({ userId: user.id, media, metadata: meta });
        results[p] = { status: 'published', ...out };
        await supabase.from('publish_results').insert({
          user_id: user.id, job_id: jobId, content_id: content.id, account_id: account.id, provider: p,
          provider_post_id: out.provider_post_id, provider_url: out.provider_url, status: 'published', raw: out.raw || {},
        });
        await supabase.from('job_events').insert({ job_id: jobId, level: 'info', message: `${p}: published${out.provider_url ? ` (${out.provider_url})` : ''}` });
      } catch (e) {
        results[p] = { status: 'failed', error: safeError(e) };
        await supabase.from('publish_results').insert({
          user_id: user.id, job_id: jobId, content_id: content.id, account_id: account.id, provider: p,
          status: 'failed', error: safeError(e),
        });
        await supabase.from('job_events').insert({ job_id: jobId, level: 'error', message: `${p}: ${safeError(e)}` });
      }
    }

    // Finalize job
    const succeeded = Object.values(results).filter((r) => r.status === 'published').length;
    const failed = Object.values(results).filter((r) => r.status === 'failed').length;
    const skipped = Object.values(results).filter((r) => r.status === 'skipped').length;
    let finalStatus = 'COMPLETED';
    if (!anyReal) finalStatus = 'WAITING_FOR_APPROVAL';
    else if (failed > 0 && succeeded === 0) finalStatus = 'FAILED';
    else if (failed > 0) finalStatus = 'COMPLETED'; // partial success is still completed

    const { data: doneJob } = await supabase.from('jobs').update({
      status: finalStatus, progress: 100, finished_at: new Date().toISOString(),
      output: { results, succeeded, failed, skipped },
    }).eq('id', jobId).select('*').single();

    if (succeeded > 0) {
      await supabase.from('content').update({ status: 'published' }).eq('id', content.id);
    }

    await audit(user.id, 'content.publish', { type: 'content', id: content.id, data: { job_id: jobId, results } });
    res.status(200).json({ job: doneJob, results, warnings });
  } catch (err) {
    console.error('content publish error', err);
    res.status(500).json({ error: safeError(err) });
  }
}

async function createParentJob(userId, content, platforms) {
  const { data: job } = await supabase.from('jobs').insert({
    user_id: userId, content_id: content.id,
    kind: `publish.${platforms[0]}`,
    status: 'PROCESSING', progress: 10,
    input: { content_id: content.id, platforms },
    started_at: new Date().toISOString(),
    max_attempts: 1,
  }).select('*').single();
  await supabase.from('job_events').insert({ job_id: job.id, level: 'info', message: `Publish job started for content ${content.id.slice(0, 8)}` });
  return job.id;
}
