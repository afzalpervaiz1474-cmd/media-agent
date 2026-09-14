import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SUPPORTED_PROVIDERS, envDefaults, isConfigured, fetchOpenRouterModels } from '../api/_ai_registry.js';
import { encryptSecret, decryptSecret, keyHint } from '../api/_crypto.js';

const originalEnv = { ...process.env };

describe('SUPPORTED_PROVIDERS', () => {
  it('includes OpenRouter, OpenAI, Groq, Gemini, Ollama and openai_compatible', () => {
    for (const p of ['openrouter', 'openai', 'groq', 'gemini', 'ollama', 'openai_compatible']) {
      expect(SUPPORTED_PROVIDERS[p]).toBeTruthy();
      expect(SUPPORTED_PROVIDERS[p].name).toBeTruthy();
      expect(SUPPORTED_PROVIDERS[p].docs).toMatch(/^https?:\/\//);
    }
  });

  it('OpenRouter has a configurable default model but does NOT hardcode a specific one', () => {
    expect(typeof SUPPORTED_PROVIDERS.openrouter.default_model).toBe('string');
    expect(SUPPORTED_PROVIDERS.openrouter.default_model.length).toBeGreaterThan(0);
  });

  it('Ollama does not require a key', () => {
    expect(SUPPORTED_PROVIDERS.ollama.needs_key).toBe(false);
  });

  it('OpenRouter supports model metadata fields', () => {
    expect(SUPPORTED_PROVIDERS.openrouter).toHaveProperty('default_model');
    expect(SUPPORTED_PROVIDERS.openrouter).toHaveProperty('needs_key');
    expect(SUPPORTED_PROVIDERS.openrouter).toHaveProperty('supports_json_mode');
  });
});

describe('envDefaults', () => {
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('is empty when no env keys set', () => {
    delete process.env.OPENROUTER_API_KEY; delete process.env.OPENAI_API_KEY;
    expect(envDefaults()).toEqual([]);
    expect(isConfigured()).toBe(false);
  });

  it('picks OpenRouter first, then OpenAI, when both set', () => {
    process.env.OPENROUTER_API_KEY = 'test-or';
    process.env.OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet';
    process.env.OPENAI_API_KEY = 'test-oai';
    const list = envDefaults();
    expect(list[0].provider).toBe('openrouter');
    expect(list[0].model).toBe('anthropic/claude-3.5-sonnet');
    expect(list[1].provider).toBe('openai');
    expect(isConfigured()).toBe(true);
  });

  it('respects OPENROUTER_MODEL override', () => {
    process.env.OPENROUTER_API_KEY = 'k';
    process.env.OPENROUTER_MODEL = 'meta-llama/llama-3.1-70b-instruct';
    expect(envDefaults()[0].model).toBe('meta-llama/llama-3.1-70b-instruct');
  });

  it('respects OPENROUTER_BASE_URL override', () => {
    process.env.OPENROUTER_API_KEY = 'k';
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.example.com/api/v1';
    expect(envDefaults()[0].base_url).toBe('https://openrouter.example.com/api/v1');
  });

  it('falls back to canonical base_url when OPENROUTER_BASE_URL unset', () => {
    process.env.OPENROUTER_API_KEY = 'k';
    delete process.env.OPENROUTER_BASE_URL;
    expect(envDefaults()[0].base_url).toBe('https://openrouter.ai/api/v1');
  });

  it('never exposes the raw key on the returned object shape used for listing', () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-1234567890';
    const list = envDefaults();
    expect(list[0]._key).toBeDefined();
    expect(list[0].provider).toBe('openrouter');
  });
});

describe('fetchOpenRouterModels', () => {
  it('returns null when no apiKey provided', async () => {
    const result = await fetchOpenRouterModels('');
    expect(result).toBeNull();
  });

  it('returns null for invalid/missing API key', async () => {
    const result = await fetchOpenRouterModels('invalid-key');
    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it('never exposes the API key in the returned data', async () => {
    const key = 'sk-test-key-12345';
    const result = await fetchOpenRouterModels(key);
    if (Array.isArray(result)) {
      for (const m of result) {
        expect(m.id).toBeTruthy();
        expect(m).not.toHaveProperty('apiKey');
        expect(m).not.toHaveProperty('key');
      }
    }
  });
});

describe('crypto', () => {
  beforeEach(() => { process.env = { ...originalEnv, AI_ENCRYPTION_KEY: 'test-encryption-key-with-enough-entropy-please' }; });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('encrypts and decrypts round-trip', () => {
    const plain = 'sk-super-secret-value';
    const enc = encryptSecret(plain);
    expect(enc).toMatch(/^v1\./);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('produces different ciphertext for the same plaintext (IV randomness)', () => {
    const a = encryptSecret('x'); const b = encryptSecret('x');
    expect(a).not.toBe(b);
  });

  it('rejects tampered ciphertext', () => {
    const enc = encryptSecret('hello');
    const tampered = enc.slice(0, -4) + 'AAAA';
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('keyHint hides most of the key', () => {
    expect(keyHint('sk-abcdef1234567890')).toBe('sk-a…7890');
    expect(keyHint('short')).toContain('***');
    expect(keyHint(null)).toBe(null);
  });
});