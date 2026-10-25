// FFmpeg adapters for video analysis. Uses the system ffmpeg/ffprobe binary
// (FFMPEG_PATH / FFPROBE_PATH env overrides). All commands run via spawn with
// drained stdio so long videos cannot fill the output buffer, and a timeout
// so a stuck encode cannot hang a job forever.
//
// Graceful degradation: if the binary is missing, every function throws a
// NOT_CONFIGURED error with a clear message — callers turn that into a
// "skipped" step, never a fabricated result.

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ffmpegPath, ffprobePath, ffmpegTimeoutMs } from './config.js';

export class NotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.code = 'NOT_CONFIGURED';
  }
}

function runCommand(cmd, args, { timeoutMs = ffmpegTimeoutMs() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrTail = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    if (child.stderr) {
      child.stderr.on('data', (d) => {
        stderrTail = `${stderrTail}${d.toString()}`.slice(-2000);
      });
    }
    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new NotConfiguredError(`FFmpeg binary not found: "${cmd}". Install ffmpeg or set FFMPEG_PATH/FFPROBE_PATH.`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`FFmpeg timed out after ${timeoutMs}ms: ${cmd} ${args.join(' ')}`));
      } else if (code === 0) {
        resolve({ code });
      } else {
        reject(new Error(`FFmpeg failed (exit ${code}): ${stderrTail || cmd}`));
      }
    });
  });
}

export async function checkFfmpeg() {
  try {
    await runCommand(ffmpegPath(), ['-version'], { timeoutMs: 15000 });
    await runCommand(ffprobePath(), ['-version'], { timeoutMs: 15000 });
    return { ok: true, ffmpeg: ffmpegPath(), ffprobe: ffprobePath() };
  } catch (e) {
    if (e instanceof NotConfiguredError) return { ok: false, reason: e.message };
    return { ok: false, reason: e?.message || 'FFmpeg check failed' };
  }
}

// Duration in seconds via ffprobe (null when it cannot be determined).
export async function probeDuration(filePath) {
  try {
    const out = await new Promise((resolve, reject) => {
      const child = spawn(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => {
        if (err.code === 'ENOENT') reject(new NotConfiguredError(`FFprobe binary not found: "${ffprobePath()}".`));
        else reject(err);
      });
      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`ffprobe failed: ${stderr.slice(-500)}`));
      });
    });
    const v = Number(out);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch (e) {
    if (e instanceof NotConfiguredError) throw e;
    return null;
  }
}

// Extract mono 16kHz WAV audio (Whisper-friendly) from a video file.
export async function extractAudio(videoPath, outWavPath) {
  await runCommand(ffmpegPath(), ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', outWavPath]);
  return outWavPath;
}

// Extract JPEG frames with an fps filter: one frame every intervalSec,
// at most maxFrames. Returns [{ index, file, approxTimestampSec }].
export async function extractFrames(videoPath, outDir, { intervalSec = 12, maxFrames = 16 } = {}) {
  const interval = Number(intervalSec) > 0 ? Number(intervalSec) : 12;
  const cap = Number(maxFrames) > 0 ? Math.floor(Number(maxFrames)) : 16;
  const pattern = join(outDir, 'frame-%03d.jpg');
  await runCommand(ffmpegPath(), ['-y', '-i', videoPath, '-vf', `fps=1/${interval}`, '-frames:v', String(cap), '-q:v', '3', pattern]);
  const names = (await readdir(outDir)).filter((n) => /^frame-\d+\.jpg$/.test(n)).sort();
  return names.map((name, i) => ({
    index: i,
    file: join(outDir, name),
    approxTimestampSec: i * interval,
  }));
}
