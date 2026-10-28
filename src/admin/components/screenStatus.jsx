// Status og «hva vises nå» for en skjerm – delt av Hjem, Skjermer og detaljskuffen.

/** online | offline | browser | idle */
export function screenState(s) {
  if (s.device) return s.device.online ? 'online' : 'offline';
  return s.online ? 'browser' : 'idle';
}

export function StatusPill({ s }) {
  const st = screenState(s);
  const [label, cls, dot] = {
    online: ['Online', 'bg-ok-tint text-ok', 'bg-ok'],
    browser: ['Online i nettleser', 'bg-ok-tint text-ok', 'bg-ok'],
    offline: ['Frakoblet', 'bg-warn-tint text-warn', 'bg-warn'],
    idle: ['Ikke i bruk', 'bg-zone text-muted', 'bg-muted/50']
  }[st];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/** «Viser «Velkommen»» / «Tidsplan: Lunsj» / «Av (tidsplan)». */
export function showing(s) {
  if (s.now_closed) return 'Av nå (utenfor åpningstid)';
  if (s.now_off) return 'Av nå (tidsplan)';
  if (s.now_slot) return `Tidsplan: ${s.now_playlist_name || s.now_slot.title || 'ingenting'}`;
  return s.playlist_name ? `Viser «${s.playlist_name}»` : 'Viser ingenting';
}
