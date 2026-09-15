import supabase from '../db-client.js';
import { preflight, getUser, requireUser, safeError } from '../_auth.js';

// GET /api/media/proxy?path=<storage_path>
// Proxies media files from Supabase storage to avoid CORS issues and support range requests for video streaming.
export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    const storagePath = String(req.query.path || '');
    if (!storagePath) return res.status(400).json({ error: 'path required' });

    // Verify the user owns this media
    const { data: item } = await supabase.from('media_assets').select('storage_path').eq('storage_path', storagePath).eq('user_id', user.id).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Media not found' });

    // Get signed URL
    const { data: signedData, error: signedError } = await supabase.storage.from('media').createSignedUrl(storagePath, 3600);
    if (signedError || !signedData?.signedUrl) {
      return res.status(404).json({ error: 'Failed to generate signed URL' });
    }

    // Fetch the media from Supabase storage
    const range = req.headers.range;
    const fetchHeaders = range ? { Range: range } : {};
    const upstream = await fetch(signedData.signedUrl, { headers: fetchHeaders });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Failed to fetch media from storage' });
    }

    // Copy relevant headers
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    const acceptRanges = upstream.headers.get('accept-ranges');
    const contentRange = upstream.headers.get('content-range');

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

    // Stream the response
    const stream = upstream.body;
    if (!stream) return res.status(500).end();

    const reader = stream.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } catch (err) {
    console.error('media proxy error', err);
    if (!res.headersSent) res.status(500).json({ error: 'Media proxy error' });
  }
}