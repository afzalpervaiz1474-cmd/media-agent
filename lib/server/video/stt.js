// Whisper-compatible speech-to-text client (OpenAI-compatible
// POST /audio/transcriptions with multipart form data).
// Works with OpenAI, or any self-hosted Whisper behind an OpenAI-like
// endpoint (set VIDEO_STT_BASE_URL). No key -> NotConfiguredError, so
// callers degrade to "skipped" instead of inventing a transcript.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { sttConfig } from './config.js';
import { NotConfiguredError } from './ffmpeg.js';

export async function transcribeAudio(audioPath, { config = sttConfig(), fetchImpl = fetch } = {}) {
  if (!config.apiKey) {
    throw new NotConfiguredError('Speech-to-text is not configured. Set VIDEO_STT_API_KEY (or OPENAI_API_KEY) to enable transcription.');
  }
  const bytes = await readFile(audioPath);
  const form = new FormData();
  form.append('model', config.model);
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), basename(audioPath) || 'audio.wav');
  const url = `${config.baseUrl}/audio/transcriptions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300000);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Speech-to-text failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const text = typeof json.text === 'string' ? json.text : '';
    return {
      text,
      language: json.language || null,
      duration: json.duration ?? null,
      segments: Array.isArray(json.segments) ? json.segments : null,
    };
  } finally {
    clearTimeout(timer);
  }
}
