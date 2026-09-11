import supabase from '../../db-client.js';
import { preflight, safeError, audit } from '../../_auth.js';
import { PROVIDER_META, providerConfigStatus, resolveRedirectUri } from '../../_providers.js';

// GET /api/oauth/:provider/callback
// The provider redirects the user's browser here with ?code&state.
// We render a small HTML page that either shows an error or posts a message and closes,
// after storing the connected_account + oauth_tokens rows.
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  const provider = String(req.query.provider || '').toLowerCase();
  const meta = PROVIDER_META[provider];
  if (!meta) return sendHtml(res, 400, 'Unknown provider', 'This provider is not supported.');

  const rawState = String(req.query.state || '');
  const code = String(req.query.code || '');
  const errorParam = req.query.error;

  if (errorParam) {
    return sendHtml(res, 400, `${meta.name} authorization failed`, `${errorParam}: ${req.query.error_description || ''}`);
  }
  if (!code || !rawState) {
    return sendHtml(res, 400, 'Missing authorization code', 'The provider did not return the expected fields.');
  }

  // Meta stuffs state as `state|provider` because Facebook is shared between IG and FB.
  const state = rawState.split('|')[0];

  try {
    const { data: stateRow } = await supabase.from('oauth_states').select('*').eq('state', state).maybeSingle();
    if (!stateRow) return sendHtml(res, 400, 'Invalid OAuth state', 'This authorization link is stale or was tampered with.');
    if (stateRow.provider !== provider) return sendHtml(res, 400, 'Provider mismatch', '');
    if (new Date(stateRow.created_at).getTime() < Date.now() - 15 * 60 * 1000) {
      return sendHtml(res, 400, 'Authorization expired', 'Please start the connection flow again.');
    }
    await supabase.from('oauth_states').delete().eq('state', state);

    const cfg = providerConfigStatus()[provider];
    if (!cfg.configured) return sendHtml(res, 500, 'Provider not configured', cfg.missing.join(', '));

    const redirectUri = resolveRedirectUri(req, provider);
    const tokens = await exchangeCode(provider, code, redirectUri, stateRow.code_verifier);
    const profile = await fetchProfile(provider, tokens.access_token);

    const account = await upsertAccount({
      user_id: stateRow.user_id,
      provider,
      provider_account_id: profile.provider_account_id,
      handle: profile.handle,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      scopes: (tokens.scope || meta.scopes.join(' ')).split(/[,\s]+/).filter(Boolean),
      raw_profile: profile.raw,
    });

    await supabase.from('oauth_tokens').insert({
      user_id: stateRow.user_id,
      account_id: account.id,
      provider,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_type: tokens.token_type || 'Bearer',
      expires_at: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null,
      scope: tokens.scope || null,
      raw_profile: profile.raw || {},
      extra: profile.extra || {},
    });

    await audit(stateRow.user_id, 'oauth.connected', { type: 'connected_account', id: account.id, data: { provider } });

    return sendHtml(res, 200, `${meta.name} connected`, `Signed in as ${profile.display_name || profile.handle || profile.provider_account_id}.`, /* success */ true, provider);
  } catch (err) {
    console.error('oauth callback error', err);
    return sendHtml(res, 500, 'OAuth callback failed', safeError(err));
  }
}

async function exchangeCode(provider, code, redirectUri, verifier) {
  if (provider === 'youtube') {
    const body = new URLSearchParams({
      code, client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) throw new Error(`Google token exchange failed (${r.status}): ${await r.text()}`);
    return r.json();
  }
  if (provider === 'tiktok') {
    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: verifier || '',
    });
    const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) throw new Error(`TikTok token exchange failed (${r.status}): ${await r.text()}`);
    return r.json();
  }
  if (provider === 'instagram' || provider === 'facebook') {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET,
      redirect_uri: redirectUri, code,
    });
    const r = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?${params}`);
    if (!r.ok) throw new Error(`Meta token exchange failed (${r.status}): ${await r.text()}`);
    return r.json();
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function fetchProfile(provider, accessToken) {
  if (provider === 'youtube') {
    // Preferred: fetch the user's own channel via the youtube.readonly scope.
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error(`YouTube channel fetch failed (${r.status}): ${await r.text()}`);
    const json = await r.json();
    const ch = json.items?.[0];
    if (!ch) throw new Error('No YouTube channel found for this Google account.');
    return {
      provider_account_id: ch.id,
      handle: ch.snippet?.customUrl || ch.snippet?.title,
      display_name: ch.snippet?.title,
      avatar_url: ch.snippet?.thumbnails?.default?.url,
      raw: ch,
      extra: { channel_url: `https://www.youtube.com/channel/${ch.id}`, subscribers: ch.statistics?.subscriberCount, videos: ch.statistics?.videoCount },
    };
  }
  if (provider === 'tiktok') {
    const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error(`TikTok user fetch failed (${r.status}): ${await r.text()}`);
    const json = await r.json();
    const u = json.data?.user;
    if (!u) throw new Error('TikTok returned no user info.');
    return {
      provider_account_id: u.open_id || u.union_id,
      handle: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      raw: u,
      extra: {},
    };
  }
  if (provider === 'facebook') {
    const meRes = await fetch(`https://graph.facebook.com/v20.0/me?fields=id,name,picture&access_token=${accessToken}`);
    if (!meRes.ok) throw new Error(`Facebook /me failed (${meRes.status}): ${await meRes.text()}`);
    const me = await meRes.json();
    const pagesRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,category,tasks&access_token=${accessToken}`);
    const pages = pagesRes.ok ? await pagesRes.json() : { data: [] };
    return {
      provider_account_id: me.id,
      handle: me.name,
      display_name: me.name,
      avatar_url: me.picture?.data?.url,
      raw: me,
      extra: { pages: pages.data || [] },
    };
  }
  if (provider === 'instagram') {
    const meRes = await fetch(`https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${accessToken}`);
    if (!meRes.ok) throw new Error(`Meta /me failed (${meRes.status}): ${await meRes.text()}`);
    const me = await meRes.json();
    const pagesRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${accessToken}`);
    const pages = pagesRes.ok ? await pagesRes.json() : { data: [] };
    const igPages = (pages.data || []).filter((p) => p.instagram_business_account);
    const primary = igPages[0];
    if (!primary) {
      // Return a valid but unverified profile so we can render "no IG business account attached" state accurately.
      return {
        provider_account_id: me.id,
        handle: me.name,
        display_name: me.name,
        avatar_url: null,
        raw: me,
        extra: { pages: pages.data || [], warning: 'No Instagram Business account is linked to any Facebook Page for this user. Instagram publishing requires an IG Business account attached to a Page.' },
      };
    }
    const ig = primary.instagram_business_account;
    return {
      provider_account_id: ig.id,
      handle: ig.username,
      display_name: ig.username,
      avatar_url: ig.profile_picture_url,
      raw: { me, page: primary, ig },
      extra: { pages: pages.data || [], page_id: primary.id, page_access_token: primary.access_token },
    };
  }
  throw new Error(`Unsupported profile provider: ${provider}`);
}

async function upsertAccount(row) {
  const { data: existing } = await supabase.from('connected_accounts').select('*').eq('user_id', row.user_id).eq('provider', row.provider).eq('provider_account_id', row.provider_account_id).maybeSingle();
  if (existing) {
    const { data } = await supabase.from('connected_accounts').update({
      handle: row.handle, display_name: row.display_name, avatar_url: row.avatar_url,
      scopes: row.scopes, status: 'connected', last_synced_at: new Date().toISOString(),
    }).eq('id', existing.id).select('*').single();
    // Purge old tokens for this account so we don't accumulate.
    await supabase.from('oauth_tokens').delete().eq('account_id', existing.id);
    return data;
  }
  const { data } = await supabase.from('connected_accounts').insert({
    user_id: row.user_id, provider: row.provider, provider_account_id: row.provider_account_id,
    handle: row.handle, display_name: row.display_name, avatar_url: row.avatar_url,
    scopes: row.scopes, status: 'connected', last_synced_at: new Date().toISOString(),
  }).select('*').single();
  return data;
}

function sendHtml(res, status, title, message, success = false, provider = '') {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const script = success
    ? `<script>try{window.opener&&window.opener.postMessage({type:'modulate-oauth',status:'success',provider:${JSON.stringify(provider)}},'*')}catch(e){}setTimeout(function(){window.close()},900);</script>`
    : `<script>try{window.opener&&window.opener.postMessage({type:'modulate-oauth',status:'error',message:${JSON.stringify(message)}},'*')}catch(e){}</script>`;
  res.status(status).end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:ui-sans-serif,system-ui;background:#fbfaf7;color:#16150f;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{border:1px solid #e7e3d9;border-radius:12px;padding:32px;max-width:420px;background:#fff}.ok{color:#2f7d55}.err{color:#b53a2a}h1{font-family:'Instrument Serif',Georgia,serif;font-size:28px;margin:0 0 8px}p{color:#3a382d;font-size:14px;line-height:1.5}</style></head><body><div class="card"><h1 class="${success?'ok':'err'}">${title}</h1><p>${escapeHtml(message)}</p><p style="color:#7b7666">You can close this window.</p></div>${script}</body></html>`);
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
