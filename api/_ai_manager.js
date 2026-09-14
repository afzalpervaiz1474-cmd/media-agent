// Provider-agnostic AI Provider Manager.
//
// Every agent (orchestrator, YouTube/TikTok/Instagram/Facebook agents, chat,
// metadata generation) goes through this file. Adapters follow one shape:
//
//   { generateText({ messages, temperature, response_format, timeoutMs }) -> { content, usage } }
//
// Adapters live below. Adding a new provider = adding one adapter entry.
// The manager resolves which adapter to use per request in this order:
//
//   1. User's primary AI provider config (ai_provider_configs where is_primary)
//   2. User's other configs marked allow_fallback (in insert order)
//   3. Admin/system default derived from environment (OPENROUTER_API_KEY /
//      OPENAI_API_KEY) — never another user's credentials.
//
// Model resolution priority:
//   1. User-selected model with user's own OpenRouter key
//   2. User-selected model with platform OpenRouter key
//   3. Platform default model
//   4. Return a clear configuration error if no valid model/provider is available
//
// A resolution is logged into ai_usage_events with { provider, model, tokens,
// latency, status } — NEVER the API key or the prompt text.

import supabase from './db-client.js';
import { decryptSecret } from './_crypto.js';
import { SUPPORTED_PROVIDERS, envDefaults, isConfigured, fetchOpenRouterModels } from './_ai_registry.js';
export { SUPPORTED_PROVIDERS, envDefaults, isConfigured, fetchOpenRouterModels } from './_ai_registry.js';

// ------------------------------------------------------------------
// Resolution
// ------------------------------------------------------------------

export async function listUserConfigs(userId) {
  const { data } = await supabase.from('ai_provider_configs').select('*').eq('user_id', userId).order('is_primary', { ascending: false }).order('created_at');
  return data || [];
}

// Resolves the ordered list of candidate configs to try for a given user.
async function resolveCandidates(userId) {
  const userCfgs = await listUserConfigs(userId);
  const primary = userCfgs.filter((c) => c.is_primary);
  const fallbacks = userCfgs.filter((c) => !c.is_primary && c.allow_fallback);
  const env = envDefaults();

  // Build user config chain, preserving selected model
  const userChain = [...primary, ...fallbacks].map((c) => ({
    source: 'user',
    id: c.id,
    provider: c.provider,
    model: c.model || SUPPORTED_PROVIDERS[c.provider]?.default_model || null,
    base_url: c.base_url || SUPPORTED_PROVIDERS[c.provider]?.default_base_url || null,
    _keyCiphertext: c.api_key_ciphertext,
    // Track if this config has a user-selected model (not just the default)
    _selectedModel: !!c.model,
  }));

  // Validate user-selected models against OpenRouter (only for user-owned keys)
  // We do this lazily - validate on first use rather than on every request
  const validatedChain = await Promise.all(userChain.map(async (cand) => {
    let key = null;
    if (cand.source === 'user' && cand._keyCiphertext) {
      try { key = decryptSecret(cand._keyCiphertext); } catch { key = null; }
    }

    // If this config has a user-selected model and uses OpenRouter, validate it
    if (cand._selectedModel && cand.provider === 'openrouter' && key) {
      const models = await fetchOpenRouterModels(key);
      if (models) {
        const isAvailable = models.some((m) => m.id === cand.model || m.name === cand.model);
        if (!isAvailable) {
          // Model no longer available, fall back to default
          return {
            ...cand,
            model: SUPPORTED_PROVIDERS.openrouter.default_model,
            // Clear the selected model flag so it falls back gracefully
            _selectedModel: false,
          };
        }
      }
      // If API fails, keep the selected model and let the request fail or try fallback
    }
    return cand;
  }));

  return [...validatedChain, ...env];
}

export async function isConfiguredFor(userId) {
  if (userId) {
    const { count } = await supabase.from('ai_provider_configs').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if ((count || 0) > 0) return true;
  }
  return isConfigured();
}

function needsKey(provider) { return !!SUPPORTED_PROVIDERS[provider]?.needs_key; }

function keyFor(cand) {
  if (cand.source === 'env') return cand._key;
  if (cand.source === 'user' && cand._keyCiphertext) {
    try { return decryptSecret(cand._keyCiphertext); } catch { return null; }
  }
  return null;
}

// ------------------------------------------------------------------
// Public entrypoints used by every agent
// ------------------------------------------------------------------

export async function generateText(userId, { messages, temperature = 0.5, response_format = null, timeoutMs = 25000, kind = 'text', override } = {}) {
  const candidates = override ? [override] : await resolveCandidates(userId);
  if (candidates.length === 0) throw new AiError('NO_PROVIDER', 'No AI provider is configured for this user. Configure one on /settings/ai-providers or set OPENROUTER_API_KEY.');
  let lastErr;
  for (const cand of candidates) {
    const key = keyFor(cand);
    if (needsKey(cand.provider) && !key) { lastErr = new AiError('MISSING_KEY', `Provider ${cand.provider} has no key.`); continue; }

    // Rate limit users when they are burning the shared platform key. Users with
    // their own key skip this — they pay for their own tokens.
    if (cand.source === 'env' && userId) {
      const rl = await checkPlatformRateLimit(userId);
      if (!rl.ok) { throw new AiError('RATE_LIMIT', `Platform AI rate limit reached (${rl.used}/${rl.limit} requests in the last hour). Add your own OpenRouter key on /settings/ai-providers to remove this limit.`); }
    }
    const started = Date.now();
    try {
      const adapter = ADAPTERS[cand.provider];
      if (!adapter) throw new AiError('UNSUPPORTED', `Provider ${cand.provider} not implemented.`);
      const res = await withRetry(() => adapter.generateText({ apiKey: key, model: cand.model, baseUrl: cand.base_url, messages, temperature, response_format, timeoutMs }));
      const latency = Date.now() - started;
      await logUsage(userId, { provider: cand.provider, model: cand.model, kind, usage: res.usage, latency, status: 'ok' });
      return { content: res.content, usage: res.usage || {}, provider: cand.provider, model: cand.model, source: cand.source };
    } catch (e) {
      const latency = Date.now() - started;
      await logUsage(userId, { provider: cand.provider, model: cand.model, kind, latency, status: 'error', error: e?.message?.slice(0, 240) });
      lastErr = e;
      if (!isTransient(e)) continue; // try next candidate on any error
    }
  }
  throw lastErr || new AiError('EXHAUSTED', 'All configured AI providers failed.');
}

export async function generateStructured(userId, opts = {}) {
  const r = await generateText(userId, { ...opts, response_format: { type: 'json_object' }, kind: opts.kind || 'structured' });
  try { return { ...r, data: JSON.parse(r.content) }; }
  catch { throw new AiError('BAD_JSON', 'Model returned invalid JSON.'); }
}

// ------------------------------------------------------------------
// Health check for a specific candidate (used by settings + orchestrator)
// ------------------------------------------------------------------

export async function healthCheckCandidate({ provider, model, base_url, apiKey }) {
  const cfg = SUPPORTED_PROVIDERS[provider];
  const checks = [];
  if (!cfg) return { overall: 'FAIL', checks: [{ id: 'provider', status: 'FAIL', detail: `Unknown provider "${provider}".` }] };
  checks.push({ id: 'provider', status: 'PASS', detail: cfg.name });
  if (cfg.needs_key && !apiKey) return { overall: 'FAIL', checks: [...checks, { id: 'key', status: 'FAIL', detail: 'API key required.' }] };
  checks.push({ id: 'key', status: cfg.needs_key ? 'PASS' : 'SKIP', detail: cfg.needs_key ? 'Provided.' : 'Not required.' });
  const adapter = ADAPTERS[provider];
  const started = Date.now();
  try {
    const res = await adapter.generateText({
      apiKey, model: model || cfg.default_model, baseUrl: base_url || cfg.default_base_url,
      messages: [{ role: 'user', content: 'Reply with the single word: OK.' }],
      temperature: 0, timeoutMs: 15000,
    });
    const ok = /ok/i.test((res.content || '').trim().slice(0, 20));
    checks.push({ id: 'probe', status: ok ? 'PASS' : 'WARNING', detail: ok ? `Round-trip ${Date.now() - started}ms.` : `Model replied but format was unexpected: ${String(res.content).slice(0, 80)}` });
    return { overall: ok ? 'PASS' : 'WARNING', checks, latency_ms: Date.now() - started, model: model || cfg.default_model };
  } catch (e) {
    checks.push({ id: 'probe', status: 'FAIL', detail: e?.message || 'Unknown error.' });
    return { overall: 'FAIL', checks };
  }
}

// ------------------------------------------------------------------
// Adapters
// ------------------------------------------------------------------

const ADAPTERS = {
  openrouter: openaiLikeAdapter({
    referer: process.env.PUBLIC_APP_URL || 'https://modulate.app',
    title: 'Modulate',
  }),
  openai: openaiLikeAdapter({}),
  groq: openaiLikeAdapter({}),
  openai_compatible: openaiLikeAdapter({}),
  gemini: geminiAdapter(),
  ollama: ollamaAdapter(),
};

function openaiLikeAdapter(extraHeaders = {}) {
  return {
    async generateText({ apiKey, model, baseUrl, messages, temperature, response_format, timeoutMs }) {
      const body = { model, messages, temperature };
      if (response_format) body.response_format = response_format;
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
      if (extraHeaders.referer) headers['HTTP-Referer'] = extraHeaders.referer;
      if (extraHeaders.title) headers['X-Title'] = extraHeaders.title;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
        if (!r.ok) {
          const text = await r.text();
          throw new AiError(codeFromStatus(r.status), `${r.status}: ${text.slice(0, 300)}`);
        }
        const json = await r.json();
        return {
          content: json.choices?.[0]?.message?.content ?? '',
          usage: {
            prompt_tokens: json.usage?.prompt_tokens,
            completion_tokens: json.usage?.completion_tokens,
            total_tokens: json.usage?.total_tokens,
          },
        };
      } finally { clearTimeout(t); }
    },
  };
}

function geminiAdapter() {
  return {
    async generateText({ apiKey, model, baseUrl, messages, temperature, response_format, timeoutMs }) {
      const modelId = model || SUPPORTED_PROVIDERS.gemini.default_model;
      const url = `${(baseUrl || SUPPORTED_PROVIDERS.gemini.default_base_url).replace(/\/+$/, '')}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const systemInstruction = messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content })).slice(0, 1);
      const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const body = { contents, generationConfig: { temperature } };
      if (systemInstruction.length) body.systemInstruction = { parts: systemInstruction };
      if (response_format?.type === 'json_object') body.generationConfig.responseMimeType = 'application/json';
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (!r.ok) { const text = await r.text(); throw new AiError(codeFromStatus(r.status), `${r.status}: ${text.slice(0, 300)}`); }
        const json = await r.json();
        const parts = json.candidates?.[0]?.content?.parts || [];
        const content = parts.map((p) => p.text || '').join('');
        return {
          content,
          usage: {
            prompt_tokens: json.usageMetadata?.promptTokenCount,
            completion_tokens: json.usageMetadata?.candidatesTokenCount,
            total_tokens: json.usageMetadata?.totalTokenCount,
          },
        };
      } finally { clearTimeout(t); }
    },
  };
}

function ollamaAdapter() {
  return {
    async generateText({ model, baseUrl, messages, temperature, response_format, timeoutMs }) {
      const url = `${(baseUrl || SUPPORTED_PROVIDERS.ollama.default_base_url).replace(/\/+$/, '')}/api/chat`;
      const body = { model, messages, stream: false, options: { temperature } };
      if (response_format?.type === 'json_object') body.format = 'json';
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (!r.ok) { const text = await r.text(); throw new AiError(codeFromStatus(r.status), `${r.status}: ${text.slice(0, 300)}`); }
        const json = await r.json();
        return {
          content: json.message?.content || '',
          usage: {
            prompt_tokens: json.prompt_eval_count,
            completion_tokens: json.eval_count,
            total_tokens: (json.prompt_eval_count || 0) + (json.eval_count || 0),
          },
        };
      } finally { clearTimeout(t); }
    },
  };
}

// ------------------------------------------------------------------
// Errors + retry
// ------------------------------------------------------------------

export class AiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function codeFromStatus(status) {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 408 || status >= 500) return 'TRANSIENT';
  return 'ERROR';
}

function isTransient(err) {
  if (err?.name === 'AbortError') return true;
  return err?.code === 'TRANSIENT' || err?.code === 'RATE_LIMIT';
}

async function withRetry(fn) {
  const delays = [0, 400, 1200];
  let lastErr;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i] + Math.random() * 200));
    try { return await fn(); }
    catch (e) { lastErr = e; if (!isTransient(e)) break; }
  }
  throw lastErr;
}

// ------------------------------------------------------------------
// Usage logging (no secrets, no prompts)
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Rate limit for shared-platform-key usage.
// Configurable via PLATFORM_AI_HOURLY_LIMIT (default 60 req/hour/user).
// ------------------------------------------------------------------
async function checkPlatformRateLimit(userId) {
  const limit = Number(process.env.PLATFORM_AI_HOURLY_LIMIT || 60);
  if (!limit || limit <= 0) return { ok: true, used: 0, limit: 0 };
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from('ai_usage_events').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'ok').gte('created_at', since);
  const used = count || 0;
  return { ok: used < limit, used, limit };
}

async function logUsage(userId, { provider, model, kind, usage = {}, latency, status, error }) {
  if (!userId) return;
  try {
    await supabase.from('ai_usage_events').insert({
      user_id: userId, provider, model, kind,
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
      latency_ms: latency ?? null, status, error: error || null,
    });
  } catch { /* logging must never break the request */ }
}
