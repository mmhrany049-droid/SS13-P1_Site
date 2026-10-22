// Migration registry (numbered, idempotent, logged in the `_migrations` collection). PostgreSQL DDL: ./postgres/.
import m001 from './001_core.mjs';
import m002 from './002_event_indexes.mjs';
export const MIGRATIONS = [m001, m002];
