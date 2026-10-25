// Deterministic job runner. Runs in the API function itself so state is real.
// For long-running work (FFmpeg, big publishes) a dedicated worker + Redis/BullMQ can subscribe to the same jobs table.
import supabase from './db-client.js';
import { generateStructured, isConfiguredFor, draftMetadata, draftVariants, draftThumbnails } from './_ai.js';
import { providerConfigStatus } from './_providers.js';
import { getVideoAnalysis } from './video/analysis-store.js';
import { truncateText } from './video/prompts.js';
import { analyzeVideo, transcribeVideo, extractVideoFrames, generateVideoThumbnails } from './video/pipeline.js';

async function event(jobId, level, message, data = {}) {
  await supabase.from('job_events').insert({ job_id: jobId, level, message, data });
}

async function setJob(jobId, patch) {
  const { data } = await supabase.from('jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId).select('*').single();
  return data;
}

export async function runJob(jobId) {
  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (!job) throw new Error('Job not found');
  if (['COMPLETED','CANCELLED'].includes(job.status)) return job;

  await setJob(jobId, { status: 'PROCESSING', started_at: job.started_at || new Date().toISOString(), attempts: (job.attempts || 0) + 1 });
  await event(jobId, 'info', `Started attempt ${(job.attempts || 0) + 1}/${job.max_attempts}`);

  try {
    let output = {};
    if (job.kind.startsWith('publish.')) {
      output = await handlePublish(job);
    } else if (job.kind.startsWith('automation.')) {
      output = await handleAutomation(job);
    } else if (job.kind.startsWith('ai.')) {
      output = await handleAi(job);
    } else if (job.kind.startsWith('media.')) {
      output = await handleMedia(job);
    } else {
      output = { note: 'unknown kind, no-op' };
    }

    const final = await setJob(jobId, { status: 'COMPLETED', progress: 100, finished_at: new Date().toISOString(), output, error: null });
    await event(jobId, 'info', 'Completed');
    await notifyOwner(job.user_id, 'job.completed', `Job completed: ${job.kind}`, `Job ${jobId.slice(0,8)} finished successfully.`, `/jobs/${jobId}`);
    return final;
  } catch (err) {
    // Approval pause is not a failure
    if (err && err._pause) {
      await event(jobId, 'info', 'Paused for approval');
      await notifyOwner(job.user_id, 'job.approval', `Approval needed: ${job.kind}`, 'This job is waiting for your approval before publishing.', `/jobs/${jobId}`);
      const paused = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
      return paused.data;
    }
    const msg = err?.message || 'Job failed';
    const attempts = (job.attempts || 0) + 1;
    if (attempts < (job.max_attempts || 3) && isTransient(err)) {
      await event(jobId, 'warn', `Transient failure, will retry: ${msg}`);
      await setJob(jobId, { status: 'QUEUED', error: msg });
      return await runJob(jobId); // simple in-process retry
    }
    const final = await setJob(jobId, { status: 'FAILED', finished_at: new Date().toISOString(), error: msg });
    await event(jobId, 'error', msg);
    await notifyOwner(job.user_id, 'job.failed', `Job failed: ${job.kind}`, msg, `/jobs/${jobId}`);
    return final;
  }
}

function isTransient(err) {
  const s = err?.status || 0;
  return [408, 429, 500, 502, 503, 504].includes(s) || err?.name === 'AbortError';
}

async function handlePublish(job) {
  const { publishYouTube, publishTikTok, publishInstagram, publishFacebook } = await import('./_publishers.js');
  const { platforms = [], content_id } = job.input || {};
  const providers = providerConfigStatus();
  const results = {};

  let content = null;
  let media = null;
  if (content_id) {
    const { data: c } = await supabase.from('content').select('*').eq('id', content_id).eq('user_id', job.user_id).maybeSingle();
    content = c;
    if (c?.media_asset_id) {
      const { data: m } = await supabase.from('media_assets').select('*').eq('id', c.media_asset_id).eq('user_id', job.user_id).maybeSingle();
      media = m;
    }
  }

  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    await event(job.id, 'info', `Preparing ${p}…`);
    await setJob(job.id, { progress: Math.round((i / platforms.length) * 80) });
    const cfg = providers[p];
    if (!cfg?.configured) {
      results[p] = { status: 'skipped', reason: `Provider not configured. Missing: ${cfg?.missing?.join(', ')}` };
      await event(job.id, 'warn', `Skipped ${p}: provider not configured`);
      continue;
    }
    const { data: account } = await supabase.from('connected_accounts').select('id').eq('user_id', job.user_id).eq('provider', p).maybeSingle();
    if (!account) {
      results[p] = { status: 'skipped', reason: `${p}: account not connected.` };
      await event(job.id, 'warn', `${p}: no connected account`);
      continue;
    }
    if (!media) {
      results[p] = { status: 'skipped', reason: 'No media asset attached.' };
      await event(job.id, 'warn', `${p}: no media`);
      continue;
    }
    const variant = content?.platform_variants?.[p] || {};
    const meta = {
      title: variant.title || content?.title,
      description: variant.description || content?.description,
      caption: variant.caption || content?.description,
      tags: content?.tags, hashtags: content?.hashtags, cta: content?.cta,
    };
    try {
      let out;
      if (p === 'youtube') out = await publishYouTube({ userId: job.user_id, media, metadata: meta, contentType: variant.content_type || 'long', privacyStatus: 'private' });
      else if (p === 'tiktok') out = await publishTikTok({ userId: job.user_id, media, metadata: meta });
      else if (p === 'instagram') out = await publishInstagram({ userId: job.user_id, media, metadata: meta, contentType: variant.content_type || 'reel' });
      else if (p === 'facebook') out = await publishFacebook({ userId: job.user_id, media, metadata: meta });
      results[p] = { status: 'published', ...out };
      await supabase.from('publish_results').insert({ user_id: job.user_id, job_id: job.id, content_id, account_id: account.id, provider: p, provider_post_id: out.provider_post_id, provider_url: out.provider_url, status: 'published', raw: out.raw || {} });
      await event(job.id, 'info', `${p}: published${out.provider_url ? ` (${out.provider_url})` : ''}`);
    } catch (e) {
      const msg = e?.message || String(e);
      results[p] = { status: 'failed', error: msg };
      await supabase.from('publish_results').insert({ user_id: job.user_id, job_id: job.id, content_id, account_id: account.id, provider: p, status: 'failed', error: msg });
      await event(job.id, 'error', `${p}: ${msg}`);
    }
  }
  return { platforms: results, content_id };
}

async function handleAutomation(job) {
  const steps = (job.input?.steps || []).slice();
  const approvalRequired = !!job.input?.approval_required;
  const output = { steps: [] };

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    await event(job.id, 'info', `Step ${i + 1}: ${s.name}`, { kind: s.kind });
    await setJob(job.id, { progress: Math.round(((i + 1) / (steps.length + 1)) * 90) });

    if (s.kind === 'approval' && approvalRequired) {
      await event(job.id, 'warn', 'Waiting for user approval');
      await setJob(job.id, { status: 'WAITING_FOR_APPROVAL' });
      output.steps.push({ ...s, status: 'waiting_for_approval' });
      const err = new Error('Waiting for approval');
      err._pause = true;
      throw err;
    }

    if (s.kind.startsWith('ai.')) {
      const kind = s.kind.split('.')[1];
      const topic = s.config?.topic || job.input?.topic || 'Untitled topic';
      // Video grounding (Phase 3): when an automation step references a
      // media asset that already has a video analysis, feed its real
      // transcript + visual summary into the prompt. Load failures fall
      // back to topic-only — never fabricated content.
      let videoGrounding = {};
      if (s.config?.media_asset_id) {
        try {
          const { data: asset } = await supabase.from('media_assets').select('*').eq('id', s.config.media_asset_id).eq('user_id', job.user_id).maybeSingle();
          const analysis = asset ? getVideoAnalysis(asset) : null;
          if (analysis) {
            videoGrounding = {
              transcript: analysis.transcript || null,
              visualSummary: analysis.visualSummary || null,
              frameNotes: analysis.frameNotes || [],
            };
          }
        } catch { /* topic-only fallback */ }
      }
      if (await isConfiguredFor(job.user_id)) {
        const prompt = agentPrompt(kind, { topic, ...s.config, ...videoGrounding });
        try {
          const r = await generateStructured([{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }], { userId: job.user_id, temperature: 0.6, kind: `automation.${kind}` });
          output.steps.push({ ...s, status: 'ok', result: r });
        } catch (e) {
          output.steps.push({ ...s, status: 'ok', result: fallback(kind, s.config), degraded: true, error: String(e.message || e) });
        }
      } else {
        output.steps.push({ ...s, status: 'ok', result: fallback(kind, s.config), draft: true });
      }
    } else if (s.kind === 'publish') {
      const platforms = s.config?.platforms || [];
      const providers = providerConfigStatus();
      const results = {};
      for (const p of platforms) results[p] = providers[p]?.configured ? { status: 'pending_provider_integration' } : { status: 'skipped', reason: 'not configured' };
      output.steps.push({ ...s, status: 'ok', result: results });
    } else if (s.kind === 'media.transcode' || s.kind === 'media.thumbnail') {
      output.steps.push({ ...s, status: 'skipped', reason: 'Topic-based automation steps cannot use asset jobs. For real thumbnails, run a media.thumbnail_image job with a media_asset_id (see README: Video analysis). Transcoding is not implemented in v1.' });
      await event(job.id, 'warn', `${s.kind}: skipped (needs a media asset job, not an automation step)`);
    } else {
      output.steps.push({ ...s, status: 'ok' });
    }
  }
  return output;
}

function fallback(kind, cfg = {}) {
  const topic = cfg.topic || '';
  if (kind === 'metadata') return draftMetadata({ topic, tone: cfg.tone, audience: cfg.audience });
  if (kind === 'variants') return draftVariants({ topic, platforms: cfg.platforms || [], tone: cfg.tone });
  if (kind === 'thumbnails') return draftThumbnails({ topic });
  return { note: 'unknown ai step' };
}

function agentPrompt(kind, cfg) {
  const system = `You are Modulate, a social content assistant. Return ONLY valid JSON matching the requested schema. Do not include markdown fences.`;
  // Real video grounding, when present. Never invented: only the stored
  // transcript / visual summary / frame notes are quoted, truncated.
  const videoSection = [];
  if (cfg.transcript) videoSection.push(`Video transcript (real spoken words, excerpt): "${truncateText(cfg.transcript, 4000)}"`);
  if (cfg.visualSummary) videoSection.push(`What is actually visible in the video (real frame summary): "${truncateText(cfg.visualSummary, 2000)}"`);
  if (videoSection.length) videoSection.push('Base the output on the transcript and visible content when present. Never invent visuals, quotes, or events not in them.');
  if (kind === 'metadata') {
    return {
      system,
      user: `Generate content metadata for topic: "${cfg.topic}". Audience: "${cfg.audience || ''}". Tone: "${cfg.tone || ''}". CTA: "${cfg.cta || ''}".${videoSection.length ? `\n${videoSection.join('\n')}` : ''} Return JSON with keys: title (string, <=80 chars), description (string, 150-500 chars), hashtags (array of 5-10 strings starting with #), tags (array of 3-6 short strings), cta (string).`,
    };
  }
  if (kind === 'variants') {
    return {
      system,
      user: `Rewrite for each platform. Topic: "${cfg.topic}". Tone: "${cfg.tone || ''}". Platforms: ${JSON.stringify(cfg.platforms || [])}.${videoSection.length ? `\n${videoSection.join('\n')}` : ''} Return JSON: { "variants": { "<platform>": { "title": string, "caption": string, "description": string } } }.`,
    };
  }
  if (kind === 'thumbnails') {
    const scenes = (cfg.frameNotes || []).filter((n) => n && n.note).map((n) => `[~${n.approxTimestampSec ?? '?'}s] ${n.note}`).join(' | ');
    return {
      system,
      user: `Propose 3 thumbnail concepts for topic: "${cfg.topic}".${scenes ? ` Real scenes observed (ground concepts in these, do not invent others): "${truncateText(scenes, 2000)}".` : ''} Return JSON: { "concepts": [ { "idea": string, "palette": string } ] }.`,
    };
  }
  return { system, user: `Return JSON: { "note": "ok" }` };
}

async function handleAi(job) { return { note: 'ai job processed' }; }

async function handleMedia(job) {
  const input = job.input || {};
  const { media_asset_id } = input;
  if (!media_asset_id) throw new Error('Media job requires input.media_asset_id.');
  const { data: asset } = await supabase.from('media_assets').select('*').eq('id', media_asset_id).eq('user_id', job.user_id).maybeSingle();
  if (!asset) throw new Error('Media asset not found.');
  const isVideo = asset.kind === 'video' || String(asset.mime_type || '').startsWith('video/');
  if (!isVideo) throw new Error('Video analysis requires a video asset.');

  // Full pipeline and single-purpose jobs (video-analysis v1). Each one
  // degrades step-by-step (skipped, never fabricated) when a provider key
  // or FFmpeg is missing; only download/duration failures throw.
  if (job.kind === 'media.analyze_video') {
    return analyzeVideo({ supabase, asset, userId: job.user_id, hints: input.hints || {} });
  }
  if (job.kind === 'media.transcribe') {
    return transcribeVideo({ supabase, asset });
  }
  if (job.kind === 'media.extract_frames') {
    return extractVideoFrames({ supabase, asset, userId: job.user_id });
  }
  if (job.kind === 'media.thumbnail_image') {
    return generateVideoThumbnails({ supabase, asset, concept: input.concept || '', title: input.title || '' });
  }
  if (job.kind === 'media.thumbnail') {
    return { status: 'skipped', reason: 'Use media.thumbnail_image with a media_asset_id for real thumbnail images.' };
  }
  if (job.kind === 'media.transcode') {
    return { status: 'skipped', reason: 'Transcoding is not implemented in v1 video analysis. Use FFmpeg directly for re-encodes.' };
  }
  return { note: `unknown media kind ${job.kind}, no-op` };
}

async function notifyOwner(user_id, kind, title, body, link) {
  try { await supabase.from('notifications').insert({ user_id, kind, title, body, link }); } catch { /* soft */ }
}
