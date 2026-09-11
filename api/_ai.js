// Compatibility shim. Every caller in the app used to import from here directly;
// they now transparently route through the centralized AI Provider Manager.
// New code should prefer importing from './_ai_manager.js'.
import { aiConfigStatus } from './_providers.js';
import { generateText as mgrGenerateText, generateStructured as mgrGenerateStructured, isConfiguredFor } from './_ai_manager.js';

export async function generateText(messages, opts = {}) {
  const { userId = null, ...rest } = opts;
  const r = await mgrGenerateText(userId, { messages, ...rest });
  return r.content;
}

export async function generateStructured(messages, opts = {}) {
  const { userId = null, ...rest } = opts;
  const r = await mgrGenerateStructured(userId, { messages, ...rest });
  return r.data;
}

// Legacy sync helper (env-only). Prefer `await isConfiguredFor(userId)`.
export function isAiConfigured() { return aiConfigStatus().configured; }
export { isConfiguredFor };

// Deterministic offline drafts so the app is fully functional without keys.
export function draftMetadata({ topic = '', audience = '', tone = 'confident, practical', title = '' } = {}) {
  const base = title || topic.split(/[.\n]/)[0].slice(0, 80) || 'Untitled piece';
  const hashtags = topBigrams(topic).slice(0, 6).map((h) => `#${h}`);
  return {
    title: `${base}`.trim(),
    description: `${base}. Written for ${audience || 'creators'} — tone: ${tone}. Covers the core idea in a way you can ship in under a day.`,
    hashtags: hashtags.length ? hashtags : ['#build', '#ship', '#creators'],
    tags: topBigrams(topic).slice(0, 5),
    cta: 'Read the full teardown →',
    _draft: true,
  };
}

export function draftVariants({ topic = '', platforms = [] } = {}) {
  const variants = {};
  const seed = topic.split(/[.\n]/)[0].slice(0, 100) || 'A new drop';
  for (const p of platforms) {
    if (p === 'youtube') variants[p] = { title: seed, description: `${seed}\n\nDeep-dive, chapters, and links in the description.` };
    else if (p === 'tiktok') variants[p] = { title: '', caption: `POV: ${seed.toLowerCase()}` };
    else if (p === 'instagram') variants[p] = { title: '', caption: `${seed} — tap for the full breakdown.` };
    else variants[p] = { title: '', caption: seed };
  }
  return { variants, _draft: true };
}

export function draftThumbnails({ topic = '' } = {}) {
  return {
    concepts: [
      { idea: `Bold serif title over slow-mo footage of ${topic || 'the subject'}`, palette: 'cream + ink' },
      { idea: 'Split-screen: before/after with a single stat highlighted', palette: 'graphite + sulfur' },
      { idea: 'Direct-to-camera portrait with one-word title', palette: 'ivory + terracotta' },
    ],
    _draft: true,
  };
}

function topBigrams(text) {
  const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const counts = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([w]) => w);
}
