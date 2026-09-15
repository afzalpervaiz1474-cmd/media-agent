import supabase from './db-client.js';

// Load a fresh token for a user + provider. Refreshes if expired and we have a refresh token.
export async function getAccountAndToken(userId, provider) {
  const { data: account } = await supabase.from('connected_accounts').select('*').eq('user_id', userId).eq('provider', provider).maybeSingle();
  if (!account) return { account: null, token: null };
  const { data: token } = await supabase.from('oauth_tokens').select('*').eq('account_id', account.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!token) return { account, token: null };

  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now() + 60_000) {
    const refreshed = await tryRefresh(provider, token);
    if (refreshed) {
      const { data: updated } = await supabase.from('oauth_tokens').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || token.refresh_token,
        expires_at: refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', token.id).select('*').single();
      return { account, token: updated };
    }
  }
  return { account, token };
}

async function tryRefresh(provider, token) {
  if (!token?.refresh_token) return null;
  try {
    if (provider === 'youtube') {
      const body = new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        refresh_token: token.refresh_token, grant_type: 'refresh_token',
      });
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!r.ok) return null;
      return r.json();
    }
    if (provider === 'tiktok') {
      const body = new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token', refresh_token: token.refresh_token,
      });
      const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!r.ok) return null;
      return r.json();
    }
    // Meta long-lived tokens don't use standard refresh; you can extend via /oauth/access_token?grant_type=fb_exchange_token.
    if (provider === 'instagram' || provider === 'facebook') {
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: token.access_token,
      });
      const r = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?${params}`);
      if (!r.ok) return null;
      return r.json();
    }
  } catch { /* fallthrough */ }
  return null;
}
