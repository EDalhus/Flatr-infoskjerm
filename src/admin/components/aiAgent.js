// Hvilken AI-assistent (Flatr App) du bruker når flere er aktivert, f.eks.
// 'claude' eller 'cursor'. Huskes i nettleseren og deles mellom ⌘K-dialogen og
// AI-fanen i editoren. null = den første som er aktivert.

const KEY = 'flatr.ai.agent';

export function chosenAgent() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function chooseAgent(kind) {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    /* privat modus o.l. */
  }
  window.dispatchEvent(new CustomEvent('flatr:ai-agent', { detail: kind }));
}
