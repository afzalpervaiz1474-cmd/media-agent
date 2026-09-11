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
