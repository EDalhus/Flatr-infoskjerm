import * as claude from './claude.js';

// AI-assistentene som Flatr Apps. Nøkkel = app-kind i katalogen
// (src/lib/appCatalog.js). En ny assistent (f.eks. Cursor) får sin egen fil
// med samme form som claude.js: run, verifyKey, errorText, MODEL_LABEL.
export const AGENTS = { claude };
export const AGENT_KINDS = Object.keys(AGENTS);
