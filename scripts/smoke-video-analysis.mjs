// End-to-end smoke test for video analysis (no keys, no live Supabase).
// Generates a tiny sample video with system ffmpeg, runs the real pipeline
// against a fake Supabase client, and asserts graceful degradation:
//   - audio extracted, frames extracted (real FFmpeg work)
//   - transcript / vision / thumbnails SKIPPED (no keys configured)
//   - NOTHING fabricated (transcript null, frame notes empty, no summary)
//   - duration limit enforced with a clear error
//
// Usage: node scripts/smoke-video-analysis.mjs
// Exit 0 = all checks pass, 1 = any check failed.

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, stat, readdir, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// No AI keys: every AI step must skip cleanly (never fabricate).
for (const k of ['VIDEO_STT_API_KEY', 'OPENAI_API_KEY', 'VIDEO_VISION_API_KEY', 'OPENROUTER_API_KEY', 'VIDEO_IMAGE_API_KEY', 'VIDEO_VISION_MODEL', 'VIDEO_IMAGE_MODEL']) {
  delete process.env[k];
}
process.env.MAX_VIDEO_MINUTES = '10';

const { analyzeVideo } = await import('../lib/server/video/pipeline.js');
const { probeDuration, extractAudio, extractFrames } = await import('../lib/server/video/ffmpeg.js');

const failures = [];
function check(name, cond, extra = '') {
  if (cond) console.log(`  PASS ${name}`);
  else { console.log(`  FAIL ${name} ${extra}`); failures.push(name); }
}

function makeFakeSupabase(videoBuffer) {
  const store = { saved: null, uploads: [] };
  return {
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([videoBuffer]), error: null }),
        upload: async (path) => { store.uploads.push(path); return { data: { path }, error: null }; },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://example.invalid/${path}` } }),
        createSignedUrl: async () => ({ data: { signedUrl: null }, error: null }),
      }),
    },
    from: () => ({
      update: (patch) => ({
        eq: async () => { store.saved = patch; return { data: [patch], error: null }; },
      }),
    }),
    __store: store,
  };
}

function makeSampleVideo(outPath) {
  const inputs = ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=320x180:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6'];
  const rest = ['-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', outPath];
  try {
    execFileSync('ffmpeg', [...inputs, '-c:v', 'libx264', ...rest], { stdio: 'ignore' });
  } catch {
    execFileSync('ffmpeg', [...inputs, '-c:v', 'mpeg4', ...rest], { stdio: 'ignore' });
  }
}

const dir = await mkdtemp(join(tmpdir(), 'modulate-smoke-'));
try {
  console.log('== sample video ==');
  const sample = join(dir, 'sample.mp4');
  makeSampleVideo(sample);
  const sampleStat = await stat(sample);
  check('sample video generated', sampleStat.size > 1000, `(size=${sampleStat.size})`);

  console.log('== ffprobe / ffmpeg adapters ==');
  const duration = await probeDuration(sample);
  check('probeDuration ~6s', duration != null && Math.abs(duration - 6) < 1, `(got ${duration})`);
  const wav = join(dir, 'audio.wav');
  await extractAudio(sample, wav);
  check('extractAudio produced a wav', (await stat(wav)).size > 1000);
  const framesDir = join(dir, 'frames');
  await mkdir(framesDir);
  const frames = await extractFrames(sample, framesDir, { intervalSec: 12, maxFrames: 16 });
  check('extractFrames produced >=1 frame', frames.length >= 1, `(got ${frames.length})`);
  check('frame files exist on disk', (await readdir(framesDir)).length >= 1);

  console.log('== full pipeline, no keys (graceful degradation) ==');
  const videoBuffer = await readFile(sample);
  const fake = makeFakeSupabase(videoBuffer);
  const asset = {
    id: 'smoke-asset-1', user_id: 'smoke-user', filename: 'smoke-sample.mp4',
    storage_path: 'uploads/smoke-sample.mp4', mime_type: 'video/mp4', kind: 'video',
    duration_sec: 6, width: 320, height: 180, metadata: {},
  };
  const { analysis, steps } = await analyzeVideo({ supabase: fake, asset, userId: 'smoke-user' });
  const stepStatus = (name) => (steps.find((s) => s.step === name) || {}).status;
  check('ffmpeg step ok', stepStatus('ffmpeg') === 'ok');
  check('audio step ok', stepStatus('audio') === 'ok');
  check('transcribe step skipped (no STT key)', stepStatus('transcribe') === 'skipped');
  check('frames step ok', stepStatus('frames') === 'ok');
  check('vision step skipped (no vision key)', stepStatus('vision') === 'skipped');
  check('thumbnail_images step skipped (no image key)', stepStatus('thumbnail_images') === 'skipped');
  check('no fabricated transcript', analysis.transcript === null);
  check('no fabricated frame notes', Array.isArray(analysis.frameNotes) && analysis.frameNotes.length === 0);
  check('no fabricated visual summary', analysis.visualSummary === null);
  check('no fabricated thumbnails', Array.isArray(analysis.thumbnailOptions) && analysis.thumbnailOptions.length === 0);
  check('analysis saved to metadata.video_analysis', !!fake.__store.saved?.metadata?.video_analysis);
  check('saved analysis matches returned analysis', fake.__store.saved?.metadata?.video_analysis?.transcriptStatus === 'skipped');

  console.log('== duration limit ==');
  let limitError = null;
  try {
    await analyzeVideo({ supabase: fake, asset: { ...asset, duration_sec: 660 }, userId: 'smoke-user' });
  } catch (e) {
    limitError = e;
  }
  check('11-minute video rejected with limit error', !!limitError && /limit/i.test(limitError.message || ''), `(${limitError?.message || 'no error'})`);
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

if (failures.length) {
  console.log(`\nSMOKE FAILED: ${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nSMOKE PASSED: all checks green.');
