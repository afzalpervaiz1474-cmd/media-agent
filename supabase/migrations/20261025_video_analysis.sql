-- Video analysis (v1) — optional schema addition for media_assets.
-- The runtime works WITHOUT this migration: analysis is stored in
-- media_assets.metadata.video_analysis (JSONB) when these columns do not
-- exist, and in the dedicated columns below once they do (the code
-- feature-detects them from the asset row). Apply this when you want
-- queryable columns instead of JSONB. RLS on media_assets applies to the
-- new columns automatically (same table, same policies).

alter table media_assets
  add column if not exists transcript text,
  add column if not exists transcript_status text,
  add column if not exists transcript_reason text,
  add column if not exists visual_summary text,
  add column if not exists frame_notes jsonb default '[]'::jsonb,
  add column if not exists thumbnail_options jsonb default '[]'::jsonb,
  add column if not exists selected_thumbnail_path text;

comment on column media_assets.transcript is 'Video-analysis v1: speech-to-text transcript (null when skipped).';
comment on column media_assets.visual_summary is 'Video-analysis v1: summary of real frame notes (null when skipped).';
comment on column media_assets.frame_notes is 'Video-analysis v1: per-frame vision notes [{index, approxTimestampSec, note, status}].';
comment on column media_assets.thumbnail_options is 'Video-analysis v1: generated thumbnail images [{storage_path, public_url, prompt, model, index}].';
comment on column media_assets.selected_thumbnail_path is 'Video-analysis v1: user-selected thumbnail storage_path (via POST /api/media/:id/thumbnail/select).';
