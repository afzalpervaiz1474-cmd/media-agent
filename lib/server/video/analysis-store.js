// Storage for video-analysis results, plus asset download / thumbnail upload.
//
// Analysis is stored in ONE normalized shape:
//   {
//     transcript, transcriptStatus ('ok'|'skipped'), transcriptReason,
//     frameNotes: [{ index, approxTimestampSec, note, status }],
//     frameStatus: 'ok'|'skipped'|'partial',
//     visualSummary,
//     thumbnailOptions: [{ storage_path, public_url, prompt, model, index }],
//     selectedThumbnailPath,
//     steps: [{ step, status, reason? }],   // last pipeline run
//     analyzed_at,
//   }
//
// Where it lives depends on whether the optional migration
// (supabase/migrations/20261025_video_analysis.sql) has been applied:
//   - Columns present (feature-detected from the asset row) -> dedicated
//     columns (transcript, visual_summary, frame_notes, ...).
//   - Otherwise -> media_assets.metadata.video_analysis (JSONB, always
//     available, no migration needed). Readers handle both, so old and new
//     rows behave the same.

export function getVideoAnalysis(asset) {
  if (!asset) return null;
  // Column path: the migration was applied (columns exist on the row).
  if ('transcript' in asset || 'visual_summary' in asset) {
    const frameNotes = Array.isArray(asset.frame_notes) ? asset.frame_notes : [];
    const thumbnailOptions = Array.isArray(asset.thumbnail_options) ? asset.thumbnail_options : [];
    const empty = asset.transcript == null && asset.visual_summary == null
      && frameNotes.length === 0 && thumbnailOptions.length === 0
      && asset.selected_thumbnail_path == null;
    if (empty) return null;
    return {
      transcript: asset.transcript ?? null,
      transcriptStatus: asset.transcript_status ?? (asset.transcript ? 'ok' : 'skipped'),
      transcriptReason: asset.transcript_reason ?? null,
      frameNotes,
      frameStatus: frameNotes.length ? 'ok' : 'skipped',
      visualSummary: asset.visual_summary ?? null,
      thumbnailOptions,
      selectedThumbnailPath: asset.selected_thumbnail_path ?? null,
      steps: null,
      analyzed_at: null,
    };
  }
  const stored = asset.metadata && asset.metadata.video_analysis;
  return stored && typeof stored === 'object' ? stored : null;
}

export function buildAnalysisPatch(asset, analysis) {
  if ('transcript' in asset || 'visual_summary' in asset) {
    return {
      transcript: analysis.transcript ?? null,
      transcript_status: analysis.transcriptStatus ?? null,
      transcript_reason: analysis.transcriptReason ?? null,
      visual_summary: analysis.visualSummary ?? null,
      frame_notes: analysis.frameNotes ?? [],
      thumbnail_options: analysis.thumbnailOptions ?? [],
      selected_thumbnail_path: analysis.selectedThumbnailPath ?? null,
    };
  }
  return {
    metadata: { ...(asset.metadata || {}), video_analysis: analysis },
  };
}

export async function saveVideoAnalysis(supabase, asset, analysis) {
  const patch = buildAnalysisPatch(asset, analysis);
  const { data, error } = await supabase.from('media_assets').update(patch).eq('id', asset.id);
  if (error) throw new Error(`Failed to save video analysis: ${error.message || error}`);
  return data;
}

// Download an asset's bytes from the `media` bucket. Falls back to a signed
// URL fetch when storage.download is unavailable.
export async function downloadAssetBuffer(supabase, asset) {
  if (!asset?.storage_path) throw new Error('Asset has no storage_path to download.');
  const downloaded = await supabase.storage.from('media').download(asset.storage_path);
  if (downloaded && !downloaded.error && downloaded.data) {
    const data = downloaded.data;
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (typeof data.arrayBuffer === 'function') return Buffer.from(await data.arrayBuffer());
  }
  const signed = await supabase.storage.from('media').createSignedUrl(asset.storage_path, 3600);
  const url = signed?.data?.signedUrl;
  if (!url) throw new Error(`Could not download asset ${asset.storage_path} (storage download and signed URL both failed).`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download asset (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

export async function uploadThumbnail(supabase, assetId, buffer, filename) {
  const storagePath = `thumbnails/${assetId}/${filename}`;
  const { error } = await supabase.storage.from('media').upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) throw new Error(`Thumbnail upload failed: ${error.message || error}`);
  const { data } = supabase.storage.from('media').getPublicUrl(storagePath);
  return { storage_path: storagePath, public_url: data?.publicUrl || null };
}

export function thumbnailPublicUrl(supabase, storagePath) {
  if (!storagePath) return null;
  try {
    const { data } = supabase.storage.from('media').getPublicUrl(storagePath);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}
