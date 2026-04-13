-- Allow non-1536 embedding models (for example Doubao 1024/2048 dims).
-- Run once on existing DBs before reindexing documents with the new embedding provider.
ALTER TABLE knowledge_chunks
  ALTER COLUMN embedding TYPE VECTOR
  USING embedding::VECTOR;
