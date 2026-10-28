// Kobler en pågående Cursor-oppgave (cursor.js) til MCP-serveren (src/api/mcp.js).
// Cursor-agenten kjører i Cursors sky og bruker Flatr-verktøyene via MCP. Hver
// oppgave får en tilfeldig nøkkel som bare gjelder mens den kjører, og verktøyene
// kjører med rettighetene til den som startet oppgaven. Én Node-prosess, så et
// vanlig Map holder.

const runs = new Map(); // nøkkel -> { tools, defs, call(name, input) }

export const openRun = (token, run) => runs.set(token, run);
export const closeRun = (token) => runs.delete(token);
export const runFor = (token) => (token ? runs.get(token) : undefined);
