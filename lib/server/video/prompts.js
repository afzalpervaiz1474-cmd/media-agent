// Pure prompt builders for video analysis. Every prompt carries the app's
// no-fabrication rule: the model may ONLY use the real metadata, transcript
// excerpt, and frame notes supplied below — never invented visuals, quotes,
// statistics, or events. Sections that have no data are omitted entirely
// (not filled with guesses), and the model must say when data is missing.

import { transcriptExcerptChars, frameNotesExcerptChars } from './config.js';

export function truncateText(text, maxChars) {
  const s = String(text || '');
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}… [truncated]`;
}

const NO_FABRICATION = `Use ONLY the real data below. Never invent visuals, quotes, statistics, people, or events that are not present in the transcript excerpt or frame notes. If the transcript is empty or no frame notes exist, say so in the rationale and base everything on the file metadata only. Do not include markdown fences.`;

// Full video-grounded metadata prompt (Phase 3). Used by analyze-media and
// by the ai.metadata automation step when a media asset is attached.
export function buildVideoAnalysisPrompt({ metadata = {}, transcript = null, frameNotes = [], visualSummary = null, hints = {}, platform = 'youtube' } = {}) {
  const system = `You are Modulate, a social content assistant. Return ONLY valid JSON matching the requested schema. ${NO_FABRICATION}`;
  const lines = [];
  lines.push(`Real file metadata (JSON): ${JSON.stringify({
    filename: metadata.filename || null,
    mime_type: metadata.mime_type || null,
    size_bytes: metadata.size_bytes || null,
    duration_sec: metadata.duration_sec ?? null,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    orientation: metadata.orientation || null,
    aspect_ratio: metadata.aspect_ratio ?? null,
  })}`);
  lines.push(`Platform: ${platform}. Content type: ${hints.content_type || 'auto'}.`);
  lines.push(`Hints from user: ${JSON.stringify(hints || {})}.`);
  if (transcript) {
    lines.push(`Video transcript (real spoken words, excerpt): ${JSON.stringify(truncateText(transcript, transcriptExcerptChars()))}`);
  } else {
    lines.push('Video transcript: not available (no speech-to-text result for this asset).');
  }
  if (visualSummary) {
    lines.push(`What is actually visible in the video (summary of real frames): ${JSON.stringify(truncateText(visualSummary, frameNotesExcerptChars()))}`);
  }
  if (Array.isArray(frameNotes) && frameNotes.length) {
    const notes = frameNotes
      .filter((n) => n && n.note)
      .map((n) => `[~${n.approxTimestampSec ?? n.timestamp ?? '?'}s] ${n.note}`)
      .join(' | ');
    if (notes) lines.push(`Frame notes (real frames, approximate timestamps): ${JSON.stringify(truncateText(notes, frameNotesExcerptChars()))}`);
  } else {
    lines.push('Frame notes: not available (no vision result for this asset).');
  }
  lines.push(`
Return JSON with keys:
- summary: string describing the media in one sentence (only from the data above).
- suggestions: {
    title: string (${platform === 'youtube' ? '<=100' : '<=90'} chars),
    description: string (200-800 chars, no fabricated stats),
    caption: string (<=250 chars),
    tags: string[] (3-8 short words),
    hashtags: string[] (5-10 hashtags starting with #),
    cta: string,
    thumbnail_concepts: [ { idea: string, palette: string } ] (2 items, grounded in real scenes when frame notes exist),
    platform_variant: object (title + caption + any platform-specific fields)
  }
- rationale: string (1-2 sentences explaining choices based on the data above).
- grounded_from: array listing which inputs were actually used, chosen from ["metadata", "transcript", "frames"].`);
  return { system, user: lines.join('\n') };
}

// Single-frame vision prompt: describe only what is visibly present.
export function buildVisionNotePrompt() {
  return {
    system: 'You describe video frames factually. Never invent text, people, objects, or actions you cannot see. If the frame is black, blurry, or unreadable, say so plainly.',
    user: 'Describe only what is visibly present in this frame in 1-2 short sentences: main subject, setting, any clearly readable on-screen text, and dominant colors. Do not guess context beyond the frame.',
  };
}

// Visual-summary prompt: compress per-frame notes into one summary.
// Falls back to joining notes when no text provider is available (see vision.js).
export function buildVisualSummaryPrompt(notes) {
  const joined = (notes || []).filter((n) => n && n.note).map((n) => `[~${n.approxTimestampSec ?? '?'}s] ${n.note}`).join('\n');
  return {
    system: `You summarize video frame notes. ${NO_FABRICATION} Return ONLY valid JSON: { "summary": string }.`,
    user: `Frame notes (real observations):\n${joined}\n\nWrite one summary paragraph (max 500 chars) of what the video actually shows, in chronological order. Mention only what the notes state.`,
  };
}

// Thumbnail image prompt: grounded in a real scene, title text only.
export function buildThumbnailImagePrompt({ concept = '', title = '', sceneNote = '' } = {}) {
  const parts = ['Bold, high-contrast video thumbnail, readable at small size.'];
  if (title) parts.push(`On-screen title text (exact, nothing else as text): "${String(title).slice(0, 60)}".`);
  if (sceneNote) parts.push(`Scene to depict (real frame content, do not invent new subjects): ${String(sceneNote).slice(0, 300)}`);
  if (concept) parts.push(`Style concept: ${String(concept).slice(0, 300)}`);
  parts.push('No logos, no watermarks, no invented people or text beyond the title above.');
  return parts.join(' ');
}
