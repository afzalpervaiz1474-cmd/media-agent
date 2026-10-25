import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  maxVideoMinutes, frameIntervalSec, maxFrames, sttConfig, visionConfig, imageConfig,
} from '../lib/server/video/config.js';
import { selectFrameTimestamps, labelFrames } from '../lib/server/video/frames.js';
import {
  truncateText, buildVideoAnalysisPrompt, buildVisionNotePrompt, buildThumbnailImagePrompt,
} from '../lib/server/video/prompts.js';
import { transcribeAudio } from '../lib/server/video/stt.js';
import { generateImages } from '../lib/server/video/images.js';
import { describeFrames, assertVisionConfigured, visionOverrideCandidate } from '../lib/server/video/vision.js';
import { getVideoAnalysis, buildAnalysisPatch } from '../lib/server/video/analysis-store.js';
import { claimAndRunMediaJobs } from '../lib/server/video/worker-core.js';
import { NotConfiguredError } from '../lib/server/video/ffmpeg.js';

const originalEnv = { ...process.env };
beforeEach(() => { process.env = { ...originalEnv }; });
afterEach(() => { process.env = { ...originalEnv }; });

describe('config defaults and overrides', () => {
  it('defaults to 10 minutes, 12s frames, 16 max frames', () => {
    delete process.env.MAX_VIDEO_MINUTES; delete process.env.VIDEO_FRAME_INTERVAL_SEC; delete process.env.VIDEO_MAX_FRAMES;
    expect(maxVideoMinutes()).toBe(10);
    expect(frameIntervalSec()).toBe(12);
    expect(maxFrames()).toBe(16);
  });

  it('env overrides win and invalid values fall back to defaults', () => {
    process.env.MAX_VIDEO_MINUTES = '25';
    process.env.VIDEO_FRAME_INTERVAL_SEC = '15';
    process.env.VIDEO_MAX_FRAMES = '8';
    expect(maxVideoMinutes()).toBe(25);
    expect(frameIntervalSec()).toBe(15);
    expect(maxFrames()).toBe(8);
    process.env.MAX_VIDEO_MINUTES = 'not-a-number';
    expect(maxVideoMinutes()).toBe(10);
  });

  it('stt/vision/image configs fall back across env keys', () => {
    delete process.env.VIDEO_STT_API_KEY; delete process.env.VIDEO_IMAGE_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(sttConfig().apiKey).toBe('sk-test');
    expect(imageConfig().apiKey).toBe('sk-test');
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = 'or-test';
    expect(visionConfig().apiKey).toBe('or-test');
    process.env.VIDEO_VISION_MODEL = 'some/vision-model';
    expect(visionConfig().model).toBe('some/vision-model');
  });
});

describe('selectFrameTimestamps', () => {
  it('returns a single frame for short clips', () => {
    expect(selectFrameTimestamps(6, { intervalSec: 12, maxFrames: 16 })).toEqual([0]);
  });

  it('spaces frames by the interval', () => {
    expect(selectFrameTimestamps(120, { intervalSec: 12, maxFrames: 16 }))
      .toEqual([0, 12, 24, 36, 48, 60, 72, 84, 96, 108]);
  });

  it('caps at maxFrames for long videos', () => {
    const ts = selectFrameTimestamps(600, { intervalSec: 12, maxFrames: 16 });
    expect(ts).toHaveLength(16);
    expect(ts[15]).toBe(180);
  });

  it('handles unknown durations', () => {
    expect(selectFrameTimestamps(null)).toEqual([0]);
    expect(selectFrameTimestamps(0)).toEqual([0]);
  });

  it('labelFrames attaches approximate timestamps', () => {
    expect(labelFrames(['a.jpg', 'b.jpg'], 12)).toEqual([
      { index: 0, file: 'a.jpg', approxTimestampSec: 0 },
      { index: 1, file: 'b.jpg', approxTimestampSec: 12 },
    ]);
  });
});

describe('prompt builders (no-fabrication rule)', () => {
  it('includes transcript + frame notes and forbids invention', () => {
    const { system, user } = buildVideoAnalysisPrompt({
      metadata: { filename: 'clip.mp4', duration_sec: 60 },
      transcript: 'hello world, this is a test',
      frameNotes: [{ approxTimestampSec: 0, note: 'a red bicycle' }],
      visualSummary: 'a person rides a red bicycle',
      hints: {}, platform: 'youtube',
    });
    expect(system).toMatch(/Never invent/);
    expect(user).toMatch(/hello world/);
    expect(user).toMatch(/red bicycle/);
    expect(user).toMatch(/grounded_from/);
  });

  it('says plainly when transcript/frames are missing', () => {
    const { user } = buildVideoAnalysisPrompt({ metadata: { filename: 'x.mp4' }, hints: {} });
    expect(user).toMatch(/not available/);
  });

  it('truncates long transcripts instead of blowing up context', () => {
    const long = 'word '.repeat(2000);
    const { user } = buildVideoAnalysisPrompt({ metadata: {}, transcript: long, hints: {} });
    expect(user).toMatch(/\[truncated\]/);
    expect(user.length).toBeLessThan(long.length);
  });

  it('truncateText keeps short text intact', () => {
    expect(truncateText('short', 100)).toBe('short');
  });

  it('vision prompt restricts to visible content', () => {
    const p = buildVisionNotePrompt();
    expect(p.system).toMatch(/cannot see/);
    expect(p.user).toMatch(/visibly present/);
  });

  it('thumbnail prompt carries exact title and forbids invented text', () => {
    const p = buildThumbnailImagePrompt({ title: 'My Title', sceneNote: 'a bicycle', concept: 'bold' });
    expect(p).toMatch(/My Title/);
    expect(p).toMatch(/beyond the title above/);
  });
});

describe('provider adapters degrade without keys (never fabricate)', () => {
  it('stt without a key throws NOT_CONFIGURED and never fetches', async () => {
    const fetchImpl = vi.fn();
    await expect(transcribeAudio('/tmp/nope.wav', {
      config: { apiKey: '', baseUrl: 'https://example.invalid', model: 'whisper-1' },
      fetchImpl,
    })).rejects.toBeInstanceOf(NotConfiguredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('image generation without key or model throws NOT_CONFIGURED', async () => {
    await expect(generateImages('x', {
      config: { apiKey: '', baseUrl: 'https://example.invalid', model: 'm', size: '1024x1024', count: 3 },
      fetchImpl: vi.fn(),
    })).rejects.toBeInstanceOf(NotConfiguredError);
    await expect(generateImages('x', {
      config: { apiKey: 'k', baseUrl: 'https://example.invalid', model: '', size: '1024x1024', count: 3 },
      fetchImpl: vi.fn(),
    })).rejects.toBeInstanceOf(NotConfiguredError);
  });

  it('vision without key/model throws before any provider import', async () => {
    expect(() => assertVisionConfigured({ apiKey: '', baseUrl: '', model: '' })).toThrow(NotConfiguredError);
    expect(() => assertVisionConfigured({ apiKey: 'k', baseUrl: '', model: '' })).toThrow(NotConfiguredError);
    await expect(describeFrames([], { config: { apiKey: '', baseUrl: '', model: '' } }))
      .rejects.toBeInstanceOf(NotConfiguredError);
  });

  it('vision override candidate carries env model/key (never user text model)', () => {
    const cand = visionOverrideCandidate({ apiKey: 'k', baseUrl: 'https://example.invalid', model: 'v/model' });
    expect(cand).toMatchObject({ source: 'env', provider: 'openrouter', model: 'v/model', _key: 'k' });
  });
});

describe('analysis store (columns vs metadata fallback)', () => {
  it('reads metadata.video_analysis when columns are absent', () => {
    const stored = { transcript: 'hello', transcriptStatus: 'ok' };
    expect(getVideoAnalysis({ metadata: { video_analysis: stored } })).toEqual(stored);
  });

  it('reads dedicated columns when the migration was applied', () => {
    const asset = {
      transcript: 'hi', transcript_status: 'ok', transcript_reason: null,
      visual_summary: 'summary', frame_notes: [], thumbnail_options: [],
      selected_thumbnail_path: null,
    };
    const out = getVideoAnalysis(asset);
    expect(out.transcript).toBe('hi');
    expect(out.visualSummary).toBe('summary');
  });

  it('returns null when neither path has data', () => {
    expect(getVideoAnalysis({ metadata: {} })).toBeNull();
    expect(getVideoAnalysis({
      transcript: null, visual_summary: null, frame_notes: [], thumbnail_options: [],
      selected_thumbnail_path: null,
    })).toBeNull();
  });

  it('buildAnalysisPatch preserves existing metadata on the JSONB path', () => {
    const patch = buildAnalysisPatch({ metadata: { foo: 1 } }, { transcript: 'x' });
    expect(patch.metadata.foo).toBe(1);
    expect(patch.metadata.video_analysis.transcript).toBe('x');
  });

  it('buildAnalysisPatch writes columns on the migrated path', () => {
    const patch = buildAnalysisPatch({ transcript: null }, { transcript: 'x', visualSummary: 's' });
    expect(patch.transcript).toBe('x');
    expect(patch.visual_summary).toBe('s');
    expect(patch.metadata).toBeUndefined();
  });
});

describe('worker-core claim logic', () => {
  function makeJobsFake(queued, claimedMap) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            like: () => ({
              order: () => ({
                limit: async () => ({ data: queued, error: null }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: (_col, val) => ({
            eq: () => ({
              select: async () => ({ data: claimedMap[val] ? [{ id: val }] : [], error: null }),
            }),
          }),
        }),
      }),
    };
  }

  it('claims only unclaimed jobs and runs each once', async () => {
    const queued = [
      { id: 'a', kind: 'media.analyze_video' },
      { id: 'b', kind: 'media.transcribe' },
    ];
    const fake = makeJobsFake(queued, { a: true });
    const runJob = vi.fn(async (id) => ({ status: 'COMPLETED', id }));
    const result = await claimAndRunMediaJobs(fake, runJob, { batch: 5 });
    expect(result.claimed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(runJob).toHaveBeenCalledWith('a');
    expect(result.results[0]).toMatchObject({ id: 'a', status: 'COMPLETED' });
  });

  it('surfaces poll errors instead of silently doing nothing', async () => {
    const fake = {
      from: () => ({
        select: () => ({
          eq: () => ({
            like: () => ({
              order: () => ({
                limit: async () => ({ data: null, error: { message: 'boom' } }),
              }),
            }),
          }),
        }),
      }),
    };
    await expect(claimAndRunMediaJobs(fake, vi.fn())).rejects.toThrow(/poll failed/);
  });
});
