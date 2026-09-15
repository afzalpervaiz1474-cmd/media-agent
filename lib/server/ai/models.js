// GET /api/ai/models → fetch available OpenRouter models (server-side only)
// Uses the user's stored OpenRouter key or the platform env key.
// The API key is never returned or logged.

import supabase from '../../db-client.js';
import { preflight, getUser, requireUser, safeError } from '../../_auth.js';
import { decryptSecret } from '../../_crypto.js';

export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Look up the user's OpenRouter config to get their stored key
    const { data: openrouterCfg } = await supabase
      .from('ai_provider_configs')
      .select('api_key_ciphertext')
      .eq('user_id', user.id)
      .eq('provider', 'openrouter')
      .single();

    let key = null;
    // Try user's stored key first
    if (openrouterCfg?.api_key_ciphertext) {
      try { key = decryptSecret(openrouterCfg.api_key_ciphertext); } catch { key = null; }
    }
    // Fall back to platform env key
    if (!key && process.env.OPENROUTER_API_KEY) {
      key = process.env.OPENROUTER_API_KEY;
    }
    if (!key) return res.status(400).json({ error: 'No OpenRouter API key configured. Add your key on /settings/ai-providers.' });

    // Fetch models from OpenRouter
    const url = 'https://openrouter.ai/api/v1/models';
    const headers = {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(url, { method: 'GET', headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) {
        const text = await r.text();
        return res.status(500).json({ error: `OpenRouter models API error: ${r.status}` });
      }
      const data = await r.json();
      // Transform to UI-friendly format
      const models = (data.data || []).map((m) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description,
        context_length: m.context_length,
        pricing: m.pricing,
        enabled: m.enabled,
        tags: m.tags || [],
      }));
      return res.status(200).json({ models });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(500).json({ error: 'Request to OpenRouter models API timed out' });
      }
      throw fetchErr;
    }
  } catch (err) {
    console.error('ai/models error', err);
    res.status(500).json({ error: safeError(err) });
  }
}