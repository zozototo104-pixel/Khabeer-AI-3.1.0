-- Persist the source document page count when extraction can determine it.
-- Nullable keeps existing knowledge rows and non-paginated formats compatible.

ALTER TABLE knowledge
  ADD COLUMN IF NOT EXISTS page_count INTEGER;
