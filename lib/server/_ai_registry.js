// Pure, side-effect-free registry of supported AI providers.
// Split from _ai_manager.js so tests can import without pulling in Supabase.
export const SUPPORTED_PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    docs: 'https://openrouter.ai/docs',
    default_base_url: 'https://openrouter.ai/api/v1',
    default_model: 'openai/gpt-4o-mini',
    needs_key: true,
    supports_json_mode: true,
    // Model metadata fetched from OpenRouter API
    // { id, name, description, context_length, pricing, enabled, tags }
    model_info: null, // cached model info, populated server-side
  },
  openai: {
    name: 'OpenAI',
    docs: 'https://platform.openai.com/docs',
    default_base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o-mini',
    needs_key: true,
    supports_json_mode: true,
  },
  groq: {
    name: 'Groq',
    docs: 'https://console.groq.com/docs',
    default_base_url: 'https://api.groq.com/openai/v1',
    default_model: 'llama-3.1-70b-versatile',
    needs_key: true,
    supports_json_mode: true,
  },
  gemini: {
    name: 'Google Gemini',
    docs: 'https://ai.google.dev/api',
    default_base_url: 'https://generativelanguage.googleapis.com/v1beta',
    default_model: 'gemini-1.5-flash-latest',
    needs_key: true,
    supports_json_mode: true,
  },
  openai_compatible: {
    name: 'OpenAI-compatible',
    docs: 'https://platform.openai.com/docs/api-reference',
    default_base_url: '',
    default_model: '',
    needs_key: true,
    supports_json_mode: true,
  },
  ollama: {
    name: 'Ollama (local)',
    docs: 'https://ollama.com/',
    default_base_url: 'http://localhost:11434',
    default_model: 'llama3.1',
    needs_key: false,
    supports_json_mode: true,
  },
};

export function envDefaults() {
  const out = [];
  if (process.env.OPENROUTER_API_KEY) {
    out.push({
      source: 'env',
      provider: 'openrouter',
      model: process.env.OPENROUTER_MODEL || SUPPORTED_PROVIDERS.openrouter.default_model,
      base_url: process.env.OPENROUTER_BASE_URL || SUPPORTED_PROVIDERS.openrouter.default_base_url,
      _key: process.env.OPENROUTER_API_KEY,
    });
  }
  if (process.env.OPENAI_API_KEY) {
    out.push({
      source: 'env',
      provider: 'openai',
      model: process.env.OPENAI_MODEL || SUPPORTED_PROVIDERS.openai.default_model,
      base_url: process.env.OPENAI_BASE_URL || SUPPORTED_PROVIDERS.openai.default_base_url,
      _key: process.env.OPENAI_API_KEY,
    });
  }
  return out;
}

export function isConfigured() {
  return !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

// Fetch models from OpenRouter API (server-side only, never exposes the key)
export async function fetchOpenRouterModels(apiKey) {
  if (!apiKey) return null;
  const url = 'https://openrouter.ai/api/v1/models';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const data = await r.json();
    const formatted = (data.data || []).map((m) => ({
      id: m.id,
      name: m.name || m.id,
      description: m.description,
      context_length: m.context_length,
      pricing: m.pricing,
      enabled: m.enabled,
      tags: m.tags || [],
    }));
    return formatted;
  } catch {
    return null;
  }
}
