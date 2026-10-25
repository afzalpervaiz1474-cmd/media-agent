// Video-analysis configuration. Every value is overridable via env var —
// nothing here hard-codes a provider, model, or limit the user cannot change.
// All getters read process.env at call time (not import time) so tests can
// override env per case.

export function maxVideoMinutes() {
  const v = Number(process.env.MAX_VIDEO_MINUTES || 10);
  return Number.isFinite(v) && v > 0 ? v : 10;
}

export function frameIntervalSec() {
  const v = Number(process.env.VIDEO_FRAME_INTERVAL_SEC || 12);
  return Number.isFinite(v) && v > 0 ? v : 12;
}

export function maxFrames() {
  const v = Number(process.env.VIDEO_MAX_FRAMES || 16);
  return Number.isFinite(v) && v > 0 ? v : 16;
}

export function ffmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

export function ffprobePath() {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

export function ffmpegTimeoutMs() {
  const v = Number(process.env.VIDEO_FFMPEG_TIMEOUT_MS || 300000);
  return Number.isFinite(v) && v > 0 ? v : 300000;
}

// Whisper-compatible speech-to-text (OpenAI-compatible /audio/transcriptions).
// Key falls back to OPENAI_API_KEY; self-hosted Whisper behind an OpenAI-like
// endpoint works by setting VIDEO_STT_BASE_URL.
export function sttConfig() {
  return {
    apiKey: process.env.VIDEO_STT_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.VIDEO_STT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.VIDEO_STT_MODEL || 'whisper-1',
  };
}

// Vision model for describing frames. Deliberately env-only in v1: the model
// must support image input, which the user's text-model setting cannot
// guarantee. VIDEO_VISION_MODEL is required; without it vision is skipped
// with a clear "not configured" status (never silently run on a text model).
export function visionConfig() {
  return {
    apiKey: process.env.VIDEO_VISION_API_KEY || process.env.OPENROUTER_API_KEY || '',
    baseUrl: (process.env.VIDEO_VISION_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    model: process.env.VIDEO_VISION_MODEL || '',
  };
}

// OpenAI-compatible image generation for real thumbnail images.
// Works with any provider exposing /images/generations.
export function imageConfig() {
  return {
    apiKey: process.env.VIDEO_IMAGE_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.VIDEO_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.VIDEO_IMAGE_MODEL || '',
    size: process.env.VIDEO_IMAGE_SIZE || '1024x1024',
    count: (() => {
      const v = Number(process.env.VIDEO_THUMBNAIL_COUNT || 3);
      return Number.isFinite(v) && v > 0 ? Math.min(v, 5) : 3;
    })(),
  };
}

export function workerConfig() {
  const pollMs = Number(process.env.WORKER_POLL_MS || 5000);
  const batch = Number(process.env.WORKER_BATCH || 5);
  return {
    pollMs: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 5000,
    batch: Number.isFinite(batch) && batch > 0 ? batch : 5,
  };
}

// Prompt-size guards so a long transcript cannot blow up the model context.
export function transcriptExcerptChars() {
  const v = Number(process.env.VIDEO_TRANSCRIPT_EXCERPT_CHARS || 4000);
  return Number.isFinite(v) && v > 0 ? v : 4000;
}

export function frameNotesExcerptChars() {
  const v = Number(process.env.VIDEO_FRAME_NOTES_EXCERPT_CHARS || 2000);
  return Number.isFinite(v) && v > 0 ? v : 2000;
}
