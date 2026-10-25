// Video-analysis pipeline: download -> audio -> transcript -> frames ->
// vision notes -> visual summary -> thumbnail images -> save.
// Every AI step degrades independently: a missing key, missing FFmpeg
// binary, or failed provider call records a "skipped"/"failed" step and the
// job still completes with whatever real data exists. NOTHING is ever
// fabricated to fill a gap. Only hard failures abort the job: the asset
// cannot be downloaded, or the video exceeds the v1 length limit.
//
// All side-effecting collaborators are injectable via `deps` so the smoke
// script and tests can run the pipeline without keys or a live Supabase.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import {
  maxVideoMinutes, frameIntervalSec, maxFrames, imageConfig,
} from './config.js';
import * as ffmpeg from './ffmpeg.js';
import { transcribeAudio } from './stt.js';
import { describeFrames, summarizeFrameNotes } from './vision.js';
import { generateImages } from './images.js';
import { buildThumbnailImagePrompt } from './prompts.js';
import {
  getVideoAnalysis, saveVideoAnalysis, downloadAssetBuffer, uploadThumbnail,
} from './analysis-store.js';

const DEFAULT_DEPS = {
  checkFfmpeg: ffmpeg.checkFfmpeg,
  probeDuration: ffmpeg.probeDuration,
  extractAudio: ffmpeg.extractAudio,
  extractFrames: ffmpeg.extractFrames,
  transcribeAudio,
  describeFrames,
  summarizeFrameNotes,
  generateImages,
};

function stepErrorReason(e) {
  return e?.message ? String(e.message).slice(0, 240) : 'Step failed';
}

// Runs one step, recording ok/skipped/failed. NOT_CONFIGURED -> skipped.
async function runStep(steps, name, fn) {
  try {
    const value = await fn();
    steps.push({ step: name, status: 'ok' });
    return { status: 'ok', value };
  } catch (e) {
    const skipped = e?.code === 'NOT_CONFIGURED';
    steps.push({ step: name, status: skipped ? 'skipped' : 'failed', reason: stepErrorReason(e) });
    return { status: skipped ? 'skipped' : 'failed', value: null };
  }
}

function videoExt(filename) {
  const ext = extname(String(filename || '')).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.mp4';
}

function baseTitle(filename) {
  return String(filename || 'Untitled clip').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Untitled clip';
}

async function withTmpDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'modulate-video-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function downloadToTmp(supabase, asset, dir) {
  const buffer = await downloadAssetBuffer(supabase, asset);
  const file = join(dir, `input${videoExt(asset.filename)}`);
  await writeFile(file, buffer);
  return file;
}

function assertDurationOk(durationSec) {
  const limitMin = maxVideoMinutes();
  if (durationSec != null && durationSec > limitMin * 60) {
    const mins = (durationSec / 60).toFixed(1);
    throw new Error(`Video is ${mins} minutes; v1 limit is ${limitMin} minutes (set MAX_VIDEO_MINUTES to change).`);
  }
}

// --- Full pipeline -------------------------------------------------------

export async function analyzeVideo({ supabase, asset, userId = null, hints = {}, deps = {} } = {}) {
  if (!supabase) throw new Error('analyzeVideo requires a supabase client.');
  if (!asset) throw new Error('analyzeVideo requires a media asset.');
  const d = { ...DEFAULT_DEPS, ...deps };
  const steps = [];
  const previous = getVideoAnalysis(asset) || {};
  const limitMin = maxVideoMinutes();

  const ff = await d.checkFfmpeg();
  if (!ff.ok) {
    steps.push({ step: 'ffmpeg', status: 'skipped', reason: ff.reason });
    steps.push({ step: 'audio', status: 'skipped', reason: ff.reason });
    steps.push({ step: 'transcribe', status: 'skipped', reason: ff.reason });
    steps.push({ step: 'frames', status: 'skipped', reason: ff.reason });
    steps.push({ step: 'vision', status: 'skipped', reason: ff.reason });
    // Thumbnails do not need FFmpeg; try them, then save a metadata-only result.
    const thumbs = await maybeThumbnails({ supabase, asset, userId, sceneNote: null, title: baseTitle(asset.filename), steps, d });
    const analysis = {
      ...previous,
      transcript: previous.transcript ?? null,
      transcriptStatus: 'skipped',
      transcriptReason: ff.reason,
      frameNotes: [],
      frameStatus: 'skipped',
      visualSummary: previous.visualSummary ?? null,
      thumbnailOptions: thumbs ?? previous.thumbnailOptions ?? [],
      steps,
      analyzed_at: new Date().toISOString(),
    };
    await saveVideoAnalysis(supabase, asset, analysis);
    return { analysis, steps };
  }
  steps.push({ step: 'ffmpeg', status: 'ok' });

  return withTmpDir(async (dir) => {
    const videoPath = await downloadToTmp(supabase, asset, dir);
    steps.push({ step: 'download', status: 'ok' });

    let durationSec = asset.duration_sec != null ? Number(asset.duration_sec) : null;
    if (durationSec == null || !(durationSec > 0)) {
      const probed = await runStep(steps, 'probe_duration', () => d.probeDuration(videoPath));
      durationSec = probed.value;
      if (durationSec == null) steps.push({ step: 'duration_limit', status: 'skipped', reason: 'Duration could not be determined; proceeding (frame/transcript caps still bound cost).' });
    }
    assertDurationOk(durationSec);

    const audio = await runStep(steps, 'audio', () => d.extractAudio(videoPath, join(dir, 'audio.wav')));
    let transcript = null;
    let transcriptStatus = 'skipped';
    let transcriptReason = null;
    if (audio.status === 'ok') {
      const t = await runStep(steps, 'transcribe', () => d.transcribeAudio(audio.value));
      transcriptStatus = t.status;
      if (t.status === 'ok') {
        transcript = t.value?.text || null;
        if (!transcript) transcriptStatus = 'skipped';
      } else {
        transcriptReason = steps[steps.length - 1]?.reason || null;
      }
    } else {
      steps.push({ step: 'transcribe', status: 'skipped', reason: 'Audio extraction failed; transcription skipped.' });
      transcriptReason = 'Audio extraction failed; transcription skipped.';
    }

    const frames = await runStep(steps, 'frames', () => d.extractFrames(videoPath, dir, {
      intervalSec: frameIntervalSec(), maxFrames: maxFrames(),
    }));
    let frameNotes = [];
    let frameStatus = 'skipped';
    let visualSummary = null;
    if (frames.status === 'ok' && (frames.value || []).length) {
      const v = await runStep(steps, 'vision', () => d.describeFrames(frames.value, { userId }));
      frameNotes = v.value || [];
      const okNotes = frameNotes.filter((n) => n && n.note);
      frameStatus = v.status === 'skipped' ? 'skipped'
        : okNotes.length === frameNotes.length && frameNotes.length > 0 ? 'ok'
        : okNotes.length > 0 ? 'partial' : 'failed';
      if (okNotes.length) {
        const s = await runStep(steps, 'visual_summary', () => d.summarizeFrameNotes(okNotes, { userId }));
        visualSummary = s.value || null;
      } else {
        steps.push({ step: 'visual_summary', status: 'skipped', reason: 'No usable frame notes.' });
      }
    } else if (frames.status === 'ok') {
      steps.push({ step: 'vision', status: 'skipped', reason: 'No frames were extracted.' });
    } else {
      steps.push({ step: 'vision', status: 'skipped', reason: 'Frame extraction failed; vision skipped.' });
    }

    const sceneNote = visualSummary || (frameNotes.find((n) => n && n.note)?.note) || null;
    const thumbs = await maybeThumbnails({
      supabase, asset, userId, sceneNote, title: baseTitle(asset.filename), steps, d,
    });

    const analysis = {
      ...previous,
      transcript: transcript ?? previous.transcript ?? null,
      transcriptStatus,
      transcriptReason,
      frameNotes,
      frameStatus,
      visualSummary: visualSummary ?? previous.visualSummary ?? null,
      thumbnailOptions: thumbs ?? previous.thumbnailOptions ?? [],
      steps,
      analyzed_at: new Date().toISOString(),
    };
    await saveVideoAnalysis(supabase, asset, analysis);
    return { analysis, steps };
  });
}

async function maybeThumbnails({ supabase, asset, userId, sceneNote, title, steps, d }) {
  void userId;
  const t = await runStep(steps, 'thumbnail_images', async () => {
    const cfg = imageConfig();
    const prompt = buildThumbnailImagePrompt({ title, sceneNote: sceneNote || '' });
    const generated = await d.generateImages(prompt, { config: cfg });
    const options = [];
    for (const item of generated) {
      let buffer = null;
      if (item.b64) buffer = Buffer.from(item.b64, 'base64');
      else if (item.url) {
        const res = await fetch(item.url);
        if (!res.ok) throw new Error(`Thumbnail download failed (HTTP ${res.status}).`);
        buffer = Buffer.from(await res.arrayBuffer());
      }
      if (!buffer) continue;
      const uploaded = await uploadThumbnail(supabase, asset.id, buffer, `thumb-${item.index}.png`);
      options.push({ ...uploaded, prompt, model: cfg.model, index: item.index });
    }
    return options;
  });
  return t.status === 'ok' ? t.value : null;
}

// --- Single-purpose jobs --------------------------------------------------

export async function transcribeVideo({ supabase, asset, deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const previous = getVideoAnalysis(asset) || {};
  const ff = await d.checkFfmpeg();
  if (!ff.ok) {
    // No FFmpeg -> nothing to transcribe, but never fail the job with a
    // misleading error: record the skip and return the (unchanged) analysis.
    const analysis = {
      ...previous,
      transcriptStatus: 'skipped',
      transcriptReason: ff.reason,
      steps: [{ step: 'transcribe', status: 'skipped', reason: ff.reason }],
      analyzed_at: new Date().toISOString(),
    };
    await saveVideoAnalysis(supabase, asset, analysis);
    return { analysis, transcript: analysis.transcript ?? null };
  }
  let out;
  try {
    out = await withTmpDir(async (dir) => {
      const videoPath = await downloadToTmp(supabase, asset, dir);
      const durationSec = asset.duration_sec != null ? Number(asset.duration_sec) : await d.probeDuration(videoPath);
      assertDurationOk(durationSec);
      const audioPath = await d.extractAudio(videoPath, join(dir, 'audio.wav'));
      return d.transcribeAudio(audioPath);
    });
  } catch (e) {
    if (e?.code === 'NOT_CONFIGURED') {
      const analysis = {
        ...previous,
        transcriptStatus: 'skipped',
        transcriptReason: e.message,
        steps: [{ step: 'transcribe', status: 'skipped', reason: e.message }],
        analyzed_at: new Date().toISOString(),
      };
      await saveVideoAnalysis(supabase, asset, analysis);
      return { analysis, transcript: analysis.transcript ?? null };
    }
    throw e;
  }
  const analysis = {
    ...previous,
    transcript: out.text || null,
    transcriptStatus: out.text ? 'ok' : 'skipped',
    transcriptReason: out.text ? null : 'Transcription returned empty text.',
    steps: [{ step: 'transcribe', status: out.text ? 'ok' : 'skipped' }],
    analyzed_at: new Date().toISOString(),
  };
  await saveVideoAnalysis(supabase, asset, analysis);
  return { analysis, transcript: analysis.transcript };
}

export async function extractVideoFrames({ supabase, asset, userId = null, deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const steps = [];
  const previous = getVideoAnalysis(asset) || {};
  const ff = await d.checkFfmpeg();
  if (!ff.ok) {
    const analysis = {
      ...previous,
      frameNotes: [],
      frameStatus: 'skipped',
      steps: [{ step: 'frames', status: 'skipped', reason: ff.reason }],
      analyzed_at: new Date().toISOString(),
    };
    await saveVideoAnalysis(supabase, asset, analysis);
    return { analysis, frames: [], frameNotes: [], visualSummary: null };
  }
  const out = await withTmpDir(async (dir) => {
    const videoPath = await downloadToTmp(supabase, asset, dir);
    const durationSec = asset.duration_sec != null ? Number(asset.duration_sec) : await d.probeDuration(videoPath);
    assertDurationOk(durationSec);
    const frames = await d.extractFrames(videoPath, dir, { intervalSec: frameIntervalSec(), maxFrames: maxFrames() });
    // Vision is optional: without a vision key the frames still exist and
    // the job completes with notes skipped (never fabricated).
    let notes = [];
    let visionStatus = 'skipped';
    try {
      notes = await d.describeFrames(frames, { userId });
      visionStatus = notes.filter((n) => n && n.note).length ? 'ok' : 'skipped';
    } catch (e) {
      steps.push({ step: 'vision', status: e?.code === 'NOT_CONFIGURED' ? 'skipped' : 'failed', reason: e?.message ? String(e.message).slice(0, 240) : 'Vision failed' });
    }
    const okNotes = notes.filter((n) => n && n.note);
    const summary = okNotes.length ? await d.summarizeFrameNotes(okNotes, { userId }) : null;
    return { frames, notes, summary, visionStatus };
  });
  const analysis = {
    ...previous,
    frameNotes: out.notes,
    frameStatus: out.notes.filter((n) => n && n.note).length ? 'ok' : 'skipped',
    visualSummary: out.summary ?? previous.visualSummary ?? null,
    steps: [...steps, { step: 'frames', status: 'ok' }, { step: 'vision', status: out.visionStatus }],
    analyzed_at: new Date().toISOString(),
  };
  await saveVideoAnalysis(supabase, asset, analysis);
  return { analysis, frames: out.frames, frameNotes: out.notes, visualSummary: out.summary };
}

export async function generateVideoThumbnails({ supabase, asset, concept = '', title = '', deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const previous = getVideoAnalysis(asset) || {};
  const sceneNote = previous.visualSummary || (previous.frameNotes || []).find((n) => n && n.note)?.note || null;
  const prompt = buildThumbnailImagePrompt({ concept, title: title || baseTitle(asset.filename), sceneNote: sceneNote || '' });
  let generated;
  try {
    generated = await d.generateImages(prompt, { config: imageConfig() });
  } catch (e) {
    if (e?.code === 'NOT_CONFIGURED') {
      const analysis = {
        ...previous,
        steps: [{ step: 'thumbnail_images', status: 'skipped', reason: e.message }],
        analyzed_at: new Date().toISOString(),
      };
      await saveVideoAnalysis(supabase, asset, analysis);
      return { analysis, thumbnails: previous.thumbnailOptions ?? [] };
    }
    throw e;
  }
  const options = [];
  for (const item of generated) {
    let buffer = null;
    if (item.b64) buffer = Buffer.from(item.b64, 'base64');
    else if (item.url) {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`Thumbnail download failed (HTTP ${res.status}).`);
      buffer = Buffer.from(await res.arrayBuffer());
    }
    if (!buffer) continue;
    const uploaded = await uploadThumbnail(supabase, asset.id, buffer, `thumb-${item.index}.png`);
    options.push({ ...uploaded, prompt, model: imageConfig().model, index: item.index });
  }
  const analysis = {
    ...previous,
    thumbnailOptions: options,
    selectedThumbnailPath: null,
    steps: [{ step: 'thumbnail_images', status: 'ok' }],
    analyzed_at: new Date().toISOString(),
  };
  await saveVideoAnalysis(supabase, asset, analysis);
  return { analysis, thumbnails: options };
}

export { baseTitle };
