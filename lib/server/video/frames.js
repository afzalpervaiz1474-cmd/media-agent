// Pure frame-timestamp selection for video analysis.
// Frames are pulled with an fps filter (see ffmpeg.js), so timestamps are
// approximate by design: frame i lands near i * intervalSec, starting at 0.
// Kept side-effect free so tests can import this without FFmpeg or Supabase.

// Evenly spaced frame timestamps for a video of durationSec.
// - At least 1 frame (the middle of very short clips).
// - At most maxFrames, spaced intervalSec apart starting at 0s.
export function selectFrameTimestamps(durationSec, { intervalSec = 12, maxFrames = 16 } = {}) {
  const duration = Number(durationSec);
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const interval = Number(intervalSec) > 0 ? Number(intervalSec) : 12;
  const cap = Number(maxFrames) > 0 ? Math.floor(Number(maxFrames)) : 16;
  const count = Math.max(1, Math.min(cap, Math.floor(duration / interval) + 1));
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = i * interval;
    if (t >= duration) break;
    out.push(t);
  }
  return out.length ? out : [0];
}

// Attach approximate timestamps to extracted frame files (ordered by index).
export function labelFrames(files, intervalSec = 12) {
  return (files || []).map((file, i) => ({
    index: i,
    file,
    approxTimestampSec: i * intervalSec,
  }));
}
