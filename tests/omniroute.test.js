import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// _ai_manager pulls in the Supabase client at import time, which throws
// without env. Override-path tests never touch the DB (userId null skips
// rate-limit + usage logging), so stub the client module entirely.
vi.mock('../lib/server/db-client.js', () => ({
  default: { from: () => { throw new Error('db must not be touched in override tests'); } },
}));

import { SUPPORTED_PROVIDERS, envDefaults, isConfigured } from '../lib/server/_ai_registry.js';
import { generateText, generateStructured } from '../lib/server/_ai_manager.js';

const originalEnv = { ...process.env };
const OVERRIDE = {
  source: 'env',
  provider: 'omniroute',
  model: 'auto',
  base_url: 'http://localhost:20128/v1',
  _key: 'test-dashboard-token',
};

function clearAiEnv() {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OMNIROUTE_API_KEY;
  delete process.env.OMNIROUTE_MODEL;
  delete process.env.OMNIROUTE_BASE_URL;
}

describe('OmniRoute registry entry', () => {
  it('is registered with auto model and local gateway default URL', () => {
    const p = SUPPORTED_PROVIDERS.omniroute;
    expect(p).toBeTruthy();
    expect(p.name).toBeTruthy();
    expect(p.docs).toMatch(/^https?:\/\//);
    expect(p.default_model).toBe('auto');
    expect(p.default_base_url).toBe('http://localhost:20128/v1');
    expect(p.needs_key).toBe(true);
    expect(p.supports_json_mode).toBe(true);
  });
});

describe('OmniRoute env defaults', () => {
  beforeEach(() => { process.env = { ...originalEnv }; clearAiEnv(); });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('adds no omniroute candidate without OMNIROUTE_API_KEY', () => {
    expect(envDefaults().find((e) => e.provider === 'omniroute')).toBeUndefined();
  });

  it('adds an omniroute candidate from OMNIROUTE_API_KEY alone', () => {
    process.env.OMNIROUTE_API_KEY = 'tok-123';
    const e = envDefaults().find((x) => x.provider === 'omniroute');
    expect(e).toBeTruthy();
    expect(e.source).toBe('env');
    expect(e.model).toBe('auto');
    expect(e.base_url).toBe('http://localhost:20128/v1');
    expect(isConfigured()).toBe(true);
  });

  it('honors OMNIROUTE_MODEL and OMNIROUTE_BASE_URL overrides', () => {
    process.env.OMNIROUTE_API_KEY = 'tok-123';
    process.env.OMNIROUTE_MODEL = 'openai/gpt-4o';
    process.env.OMNIROUTE_BASE_URL = 'http://gateway.local:20128/v1';
    const e = envDefaults().find((x) => x.provider === 'omniroute');
    expect(e.model).toBe('openai/gpt-4o');
    expect(e.base_url).toBe('http://gateway.local:20128/v1');
  });

  it('keeps OpenRouter as the default: omniroute is appended, not prepended', () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.OMNIROUTE_API_KEY = 'om-key';
    const list = envDefaults().map((x) => x.provider);
    expect(list[0]).toBe('openrouter');
    expect(list).toContain('omniroute');
  });
});

describe('OmniRoute adapter (OpenAI-compatible)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POSTs to {base_url}/chat/completions with model auto and Bearer token', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await generateText(null, { messages: [{ role: 'user', content: 'hi' }], override: OVERRIDE });
    expect(r.provider).toBe('omniroute');
    expect(r.model).toBe('auto');
    expect(r.content).toBe('hello');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:20128/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test-dashboard-token');
    expect(JSON.parse(opts.body).model).toBe('auto');
  });

  it('generateStructured parses gateway JSON output', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"Hi"}' } }],
        usage: {},
      }),
    })));
    const r = await generateStructured(null, { messages: [{ role: 'user', content: 'hi' }], override: OVERRIDE });
    expect(r.data.title).toBe('Hi');
  });

  it('unreachable gateway throws a clean error without leaking the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:20128'); }));
    let err = null;
    try {
      await generateText(null, { messages: [{ role: 'user', content: 'hi' }], override: OVERRIDE });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(String(err.message)).not.toContain('test-dashboard-token');
  });

  it('gateway 401 maps to AUTH error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })));
    let err = null;
    try {
      await generateText(null, { messages: [{ role: 'user', content: 'hi' }], override: OVERRIDE });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.code).toBe('AUTH');
    expect(String(err.message)).not.toContain('test-dashboard-token');
  });
});
