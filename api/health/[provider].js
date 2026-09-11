import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError } from '../_auth.js';
import { PROVIDER_META, providerConfigStatus, aiConfigStatus, resolveRedirectUri } from '../_providers.js';
import { getAccountAndToken } from '../_tokens.js';

// GET /api/health/:provider
// Runs a sequence of checks and returns { overall: 'PASS'|'WARNING'|'FAIL', checks: [...] }.
// Each check: { id, label, status: 'PASS'|'WARNING'|'FAIL'|'SKIP', detail, action? }.
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const provider = String(req.query.provider || '').toLowerCase();
    const meta = PROVIDER_META[provider];
    if (!meta) return res.status(404).json({ error: 'Unknown provider' });

    const checks = [];

    // 1. Environment variables
    const cfg = providerConfigStatus()[provider];
    checks.push(cfg.configured
      ? { id: 'env', label: 'Environment variables', status: 'PASS', detail: 'All required credentials are set.' }
      : { id: 'env', label: 'Environment variables', status: 'FAIL', detail: `Missing: ${cfg.missing.join(', ')}`, action: `Add these to your server env (see .env.example) and redeploy.` });

    // 2. Redirect URI
    const redirect = resolveRedirectUri(req, provider);
    checks.push({
      id: 'redirect', label: 'Redirect URI', status: cfg.configured ? 'PASS' : 'SKIP',
      detail: cfg.configured ? redirect : 'Skipped — configure env vars first.',
      action: cfg.configured ? `Add this exact URL to your ${meta.name} OAuth app as an authorized redirect URI.` : undefined,
    });

    // 3. Database connectivity
    try {
      const { error } = await supabase.from('connected_accounts').select('id').eq('user_id', user.id).limit(1);
      checks.push({ id: 'db', label: 'Database connectivity', status: error ? 'FAIL' : 'PASS', detail: error ? String(error.message).slice(0, 240) : 'Reachable.' });
    } catch (e) {
      checks.push({ id: 'db', label: 'Database connectivity', status: 'FAIL', detail: safeError(e) });
    }

    // 4. AI provider (used by the platform agent)
    const ai = aiConfigStatus();
    checks.push(ai.configured
      ? { id: 'ai', label: 'AI provider', status: 'PASS', detail: `Configured (${ai.openrouter ? 'openrouter' : 'openai'}). Platform agent will use it.` }
      : { id: 'ai', label: 'AI provider', status: 'WARNING', detail: 'No AI key set. Agent runs in draft mode with deterministic suggestions.', action: 'Set OPENROUTER_API_KEY (or OPENAI_API_KEY) to enable model-backed metadata.' });

    // 5. Connected account
    const { account, token } = cfg.configured ? await getAccountAndToken(user.id, provider) : { account: null, token: null };
    checks.push(account
      ? { id: 'account', label: 'Connected account', status: 'PASS', detail: `Connected as ${account.display_name || account.handle || account.provider_account_id}.` }
      : { id: 'account', label: 'Connected account', status: cfg.configured ? 'FAIL' : 'SKIP', detail: cfg.configured ? 'No account linked.' : 'Skipped — configure env vars first.', action: cfg.configured ? `Click "Connect ${meta.name}" to run the official OAuth flow.` : undefined });

    // 6. Token validity
    if (account) {
      if (!token) checks.push({ id: 'token', label: 'Token', status: 'FAIL', detail: 'No access token on file.', action: 'Reauthorize to fetch a new token.' });
      else if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) checks.push({ id: 'token', label: 'Token', status: 'FAIL', detail: 'Access token has expired and refresh failed.', action: 'Click Reauthorize.' });
      else checks.push({ id: 'token', label: 'Token', status: 'PASS', detail: token.expires_at ? `Expires ${new Date(token.expires_at).toISOString()}` : 'No expiry (long-lived).' });
    } else {
      checks.push({ id: 'token', label: 'Token', status: 'SKIP', detail: 'Skipped — no account.' });
    }

    // 7. Required scopes present
    const requiredScopes = meta.scopes || [];
    if (account && requiredScopes.length) {
      const granted = new Set((account.scopes || []).map((s) => String(s).toLowerCase()));
      const missingScopes = requiredScopes.filter((s) => {
        const short = String(s).toLowerCase();
        return !granted.has(short) && !Array.from(granted).some((g) => g.endsWith(short) || short.endsWith(g));
      });
      checks.push(missingScopes.length === 0
        ? { id: 'scopes', label: 'Required scopes', status: 'PASS', detail: `Granted: ${(account.scopes || []).length} scope(s).` }
        : { id: 'scopes', label: 'Required scopes', status: 'WARNING', detail: `Some expected scopes may be missing: ${missingScopes.join(', ')}`, action: 'Reauthorize and grant every requested scope.' });
    } else {
      checks.push({ id: 'scopes', label: 'Required scopes', status: 'SKIP', detail: 'Skipped — no account.' });
    }

    // 8. Live API probe
    if (token?.access_token) {
      try {
        const probe = await probeApi(provider, token.access_token);
        checks.push({ id: 'api', label: 'Live API probe', status: probe.status, detail: probe.detail, action: probe.action });
      } catch (e) {
        checks.push({ id: 'api', label: 'Live API probe', status: 'FAIL', detail: safeError(e) });
      }
    } else {
      checks.push({ id: 'api', label: 'Live API probe', status: 'SKIP', detail: 'Skipped — no token.' });
    }

    // 9. Publishing capability (provider-specific readiness)
    if (account) {
      const cap = capabilityCheck(provider, account, token);
      checks.push(cap);
    } else {
      checks.push({ id: 'capability', label: 'Publishing capability', status: 'SKIP', detail: 'Skipped — no account.' });
    }

    // Overall
    const hasFail = checks.some((c) => c.status === 'FAIL');
    const hasWarn = checks.some((c) => c.status === 'WARNING');
    const overall = hasFail ? 'FAIL' : hasWarn ? 'WARNING' : 'PASS';

    res.status(200).json({ provider, overall, checks, meta: { name: meta.name, docs: meta.docs } });
  } catch (err) {
    console.error('health check error', err);
    res.status(500).json({ error: safeError(err) });
  }
}

async function probeApi(provider, accessToken) {
  if (provider === 'youtube') {
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (r.ok) return { status: 'PASS', detail: 'YouTube Data API reachable.' };
    const text = await r.text();
    return { status: 'FAIL', detail: `YouTube API returned ${r.status}: ${text.slice(0, 200)}`, action: r.status === 401 ? 'Reauthorize the YouTube account.' : 'Check quota and API enablement in Google Cloud.' };
  }
  if (provider === 'tiktok') {
    const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (r.ok) return { status: 'PASS', detail: 'TikTok API reachable.' };
    const text = await r.text();
    return { status: 'FAIL', detail: `TikTok API returned ${r.status}: ${text.slice(0, 200)}`, action: r.status === 401 ? 'Reauthorize TikTok.' : undefined };
  }
  if (provider === 'facebook' || provider === 'instagram') {
    const r = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${accessToken}`);
    if (r.ok) return { status: 'PASS', detail: 'Meta Graph API reachable.' };
    const text = await r.text();
    return { status: 'FAIL', detail: `Meta API returned ${r.status}: ${text.slice(0, 200)}`, action: r.status === 401 ? 'Reauthorize the Meta connection.' : undefined };
  }
  return { status: 'SKIP', detail: 'No probe implemented for this provider.' };
}

function capabilityCheck(provider, account, token) {
  if (provider === 'youtube') {
    return { id: 'capability', label: 'Publishing capability', status: 'PASS', detail: 'YouTube upload endpoint available. Unaudited projects can only publish for test users; videos default to private.' };
  }
  if (provider === 'tiktok') {
    return { id: 'capability', label: 'Publishing capability', status: 'WARNING', detail: 'Direct publishing works for approved test users. Unaudited apps are limited to SELF_ONLY visibility.' , action: 'Complete TikTok app audit to publish for arbitrary users.' };
  }
  if (provider === 'instagram') {
    if (token?.raw_profile?.warning || token?.extra?.warning) {
      return { id: 'capability', label: 'Publishing capability', status: 'FAIL', detail: token?.extra?.warning || 'No Instagram Business account is linked to any Facebook Page for this user.', action: 'Attach an Instagram Business/Creator account to a Facebook Page you administer.' };
    }
    return { id: 'capability', label: 'Publishing capability', status: 'PASS', detail: 'Instagram Business account detected and container publishing available.' };
  }
  if (provider === 'facebook') {
    const pages = token?.extra?.pages || [];
    if (!pages.length) return { id: 'capability', label: 'Publishing capability', status: 'FAIL', detail: 'No Facebook Pages returned. The connecting user must be an admin of at least one Page.', action: 'Ensure the user administers a Facebook Page and reauthorize.' };
    return { id: 'capability', label: 'Publishing capability', status: 'PASS', detail: `${pages.length} Page(s) available for publishing.` };
  }
  return { id: 'capability', label: 'Publishing capability', status: 'SKIP', detail: '' };
}
