// Real publishing adapters. Each returns { provider_post_id, provider_url, raw }.
// If a requirement isn't met (missing token, missing IG business account, invalid media),
// throws a descriptive error. NEVER fabricates a success response.
import { getAccountAndToken } from './_tokens.js';

async function fetchAsBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch media from ${url} (${r.status})`);
  const contentType = r.headers.get('content-type') || 'application/octet-stream';
  const arrayBuf = await r.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), contentType, size: arrayBuf.byteLength };
}

export async function publishYouTube({ userId, media, metadata, contentType = 'long', privacyStatus = 'private' }) {
  const { account, token } = await getAccountAndToken(userId, 'youtube');
  if (!account) throw new Error('YouTube account not connected. Connect via /youtube.');
  if (!token?.access_token) throw new Error('YouTube token missing. Reconnect the account.');
  if (!media?.public_url) throw new Error('Media asset has no accessible URL.');
  if (!media.mime_type?.startsWith('video/')) throw new Error('YouTube uploads must be video files.');

  // Snippet + status payload
  const snippet = {
    title: (metadata.title || 'Untitled').slice(0, 100),
    description: (metadata.description || '').slice(0, 5000),
    tags: Array.isArray(metadata.tags) ? metadata.tags.slice(0, 15) : [],
    categoryId: metadata.categoryId || '22', // People & Blogs by default
  };
  const status = { privacyStatus, selfDeclaredMadeForKids: false };
  if (contentType === 'short') {
    // YouTube auto-detects Shorts (vertical + ≤60s). The #Shorts hashtag helps discovery.
    if (!snippet.title.toLowerCase().includes('#shorts')) {
      snippet.description = `${snippet.description}\n\n#Shorts`.trim();
    }
  }

  const { buffer, contentType: mime } = await fetchAsBuffer(media.public_url);

  // Multipart/related upload (single-shot). Resumable would be better for large files;
  // a dedicated worker with fluent-ffmpeg + resumable session handles that in production.
  const boundary = '-------modulate-' + Math.random().toString(36).slice(2);
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ snippet, status })}\r\n`;
  const mediaPart = `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(metaPart, 'utf8'),
    Buffer.from(mediaPart, 'utf8'),
    buffer,
    Buffer.from(closing, 'utf8'),
  ]);

  const r = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`YouTube upload failed (${r.status}): ${safeSlice(text)}`);
  const json = JSON.parse(text);
  return {
    provider_post_id: json.id,
    provider_url: `https://www.youtube.com/watch?v=${json.id}`,
    raw: json,
  };
}

export async function publishTikTok({ userId, media, metadata, privacy_level = 'SELF_ONLY' }) {
  const { account, token } = await getAccountAndToken(userId, 'tiktok');
  if (!account) throw new Error('TikTok account not connected. Connect via /tiktok.');
  if (!token?.access_token) throw new Error('TikTok token missing. Reconnect the account.');
  if (!media?.public_url) throw new Error('Media asset has no accessible URL.');
  if (!media.mime_type?.startsWith('video/')) throw new Error('TikTok requires a video file.');

  // Step 1: query creator info to enforce allowed privacy options / interaction settings.
  const infoRes = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' },
  });
  const infoText = await infoRes.text();
  if (!infoRes.ok) throw new Error(`TikTok creator_info failed (${infoRes.status}): ${safeSlice(infoText)}`);
  const info = JSON.parse(infoText);
  const allowed = info?.data?.privacy_level_options || [];
  if (allowed.length && !allowed.includes(privacy_level)) {
    // Fall back to the most restrictive allowed level.
    privacy_level = allowed.includes('SELF_ONLY') ? 'SELF_ONLY' : allowed[0];
  }

  // Step 2: init a direct post via PULL_FROM_URL. The URL must be reachable by TikTok.
  const initBody = {
    post_info: {
      title: (metadata.title || metadata.caption || 'Untitled').slice(0, 150),
      privacy_level,
      disable_duet: false, disable_comment: false, disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: { source: 'PULL_FROM_URL', video_url: media.public_url },
  };
  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(initBody),
  });
  const initText = await initRes.text();
  if (!initRes.ok) throw new Error(`TikTok init failed (${initRes.status}): ${safeSlice(initText)}`);
  const init = JSON.parse(initText);
  const publish_id = init?.data?.publish_id;
  if (!publish_id) throw new Error(`TikTok did not return a publish_id: ${safeSlice(initText)}`);
  // Provider URL is not known until TikTok processes the upload — we surface publish_id and status.
  return {
    provider_post_id: publish_id,
    provider_url: null,
    raw: init,
  };
}

export async function publishInstagram({ userId, media, metadata, contentType = 'reel' }) {
  const { account, token } = await getAccountAndToken(userId, 'instagram');
  if (!account) throw new Error('Instagram account not connected. Connect via /instagram.');
  const igUserId = account.provider_account_id;
  const pageToken = (await getPageToken(userId, account, token)) || token?.access_token;
  if (!pageToken) throw new Error('Instagram page/user token missing. Reconnect.');
  if (!media?.public_url) throw new Error('Media asset has no accessible URL.');

  const isImage = media.mime_type?.startsWith('image/');
  const containerBody = new URLSearchParams({ access_token: pageToken, caption: (metadata.caption || metadata.description || '').slice(0, 2200) });
  if (isImage) {
    containerBody.set('image_url', media.public_url);
  } else {
    if (contentType === 'reel') containerBody.set('media_type', 'REELS');
    else containerBody.set('media_type', 'VIDEO');
    containerBody.set('video_url', media.public_url);
  }
  const createRes = await fetch(`https://graph.facebook.com/v20.0/${igUserId}/media`, { method: 'POST', body: containerBody });
  const createText = await createRes.text();
  if (!createRes.ok) throw new Error(`Instagram container create failed (${createRes.status}): ${safeSlice(createText)}`);
  const created = JSON.parse(createText);
  const creationId = created.id;

  // Poll status (max ~30s of waits; a worker should own long waits).
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await fetch(`https://graph.facebook.com/v20.0/${creationId}?fields=status_code,status&access_token=${pageToken}`);
    if (s.ok) {
      const sj = await s.json();
      if (sj.status_code === 'FINISHED') break;
      if (sj.status_code === 'ERROR') throw new Error(`Instagram media processing error: ${sj.status || 'unknown'}`);
    }
  }

  const pubRes = await fetch(`https://graph.facebook.com/v20.0/${igUserId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: pageToken }),
  });
  const pubText = await pubRes.text();
  if (!pubRes.ok) throw new Error(`Instagram media_publish failed (${pubRes.status}): ${safeSlice(pubText)}`);
  const pub = JSON.parse(pubText);
  const mediaId = pub.id;
  // Fetch permalink
  const permRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}?fields=permalink&access_token=${pageToken}`);
  const perm = permRes.ok ? await permRes.json() : {};
  return { provider_post_id: mediaId, provider_url: perm.permalink || null, raw: { pub, perm } };
}

export async function publishFacebook({ userId, media, metadata, pageId = null }) {
  const { account, token } = await getAccountAndToken(userId, 'facebook');
  if (!account) throw new Error('Facebook account not connected. Connect via /facebook.');
  if (!token?.access_token) throw new Error('Facebook token missing. Reconnect.');
  const pages = (token?.extra?.pages) || (await refreshMetaPages(token.access_token));
  const page = pages.find((p) => p.id === pageId) || pages[0];
  if (!page) throw new Error('No Facebook Page is available to publish to. Ensure your user is an admin of at least one Page.');
  if (!page.access_token) throw new Error('Facebook Page token missing. Reconnect with pages_show_list + pages_manage_posts scopes.');

  const isImage = media.mime_type?.startsWith('image/');
  const isVideo = media.mime_type?.startsWith('video/');
  if (isVideo) {
    const body = new URLSearchParams({
      file_url: media.public_url,
      description: (metadata.description || metadata.caption || '').slice(0, 5000),
      access_token: page.access_token,
    });
    const r = await fetch(`https://graph-video.facebook.com/v20.0/${page.id}/videos`, { method: 'POST', body });
    const t = await r.text();
    if (!r.ok) throw new Error(`Facebook video publish failed (${r.status}): ${safeSlice(t)}`);
    const j = JSON.parse(t);
    return { provider_post_id: j.id, provider_url: j.id ? `https://facebook.com/${j.id}` : null, raw: j };
  }
  if (isImage) {
    const body = new URLSearchParams({ url: media.public_url, caption: (metadata.caption || '').slice(0, 5000), access_token: page.access_token });
    const r = await fetch(`https://graph.facebook.com/v20.0/${page.id}/photos`, { method: 'POST', body });
    const t = await r.text();
    if (!r.ok) throw new Error(`Facebook photo publish failed (${r.status}): ${safeSlice(t)}`);
    const j = JSON.parse(t);
    return { provider_post_id: j.post_id || j.id, provider_url: j.post_id ? `https://facebook.com/${j.post_id}` : null, raw: j };
  }
  // Plain text post
  const body = new URLSearchParams({ message: (metadata.description || metadata.caption || '').slice(0, 5000), access_token: page.access_token });
  const r = await fetch(`https://graph.facebook.com/v20.0/${page.id}/feed`, { method: 'POST', body });
  const t = await r.text();
  if (!r.ok) throw new Error(`Facebook feed publish failed (${r.status}): ${safeSlice(t)}`);
  const j = JSON.parse(t);
  return { provider_post_id: j.id, provider_url: j.id ? `https://facebook.com/${j.id}` : null, raw: j };
}

async function getPageToken(userId, account, token) {
  // Prefer page_access_token captured at connect time.
  const stored = token?.extra?.page_access_token;
  if (stored) return stored;
  const pages = await refreshMetaPages(token?.access_token);
  const page = pages.find((p) => p.instagram_business_account?.id === account.provider_account_id) || pages[0];
  return page?.access_token || null;
}

async function refreshMetaPages(userAccessToken) {
  if (!userAccessToken) return [];
  const r = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userAccessToken}`);
  if (!r.ok) return [];
  const j = await r.json();
  return j.data || [];
}

function safeSlice(text) { return String(text || '').slice(0, 500); }
