// OpenAI-compatible image generation client (POST /images/generations).
// Works with any provider exposing that endpoint. Handles both b64_json and
// URL outputs. No key/model -> NotConfiguredError (callers degrade to
// text-only thumbnail concepts, never a fake image).

import { imageConfig } from './config.js';
import { NotConfiguredError } from './ffmpeg.js';

export async function generateImages(prompt, { config = imageConfig(), fetchImpl = fetch } = {}) {
  if (!config.apiKey) {
    throw new NotConfiguredError('Image generation is not configured. Set VIDEO_IMAGE_API_KEY (or OPENAI_API_KEY) to enable real thumbnail images.');
  }
  if (!config.model) {
    throw new NotConfiguredError('Image generation model is not configured. Set VIDEO_IMAGE_MODEL to enable real thumbnail images.');
  }
  const url = `${config.baseUrl}/images/generations`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300000);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, prompt, n: config.count, size: config.size }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Image generation failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const items = Array.isArray(json.data) ? json.data : [];
    return items.map((item, i) => ({
      index: i,
      b64: typeof item.b64_json === 'string' ? item.b64_json : null,
      url: typeof item.url === 'string' ? item.url : null,
      revisedPrompt: item.revised_prompt || null,
    }));
  } finally {
    clearTimeout(timer);
  }
}
