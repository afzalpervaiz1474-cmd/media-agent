import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { providerConfigStatus, resolveRedirectUri, PROVIDER_META } from '../lib/server/_providers.js';

const originalEnv = { ...process.env };

describe('providerConfigStatus', () => {
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('reports missing env vars when unset', () => {
    delete process.env.YOUTUBE_CLIENT_ID; delete process.env.YOUTUBE_CLIENT_SECRET;
    delete process.env.TIKTOK_CLIENT_KEY; delete process.env.TIKTOK_CLIENT_SECRET;
    delete process.env.META_APP_ID; delete process.env.META_APP_SECRET;
    const s = providerConfigStatus();
    expect(s.youtube.configured).toBe(false);
    expect(s.youtube.missing).toEqual(['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']);
    expect(s.tiktok.configured).toBe(false);
    expect(s.instagram.configured).toBe(false);
    expect(s.facebook.configured).toBe(false);
  });

  it('reports configured when both env vars set', () => {
    process.env.YOUTUBE_CLIENT_ID = 'x'; process.env.YOUTUBE_CLIENT_SECRET = 'y';
    const s = providerConfigStatus();
    expect(s.youtube.configured).toBe(true);
    expect(s.youtube.missing).toEqual([]);
  });

  it('meta covers both instagram and facebook', () => {
    process.env.META_APP_ID = 'a'; process.env.META_APP_SECRET = 'b';
    const s = providerConfigStatus();
    expect(s.instagram.configured).toBe(true);
    expect(s.facebook.configured).toBe(true);
  });
});

describe('resolveRedirectUri', () => {
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('prefers env var if set', () => {
    process.env.YOUTUBE_REDIRECT_URI = 'https://example.com/cb';
    const req = { headers: { host: 'other.example.com', 'x-forwarded-proto': 'https' } };
    expect(resolveRedirectUri(req, 'youtube')).toBe('https://example.com/cb');
  });

  it('derives from request when env not set', () => {
    delete process.env.YOUTUBE_REDIRECT_URI;
    const req = { headers: { host: 'app.example.com', 'x-forwarded-proto': 'https' } };
    expect(resolveRedirectUri(req, 'youtube')).toBe('https://app.example.com/api/oauth/youtube/callback');
  });

  it('uses correct route per provider', () => {
    delete process.env.TIKTOK_REDIRECT_URI; delete process.env.META_REDIRECT_URI;
    const req = { headers: { host: 'app.example.com', 'x-forwarded-proto': 'https' } };
    expect(resolveRedirectUri(req, 'tiktok')).toContain('/api/oauth/tiktok/callback');
    expect(resolveRedirectUri(req, 'facebook')).toContain('/api/oauth/facebook/callback');
  });
});

describe('PROVIDER_META', () => {
  it('lists official docs and scopes for every supported provider', () => {
    for (const p of ['youtube', 'tiktok', 'instagram', 'facebook']) {
      expect(PROVIDER_META[p]).toBeTruthy();
      expect(PROVIDER_META[p].docs).toMatch(/^https?:\/\//);
      expect(Array.isArray(PROVIDER_META[p].scopes)).toBe(true);
      expect(PROVIDER_META[p].scopes.length).toBeGreaterThan(0);
    }
  });

  it('YouTube requires upload scope', () => {
    expect(PROVIDER_META.youtube.scopes).toContain('https://www.googleapis.com/auth/youtube.upload');
  });

  it('TikTok requires publish scope', () => {
    expect(PROVIDER_META.tiktok.scopes).toContain('video.publish');
  });

  it('Instagram requires content publish scope', () => {
    expect(PROVIDER_META.instagram.scopes).toContain('instagram_content_publish');
  });
});
