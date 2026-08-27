-- Persist document-processing state so large PDF extraction can finish asynchronously.
ALTER TABLE knowledge
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'COMPLETE',
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS processed_pages INTEGER NOT NULL DEFAULT 0;
