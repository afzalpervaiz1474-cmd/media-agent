// Vision for video frames, via the app's existing OpenRouter path
// (generateText) with image_url message parts.
//
// Design notes:
// - The vision model + key come from env only (VIDEO_VISION_MODEL,
//   VIDEO_VISION_API_KEY || OPENROUTER_API_KEY). The user's text-model
//   setting cannot be reused here because it may not support image input.
// - generateText is dynamically imported AFTER the env check, so a
//   not-configured call never touches Supabase or the network — callers
//   degrade to "skipped" and tests can assert that path in isolation.
// - A failed frame never fails the whole video: its note is null and the
//   error is recorded on that frame.

import { readFile } from 'node:fs/promises';
import { visionConfig } from './config.js';
import { buildVisionNotePrompt, buildVisualSummaryPrompt } from './prompts.js';
import { NotConfiguredError } from './ffmpeg.js';

export function visionOverrideCandidate(config = visionConfig()) {
  return {
    source: 'env',
    provider: 'openrouter',
    model: config.model,
    base_url: config.baseUrl,
    _key: config.apiKey,
  };
}

export function assertVisionConfigured(config = visionConfig()) {
  if (!config.apiKey) {
    throw new NotConfiguredError('Vision is not configured. Set VIDEO_VISION_API_KEY (or OPENROUTER_API_KEY) to enable frame descriptions.');
  }
  if (!config.model) {
    throw new NotConfiguredError('Vision model is not configured. Set VIDEO_VISION_MODEL to a vision-capable model to enable frame descriptions.');
  }
}

export async function describeFrames(frames, { config = visionConfig(), userId = null } = {}) {
  assertVisionConfigured(config);
  const { generateText } = await import('../_ai_manager.js');
  const prompt = buildVisionNotePrompt();
  const notes = [];
  for (const frame of frames || []) {
    try {
      const bytes = await readFile(frame.file);
      const dataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`;
      const content = await generateText(userId, {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt.user },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
        temperature: 0.2,
        timeoutMs: 60000,
        kind: 'video.vision',
        override: visionOverrideCandidate(config),
      });
      notes.push({
        index: frame.index ?? notes.length,
        approxTimestampSec: frame.approxTimestampSec ?? null,
        note: (content.content || '').trim() || null,
        status: (content.content || '').trim() ? 'ok' : 'empty',
      });
    } catch (e) {
      notes.push({
        index: frame.index ?? notes.length,
        approxTimestampSec: frame.approxTimestampSec ?? null,
        note: null,
        status: 'failed',
        error: e?.message ? String(e.message).slice(0, 240) : 'Vision call failed',
      });
    }
  }
  return notes;
}

// Compress per-frame notes into one summary. Uses the user's normal text
// provider chain; on any failure it falls back to the joined notes
// themselves (still real observations, never invented content).
export async function summarizeFrameNotes(notes, { userId = null } = {}) {
  const usable = (notes || []).filter((n) => n && n.note);
  if (!usable.length) return null;
  try {
    const { generateText } = await import('../_ai_manager.js');
    const prompt = buildVisualSummaryPrompt(usable);
    const content = await generateText(userId, {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.3,
      timeoutMs: 60000,
      kind: 'video.visual_summary',
    });
    const text = (content.content || '').trim();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.summary === 'string' && parsed.summary.trim()) return parsed.summary.trim();
      } catch { /* not JSON — use raw text */ }
      return text;
    }
  } catch { /* fall through to joined notes */ }
  return usable.map((n) => `[~${n.approxTimestampSec ?? '?'}s] ${n.note}`).join(' ');
}
