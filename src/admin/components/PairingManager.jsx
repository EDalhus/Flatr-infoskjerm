// Admin-panel for enhets-parring.
//
// Slik henger det sammen:
//   1. Apple TV-en viser en kode (f.eks. "ABC-DEF") ved oppstart.
//   2. Du taster koden inn her, velger hvilken skjerm den skal vise, og lagrer.
//      -> POST /api/pairing/link  (api.pairing.link)
//   3. TV-en oppdager parringen ved neste status-poll og begynner å vise skjermen.
//
// Lista under viser alle enheter (ventende + parede) og oppdateres hvert 5. sek.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import {
  Icon,
  Field,
  Input,
  Select,
  Button,
  IconButton,
  Card,
  GroupCard,
  Row,
  PageHeader,
  ErrorText
} from './ui.jsx';

// Vis "ABC-DEF" mens brukeren skriver; send bare bokstaver/tall til API-et.
const normalize = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const pretty = (s) => {
  const n = normalize(s);
  return n.length > 3 ? `${n.slice(0, 3)}-${n.slice(3)}` : n;
};

const STATUS_BADGE = {
  pending: { label: 'Venter', cls: 'bg-badge text-badge-ink' },
  paired: { label: 'Paret', cls: 'bg-ok-tint text-ok' },
  expired: { label: 'Utløpt', cls: 'bg-danger-tint text-danger' }
};

function timeAgo(iso) {
  if (!iso) return '–';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'nå nettopp';
  if (s < 3600) return `${Math.floor(s / 60)} min siden`;
  if (s < 86400) return `${Math.floor(s / 3600)} t siden`;
  return `${Math.floor(s / 86400)} d siden`;
}

export default function PairingManager({ onChange }) {
  const [screens, setScreens] = useState([]);
  const [pairings, setPairings] = useState([]);
  const [code, setCode] = useState('');
  const [screenId, setScreenId] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => {
    api.screens
      .list()
      .then((rows) => setScreens(rows || []))
      .catch((e) => setError(e.message));
  }, []);

  const loadPairings = () =>
    api.pairing
      .list()
      .then((rows) => setPairings(rows || []))
      .catch(() => {
        /* stille – lista er sekundær */
      });

  useEffect(() => {
    loadPairings();
    const t = setInterval(loadPairings, 5000);
    return () => clearInterval(t);
  }, []);

  const pendingCount = useMemo(
    () => pairings.filter((p) => p.status === 'pending').length,
    [pairings]
  );

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    const clean = normalize(code);
    if (clean.length < 4) return setError('Skriv inn koden som vises på TV-en.');
    if (!screenId) return setError('Velg hvilken skjerm enheten skal vise.');

    setBusy(true);
    try {
      const res = await api.pairing.link(clean, Number(screenId));
      setOk(
        res?.already
          ? `Allerede paret med «${res.screen_name}».`
          : `Enheten er nå paret med «${res.screen_name}». TV-en bytter innhold i løpet av noen sekunder.`
      );
      setCode('');
      await loadPairings();
      onChange?.();
    } catch (err) {
      // Backend gir tydelige meldinger for feil/utløpt/opptatt kode.
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const unpair = async (p) => {
    if (!confirm(`Opphev parringen${p.screen_name ? ` med «${p.screen_name}»` : ''}?`)) return;
    try {
      await api.pairing.unpair({ device_id: p.device_id });
      await loadPairings();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader
        crumbs={['Visning', 'Parring']}
        action={
          pendingCount > 0 ? (
            <span className="rounded-full bg-badge px-2.5 py-1 text-xs font-bold text-badge-ink">
              {pendingCount} venter
            </span>
          ) : null
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <Card title="Koble til en ny enhet">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Parringskode" hint="Vises på TV-en ved oppstart.">
              <Input
                ref={codeRef}
                value={pretty(code)}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC-DEF"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-lg tracking-[0.3em]"
              />
            </Field>
            <Field label="Skjerm" hint="Hva enheten skal vise etter parring.">
              <Select value={screenId} onChange={(e) => setScreenId(e.target.value)}>
                <option value="">Velg skjerm …</option>
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.location ? ` – ${s.location}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Kobler til …' : 'Koble til'}
              </Button>
              {ok && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-ok">
                  <Icon name="check" className="h-4 w-4" />
                  {ok}
                </span>
              )}
            </div>
            <div className="sm:col-span-2">
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>

        {pairings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen enheter ennå. Start infoskjerm-appen på en Apple TV for å få en kode.
          </p>
        ) : (
          <GroupCard label={`Enheter · ${pairings.length}`} icon="monitor">
            {pairings.map((p) => {
              const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.pending;
              return (
                <Row
                  key={p.id}
                  media={
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-hair">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          p.online ? 'bg-ok' : 'bg-muted/40'
                        }`}
                        title={p.online ? 'Online' : 'Offline'}
                      />
                    </span>
                  }
                  title={
                    <span className="flex items-center gap-2">
                      <span className="font-mono">
                        {p.code.slice(0, 3)}-{p.code.slice(3)}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </span>
                  }
                  meta={
                    <>
                      <span>{p.screen_name ? `→ ${p.screen_name}` : 'ingen skjerm'}</span>
                      {p.status === 'pending' && <span>· utløper {timeAgo(p.expires_at)}</span>}
                      {p.status === 'paired' && p.last_seen && (
                        <span>· sist sett {timeAgo(p.last_seen)}</span>
                      )}
                    </>
                  }
                  actions={
                    <IconButton
                      name="x"
                      label="Opphev parring"
                      tone="danger"
                      onClick={() => unpair(p)}
                    />
                  }
                />
              );
            })}
          </GroupCard>
        )}
      </div>
    </>
  );
}
