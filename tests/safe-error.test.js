import { describe, it, expect } from 'vitest';
import { safeError } from '../lib/server/_safe.js';

describe('safeError', () => {
  it('redacts OpenAI-style secret keys', () => {
    const msg = safeError(new Error('Auth failed with token sk-abc123XYZ_-token'));
    expect(msg).not.toContain('sk-abc123XYZ_-token');
    expect(msg).toContain('sk-***');
  });

  it('redacts Supabase secret keys', () => {
    const msg = safeError(new Error('Using sb_secret_WPO6f0WjR70oGrcHVxmAsA and it broke'));
    expect(msg).not.toContain('sb_secret_WPO6f0WjR70oGrcHVxmAsA');
    expect(msg).toContain('sb_secret_***');
  });

  it('returns a safe default when no message', () => {
    expect(safeError({})).toBe('Server error');
  });
});
