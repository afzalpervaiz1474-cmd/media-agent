import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';
import { generateStructured, isConfiguredFor } from '../_ai.js';
import { PROVIDER_META } from '../_providers.js';

// POST /api/ai/analyze-media
// Body: { media_asset_id, platform, content_type?, hints? }
// Returns { analysis: { summary, signals, suggestions } }
// Only uses REAL data: the media_assets row (mime, dims, duration, filename) + optional vision
// call on images. Never invents metrics or content unrelated to the actual media.
export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const { media_asset_id, platform, content_type = null, hints = {} } = req.body || {};
    if (!media_asset_id) return res.status(400).json({ error: 'media_asset_id required' });
    if (!platform || !PROVIDER_META[platform]) return res.status(400).json({ error: 'valid platform required' });

    const { data: media, error } = await supabase.from('media_assets').select('*').eq('id', media_asset_id).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!media) return res.status(404).json({ error: 'Media asset not found' });

    // Compute deterministic signals from real file metadata.
    const signals = deriveSignals(media, platform);

    let analysis = {
      summary: describeMedia(media, platform, signals),
      signals,
      suggestions: baselineSuggestions(media, platform, content_type, hints),
      generated_by: 'deterministic',
    };

    const aiReady = await isConfiguredFor(user.id);
    if (aiReady) {
      try {
        const enriched = await callAi(user.id, media, platform, content_type, hints, signals);
        analysis = { ...enriched, signals, generated_by: 'ai' };
      } catch (e) {
        analysis._ai_error = safeError(e);
      }
    } else {
      analysis._note = 'No AI provider configured for this user. Configure one on /settings/ai-providers (or set OPENROUTER_API_KEY server-side). Returning deterministic analysis derived from real media metadata.';
    }

    const { data: saved } = await supabase.from('ai_analyses').insert({
      user_id: user.id,
      media_asset_id,
      platform,
      content_type,
      summary: analysis.summary,
      signals,
      suggestions: analysis.suggestions,
    }).select('*').single();

    await audit(user.id, 'ai.analyze_media', { type: 'media', id: media_asset_id, data: { platform, content_type } });

    res.status(200).json({ analysis, analysis_id: saved?.id, configured: aiReady });
  } catch (err) {
    console.error('analyze-media error', err);
    res.status(500).json({ error: safeError(err) });
  }
}

function deriveSignals(media, platform) {
  const w = media.width, h = media.height;
  const aspect = (w && h) ? +(w / h).toFixed(3) : null;
  const orientation = aspect ? (aspect > 1.05 ? 'landscape' : aspect < 0.95 ? 'portrait' : 'square') : null;
  const durationSec = media.duration_sec != null ? Number(media.duration_sec) : null;
  const rules = PROVIDER_META[platform]?.limits || {};
  const checks = [];
  if (rules.mimeTypes && media.mime_type && !rules.mimeTypes.includes(media.mime_type)) {
    checks.push({ level: 'error', message: `${media.mime_type} is not accepted by ${platform}. Allowed: ${rules.mimeTypes.join(', ')}.` });
  }
  if (platform === 'youtube' && durationSec != null && durationSec > 60 && orientation === 'portrait') {
    checks.push({ level: 'info', message: 'Vertical clip >60s: will be a regular video, not a Short.' });
  }
  if (platform === 'youtube' && durationSec != null && durationSec <= 60 && orientation !== 'portrait') {
    checks.push({ level: 'warn', message: 'Short-length clip is not 9:16 — YouTube likely will not classify it as a Short.' });
  }
  if (platform === 'tiktok' && durationSec != null && durationSec < (rules.minSec || 3)) {
    checks.push({ level: 'error', message: `TikTok requires at least ${rules.minSec}s.` });
  }
  if (platform === 'instagram' && durationSec != null && (durationSec < (rules.reelMinSec || 3) || durationSec > (rules.reelMaxSec || 90))) {
    checks.push({ level: 'warn', message: `Reels must be ${rules.reelMinSec}–${rules.reelMaxSec}s.` });
  }
  return {
    filename: media.filename,
    mime_type: media.mime_type,
    size_bytes: media.size_bytes,
    duration_sec: durationSec,
    width: w, height: h,
    aspect_ratio: aspect,
    orientation,
    checks,
  };
}

function describeMedia(media, platform, signals) {
  const parts = [];
  parts.push(`${media.kind === 'image' ? 'Image' : 'Video'}: ${media.filename}.`);
  if (signals.duration_sec != null) parts.push(`${signals.duration_sec.toFixed(1)}s`);
  if (signals.width && signals.height) parts.push(`${signals.width}×${signals.height} (${signals.orientation})`);
  parts.push(`Target: ${platform}.`);
  return parts.join(' ');
}

function baselineSuggestions(media, platform, contentType, hints) {
  const base = (media.filename || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  const topic = hints.topic || base || 'Untitled clip';
  const tone = hints.tone || 'confident, practical';
  const audience = hints.audience || 'creators and operators';
  const hashtags = topBigrams(topic).slice(0, 5).map((t) => `#${t.replace(/\s+/g, '')}`);
  const suggestions = {
    title: platform === 'youtube' ? base.slice(0, 90) : base.slice(0, 60),
    description: `${topic}. Made for ${audience}. Tone: ${tone}.`,
    caption: `${topic} — full breakdown below.`,
    tags: topBigrams(topic).slice(0, 5),
    hashtags: hashtags.length ? hashtags : ['#build', '#ship'],
    cta: platform === 'youtube' ? 'Subscribe for more.' : 'Follow for the full series.',
    thumbnail_concepts: [
      { idea: `Bold serif title over the strongest frame of ${base}`, palette: 'cream + ink' },
      { idea: 'Split-screen before/after with one metric highlighted', palette: 'graphite + sulfur' },
    ],
    platform_variant: contentType ? { [platform]: { content_type: contentType, title: base.slice(0, 90), caption: base.slice(0, 120) } } : {},
  };
  return suggestions;
}

async function callAi(userId, media, platform, contentType, hints, signals) {
  const system = `You are Modulate. You are given REAL metadata about a media file (never fabricate metrics, IDs or content you cannot see). Return ONLY valid JSON that matches the requested shape.`;
  const user = `Real media metadata (JSON): ${JSON.stringify({
    filename: media.filename, mime_type: media.mime_type, size_bytes: media.size_bytes,
    duration_sec: media.duration_sec, width: media.width, height: media.height,
    orientation: signals.orientation, aspect_ratio: signals.aspect_ratio,
  })}
Platform: ${platform}. Content type: ${contentType || 'auto'}.
Hints from user: ${JSON.stringify(hints || {})}.

Return JSON with keys:
- summary: string describing the media in one sentence (only based on metadata; no imagined visuals).
- suggestions: {
    title: string (${platform === 'youtube' ? '<=100' : '<=90'} chars),
    description: string (200-800 chars, no fabricated stats),
    caption: string (<=250 chars),
    tags: string[] (3-8 short words),
    hashtags: string[] (5-10 hashtags starting with #),
    cta: string,
    thumbnail_concepts: [ { idea: string, palette: string } ] (2 items),
    platform_variant: object (title + caption + any platform-specific fields)
  }
- rationale: string (1-2 sentences explaining choices based on metadata).`;
  const r = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { userId, temperature: 0.5, kind: `analyze.${platform}` });
  return {
    summary: r.summary || describeMedia(media, platform, signals),
    suggestions: r.suggestions || baselineSuggestions(media, platform, contentType, hints),
    rationale: r.rationale || null,
  };
}

function topBigrams(text) {
  const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const counts = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([w]) => w);
}
