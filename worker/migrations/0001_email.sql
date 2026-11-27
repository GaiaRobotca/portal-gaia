CREATE TABLE IF NOT EXISTS state (
  path TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  version INTEGER NOT NULL,
  kind TEXT GENERATED ALWAYS AS (substr(path, 1, instr(path, '/') - 1)) STORED,
  status TEXT GENERATED ALWAYS AS (json_extract(value, '$.status')) STORED,
  updated_at INTEGER GENERATED ALWAYS AS (json_extract(value, '$.updatedAt')) STORED,
  next_at INTEGER GENERATED ALWAYS AS (json_extract(value, '$.nextAttemptAt')) STORED,
  provider TEXT GENERATED ALWAYS AS (json_extract(value, '$.provider')) STORED
);
CREATE INDEX IF NOT EXISTS state_due ON state(kind, status, next_at);
CREATE INDEX IF NOT EXISTS state_updated ON state(kind, updated_at);
