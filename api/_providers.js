// Central provider configuration registry. Reads server-only env vars.
// Never expose secret values — only booleans describing configuration state.

const PROVIDER_KEYS = {
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  instagram: ['META_APP_ID', 'META_APP_SECRET'],
  facebook: ['META_APP_ID', 'META_APP_SECRET'],
};

export const PROVIDER_META = {
  youtube: {
    name: 'YouTube',
    docs: 'https://developers.google.com/youtube/v3',
    envKeys: [...PROVIDER_KEYS.youtube, 'YOUTUBE_REDIRECT_URI (optional; auto-derived if omitted)'],
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'openid', 'email', 'profile',
    ],
    contentTypes: ['short', 'long'],
    limits: {
      shortMaxSec: 60,
      shortAspect: '9:16',
      longMaxBytes: 128 * 1024 * 1024 * 1024,
      shortMaxBytes: 300 * 1024 * 1024,
      mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    },
    notes: [
      'API projects that have not passed audit are limited to test users and video uploads are set to private (unlisted for verified accounts).',
      'A YouTube channel URL alone does NOT grant upload permission — OAuth is required.',
    ],
  },
  tiktok: {
    name: 'TikTok',
    docs: 'https://developers.tiktok.com/doc/content-posting-api-get-started/',
    envKeys: [...PROVIDER_KEYS.tiktok, 'TIKTOK_REDIRECT_URI (optional; auto-derived if omitted)'],
    scopes: ['user.info.basic', 'video.upload', 'video.publish'],
    contentTypes: ['video'],
    limits: {
      maxBytes: 500 * 1024 * 1024,
      minSec: 3,
      maxSec: 600,
      mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    },
    notes: [
      'Unaudited apps can only publish for approved test users and posts are forced to SELF_ONLY (private).',
      'Direct posting requires video.publish scope and creator_info validation before init.',
    ],
  },
  instagram: {
    name: 'Instagram',
    docs: 'https://developers.facebook.com/docs/instagram-api',
    envKeys: [...PROVIDER_KEYS.instagram, 'META_REDIRECT_URI (optional; auto-derived if omitted)'],
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ],
    contentTypes: ['reel', 'image', 'carousel'],
    limits: {
      reelMinSec: 3,
      reelMaxSec: 90,
      reelAspect: '9:16',
      imageMaxBytes: 8 * 1024 * 1024,
      videoMaxBytes: 1024 * 1024 * 1024,
      mimeTypes: ['video/mp4', 'video/quicktime', 'image/jpeg'],
    },
    notes: [
      'Requires an Instagram Business or Creator account linked to a Facebook Page.',
      'Personal Instagram accounts cannot publish via the API.',
      'Media must be hosted on a publicly reachable URL (Meta fetches it).',
    ],
  },
  facebook: {
    name: 'Facebook',
    docs: 'https://developers.facebook.com/docs/pages-api',
    envKeys: [...PROVIDER_KEYS.facebook, 'META_REDIRECT_URI (optional; auto-derived if omitted)'],
    scopes: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_engagement',
    ],
    contentTypes: ['post', 'video'],
    limits: {
      videoMaxBytes: 10 * 1024 * 1024 * 1024,
      mimeTypes: ['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png'],
    },
    notes: [
      'User must be an admin of the target Page.',
      'Personal-timeline publishing is not supported (deprecated by Meta).',
    ],
  },
};

export function providerConfigStatus() {
  const out = {};
  for (const p of Object.keys(PROVIDER_META)) {
    const keys = PROVIDER_KEYS[p];
    const missing = keys.filter((k) => !process.env[k]);
    out[p] = {
      configured: missing.length === 0,
      missing,
    };
  }
  return out;
}

export function aiConfigStatus() {
  return {
    openrouter: !!process.env.OPENROUTER_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    configured: !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY),
  };
}

// Resolve a redirect URI: env override wins, else derive from the request host.
export function resolveRedirectUri(req, provider) {
  const envKey = provider === 'youtube' ? 'YOUTUBE_REDIRECT_URI'
    : provider === 'tiktok' ? 'TIKTOK_REDIRECT_URI'
    : 'META_REDIRECT_URI';
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0];
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').toString().split(',')[0];
  return `${proto}://${host}/api/oauth/${provider}/callback`;
}
