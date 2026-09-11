import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';
import { generateStructured, isConfiguredFor, draftMetadata, draftVariants, draftThumbnails } from '../_ai.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const { kind = 'metadata', topic = '', audience = '', tone = '', platforms = [], cta = '', title = '' } = req.body || {};
    if (!topic || topic.length < 3) return res.status(400).json({ error: 'topic required (min 3 chars)' });

    const configured = await isConfiguredFor(user.id);
    if (!configured) {
      let result;
      if (kind === 'metadata') result = draftMetadata({ topic, audience, tone, platforms, title });
      else if (kind === 'variants') result = draftVariants({ topic, platforms, tone });
      else if (kind === 'thumbnails') result = draftThumbnails({ topic });
      else return res.status(400).json({ error: 'unknown kind' });
      await audit(user.id, `ai.${kind}.draft`, {});
      return res.status(200).json({ configured: false, result, note: 'AI provider not configured. Returning deterministic draft. Set OPENROUTER_API_KEY to enable model generation.' });
    }

    let system = 'You are Modulate. Return ONLY valid JSON. No markdown fences.';
    let user_msg = '';
    if (kind === 'metadata') user_msg = `Generate metadata. Topic: "${topic}". Audience: "${audience}". Tone: "${tone}". CTA: "${cta}". JSON keys: title (≤80 chars), description (150-500 chars), hashtags (5-10 strings starting with #), tags (3-6), cta.`;
    else if (kind === 'variants') user_msg = `Rewrite for each platform. Topic: "${topic}". Tone: "${tone}". Platforms: ${JSON.stringify(platforms)}. JSON: { "variants": { "<platform>": { "title", "caption", "description" } } }.`;
    else if (kind === 'thumbnails') user_msg = `Propose 3 thumbnail concepts for topic: "${topic}". JSON: { "concepts": [ { "idea", "palette" } ] }.`;
    else return res.status(400).json({ error: 'unknown kind' });

    try {
      const result = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user_msg }], { userId: user.id, kind: `metadata.${kind}` });
      await audit(user.id, `ai.${kind}`, {});
      return res.status(200).json({ configured: true, result });
    } catch (e) {
      // Graceful fallback so UI never dead-ends
      let result;
      if (kind === 'metadata') result = draftMetadata({ topic, audience, tone, platforms, title });
      else if (kind === 'variants') result = draftVariants({ topic, platforms, tone });
      else result = draftThumbnails({ topic });
      return res.status(200).json({ configured: true, result, note: `AI call failed (${safeError(e)}). Returned deterministic fallback.` });
    }
  } catch (err) {
    console.error('ai/generate error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
