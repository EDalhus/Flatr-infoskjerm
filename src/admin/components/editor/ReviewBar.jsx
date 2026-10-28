// Godkjenning før publisering (src/api/review.js): viser om presentasjonen
// har endringer som ikke er på skjermene, og lar redaktører be om godkjenning
// og eiere publisere eller avvise. Vises bare når kontoen krever godkjenning.

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { Button } from '../ui.jsx';

const when = (iso) => new Date(iso).toLocaleString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ReviewBar({ playlistId, version, readOnly, onPublished }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(null); // 'request' | 'reject'
  const [error, setError] = useState('');

  const load = () => api.review.status(playlistId).then(setS).catch(() => setS(null));
  // Hent på nytt når presentasjonen endres (version teller opp) og jevnlig.
  useEffect(() => {
    const t = setTimeout(load, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, version]);
  useEffect(() => {
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  if (!s?.required) return null;

  const act = async (action) => {
    setBusy(true);
    setError('');
    try {
      setS(await api.review.act(playlistId, action, note.trim() || undefined));
      setAsking(null);
      setNote('');
      if (action === 'publish') onPublished?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const tone = s.has_changes ? 'border-warn/40 bg-warn/10' : 'border-line bg-zone/50';
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-sm ${tone}`}>
      <span className="font-semibold text-ink">{s.has_changes ? 'Utkast' : '✓ Publisert'}</span>
      <span className="min-w-0 flex-1 text-muted">
        {s.requested
          ? `${s.requested.by || 'Noen'} ba om godkjenning ${when(s.requested.at)}${s.requested.note ? `: «${s.requested.note}»` : ''}`
          : s.has_changes
            ? s.note || 'Endringene vises ikke på skjermene før en eier publiserer dem.'
            : s.published
              ? `Skjermene viser versjonen fra ${when(s.published.at)}${s.published.by ? ` (${s.published.by})` : ''}.`
              : ''}
      </span>
      {error && <span className="text-xs text-danger">{error}</span>}
      {asking ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(asking);
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={asking === 'reject' ? 'Hva må endres? (valgfritt)' : 'Melding til eieren (valgfritt)'}
            className="h-8 w-64 rounded-lg border border-line bg-paper px-2 text-sm text-ink outline-none focus:border-focus"
          />
          <Button size="sm" type="submit" variant={asking === 'reject' ? 'danger' : 'primary'} disabled={busy}>
            {asking === 'reject' ? 'Avvis' : 'Send'}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setAsking(null)}>
            Avbryt
          </Button>
        </form>
      ) : (
        !readOnly &&
        s.has_changes && (
          <div className="flex items-center gap-2">
            {s.can_publish ? (
              <>
                {s.requested && (
                  <Button size="sm" variant="outline" onClick={() => setAsking('reject')} disabled={busy}>
                    Avvis
                  </Button>
                )}
                <Button size="sm" onClick={() => act('publish')} disabled={busy}>
                  {busy ? 'Publiserer …' : 'Publiser til skjermene'}
                </Button>
              </>
            ) : s.requested ? (
              <span className="text-xs font-semibold text-muted">Venter på godkjenning</span>
            ) : (
              <Button size="sm" onClick={() => setAsking('request')} disabled={busy}>
                Send til godkjenning
              </Button>
            )}
          </div>
        )
      )}
    </div>
  );
}
