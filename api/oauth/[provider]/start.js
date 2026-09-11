import crypto from 'node:crypto';
import supabase from '../../db-client.js';
import { preflight, getUser, requireUser, safeError } from '../../_auth.js';
import { PROVIDER_META, providerConfigStatus, resolveRedirectUri } from '../../_providers.js';

// GET /api/oauth/:provider/start
// Returns { url } that the frontend opens in a popup, OR { configured:false, missing:[...] }.
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const provider = String(req.query.provider || '').toLowerCase();
    const meta = PROVIDER_META[provider];
    if (!meta) return res.status(404).json({ error: 'Unknown provider' });

    const cfg = providerConfigStatus()[provider];
    if (!cfg.configured) {
      return res.status(200).json({
        configured: false,
        provider,
        missing: cfg.missing,
        docs: meta.docs,
        note: `Set ${cfg.missing.join(', ')} in the server environment to enable ${meta.name} OAuth. Redirect URI must match your provider app config; if omitted, it defaults to /api/oauth/${provider}/callback on this origin.`,
      });
    }

    const state = crypto.randomBytes(24).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const redirectUri = resolveRedirectUri(req, provider);

    await supabase.from('oauth_states').insert({
      state,
      user_id: user.id,
      provider,
      code_verifier: codeVerifier,
      redirect_to: (req.query.next && typeof req.query.next === 'string') ? req.query.next : `/${provider}`,
    });

    let url;
    if (provider === 'youtube') {
      const params = new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        scope: meta.scopes.join(' '),
        state,
      });
      url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } else if (provider === 'tiktok') {
      const params = new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        response_type: 'code',
        scope: meta.scopes.join(','),
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      url = `https://www.tiktok.com/v2/auth/authorize/?${params}`;
    } else if (provider === 'instagram' || provider === 'facebook') {
      const params = new URLSearchParams({
        client_id: process.env.META_APP_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: meta.scopes.join(','),
        state: `${state}|${provider}`,
      });
      url = `https://www.facebook.com/v20.0/dialog/oauth?${params}`;
    }

    return res.status(200).json({ configured: true, url, provider, redirect_uri: redirectUri });
  } catch (err) {
    console.error('oauth start error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
