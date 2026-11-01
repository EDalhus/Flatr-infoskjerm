// flatr.no/gruppe – oversikt for kjeder, kommuner og kretser (server/groups.js).
// Gruppens administratorer ser alle skjermene hos medlemmene samlet, sender
// hastemeldinger til alle og kopierer presentasjoner fra ett medlem til resten.

import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AuthShell } from './AuthPages.jsx';
import LoginForm from './LoginForm.jsx';
import { authClient } from '../lib/authClient.js';
import { SEVERITIES, DISPLAYS } from '../lib/alerts.js';
import { Button, ErrorText, Field, Icon, Input, Select, Textarea } from '../admin/components/ui.jsx';
import { LogoLockup } from '../admin/components/Logo.jsx';
import { tr } from '../lib/i18n.js';

const call = async (path, opts = {}) => {
  const res = await fetch(`/api/platform/groups${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || `${res.status}`), { status: res.status });
  return data;
};

const ago = (iso) => {
  if (!iso) return 'aldri';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min siden`;
  if (s < 86400) return `${Math.floor(s / 3600)} t siden`;
  return `${Math.floor(s / 86400)} d siden`;
};

function Shell({ children }) {
  return (
    <div className="min-h-full overflow-y-auto bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-line bg-card px-6 py-3">
        <Link to="/gruppe">
          <LogoLockup className="h-6 w-auto text-ink" />
        </Link>
        <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-bold text-brand">{tr('Gruppe')}</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={async () => {
            await authClient.signOut().catch(() => {});
            window.location.reload();
          }}
        >
          {tr('Logg ut')}
        </Button>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}

/** Hastemelding til alle (eller noen) av medlemmene. */
function GroupAlert({ group, onDone }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('warning');
  const [display, setDisplay] = useState('flash');
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const send = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!confirm(tr('Sende hastemeldingen til alle skjermene hos {0} organisasjoner?', [group.members.length]))) return;
    setBusy(true);
    try {
      const r = await call(`/${group.id}/alert`, { method: 'POST', body: { title, message, severity, display, duration_minutes: Number(minutes) || null } });
      setNotice(tr('Sendt til {0} av {1} organisasjoner.', [r.sent, r.of]));
      setTitle('');
      setMessage('');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const end = async () => {
    setError('');
    try {
      const r = await call(`/${group.id}/alert`, { method: 'DELETE' });
      setNotice(r.ended ? tr('Avsluttet hos {0}.', [r.ended === 1 ? tr('én organisasjon') : tr('{0} organisasjoner', [r.ended])]) : tr('Ingen hastemeldinger fra gruppen vises nå.'));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form onSubmit={send} className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="m-0 text-base font-bold">{tr('Hastemelding til alle')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('Tittel (valgfri)')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={tr('F.eks. «Stengt i dag»')} />
        </Field>
        <Field label={tr('Hvor lenge')}>
          <Select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
            <option value={30}>{tr('30 minutter')}</option>
            <option value={60}>{tr('1 time')}</option>
            <option value={180}>{tr('3 timer')}</option>
            <option value={480}>{tr('8 timer')}</option>
            <option value={1440}>{tr('1 døgn')}</option>
            <option value="">{tr('Til den avsluttes')}</option>
          </Select>
        </Field>
      </div>
      <Field label={tr('Melding')}>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('Alvorlighet')}>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr('Visning')}>
          <Select value={display} onChange={(e) => setDisplay(e.target.value)}>
            {DISPLAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      {notice && <p className="m-0 text-sm font-semibold text-ok">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !message.trim()}>
          <Icon name="megaphone" className="h-4 w-4" />
          {busy ? tr('Sender …') : tr('Send til alle')}
        </Button>
        <Button type="button" variant="outline" onClick={end}>
          {tr('Avslutt gruppens hastemeldinger')}
        </Button>
      </div>
    </form>
  );
}

/** Kopier en presentasjon fra ett medlem til alle de andre. */
function SharePresentation({ group }) {
  const [tenant, setTenant] = useState(group.members[0]?.id || '');
  const [playlists, setPlaylists] = useState([]);
  const [playlist, setPlaylist] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setPlaylists([]);
    setPlaylist('');
    if (tenant)
      call(`/${group.id}/playlists?tenant=${tenant}`)
        .then((list) => {
          setPlaylists(list);
          setPlaylist(list[0]?.id || '');
        })
        .catch((err) => setError(err.message));
  }, [tenant, group.id]);
  const share = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!confirm(tr('Kopiere presentasjonen til de {0} andre organisasjonene? Den legges til som en ny presentasjon hos hver av dem.', [group.members.length - 1]))) return;
    setBusy(true);
    try {
      const r = await call(`/${group.id}/share`, { method: 'POST', body: { tenant_id: Number(tenant), playlist_id: Number(playlist), name } });
      setNotice(tr('Kopiert til {0} organisasjoner. De finner den under Presentasjoner.', [r.copied]));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={share} className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="m-0 text-base font-bold">{tr('Del en presentasjon')}</h2>
      <p className="m-0 text-sm text-muted">{tr('Lag den hos én organisasjon, og kopier den til alle de andre – med bilder. Hver av dem kan endre sin kopi.')}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tr('Fra')}>
          <Select value={tenant} onChange={(e) => setTenant(e.target.value)}>
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr('Presentasjon')}>
          <Select value={playlist} onChange={(e) => setPlaylist(e.target.value)} disabled={!playlists.length}>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr('Navn hos de andre (valgfritt)')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={tr('Samme navn')} />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      {notice && <p className="m-0 text-sm font-semibold text-ok">{notice}</p>}
      <Button type="submit" disabled={busy || !playlist || group.members.length < 2}>
        <Icon name="copy" className="h-4 w-4" />
        {busy ? tr('Kopierer …') : tr('Kopier til alle')}
      </Button>
    </form>
  );
}

function Overview({ id }) {
  const [group, setGroup] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const load = () =>
    call(`/${id}`)
      .then(setGroup)
      .catch((err) => setError(err.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (group) document.title = tr('{0} – Flatr', [group.name]);
  }, [group]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (group?.members || []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.screens.some((s) => s.name.toLowerCase().includes(q)));
  }, [group, query]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!group) return <p className="text-sm text-muted">{tr('Henter gruppen …')}</p>;
  const offline = group.members.flatMap((m) => m.screens.filter((s) => !s.online).map((s) => ({ ...s, org: m.name })));
  return (
    <>
      <div>
        <h1 className="page-title m-0">{group.name}</h1>
        <p className="m-0 mt-1 text-sm text-muted">
          {group.members.length} {tr('organisasjoner')}
          {group.plan ? ` · ${tr(group.plan.name)}${group.max_screens ? tr(' med {0} skjermer i avtalen', [group.max_screens]) : ''}` : ''}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-4">
        {[
          [tr('Organisasjoner'), group.members.length],
          [tr('Skjermer'), group.max_screens ? tr('{0} av {1}', [group.screens.total, group.max_screens]) : group.screens.total],
          [tr('På nett nå'), group.screens.online],
          [tr('Frakoblet'), group.screens.total - group.screens.online]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-card p-4">
            <div className="text-xs font-semibold text-muted">{label}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
          </div>
        ))}
      </section>

      {offline.length > 0 && (
        <p className="m-0 rounded-xl bg-warn-tint px-4 py-3 text-sm text-ink">
          {tr('Frakoblet:')} {offline.slice(0, 6).map((s) => `${s.name} (${s.org})`).join(', ')}
          {offline.length > 6 ? tr(' og {0} til', [offline.length - 6]) : ''}.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupAlert group={group} onDone={load} />
        <SharePresentation group={group} />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-bold">{tr('Organisasjonene')}</h2>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Søk organisasjon eller skjerm …')} className="max-w-xs" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((m) => (
            <div key={m.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{m.name}</div>
                  <div className="text-xs text-muted">
                    {m.screens.length} {m.screens.length === 1 ? 'skjerm' : 'skjermer'} · {m.screens.filter((s) => s.online).length} {tr('på nett')}
                  </div>
                </div>
                <a href={m.url} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-brand hover:underline">
                  {tr('Åpne →')}
                </a>
              </div>
              {m.screens.length > 0 && (
                <ul className="m-0 mt-3 list-none space-y-1.5 p-0 text-sm">
                  {m.screens.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${s.online ? 'bg-ok' : 'bg-line'}`} aria-label={s.online ? tr('På nett') : tr('Frakoblet')} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="shrink-0 text-xs text-muted">{s.online ? s.playlist || tr('ingen presentasjon') : ago(s.last_seen)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function GroupPage() {
  const { id } = useParams();
  const [groups, setGroups] = useState(undefined);
  useEffect(() => {
    document.title = tr('Gruppe – Flatr');
    call('')
      .then(setGroups)
      .catch((err) => setGroups(err.status === 401 ? null : []));
  }, []);

  if (groups === undefined) return <div className="h-full bg-paper" />;
  if (groups === null)
    return (
      <AuthShell title={tr('Logg inn')} subtitle={tr('Oversikten for kjeder, kommuner og kretser.')}>
        <LoginForm onDone={() => window.location.reload()} />
      </AuthShell>
    );
  return (
    <Shell>
      {id ? (
        <Overview id={id} />
      ) : (
        <>
          <h1 className="page-title m-0">{tr('Gruppene dine')}</h1>
          {groups.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((g) => (
                <Link key={g.id} to={`/gruppe/${g.id}`} className="rounded-2xl border border-line bg-card p-5 text-ink no-underline hover:border-brand">
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-sm text-muted">{g.members} {tr('organisasjoner')}</div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">{tr('Du er ikke administrator for noen grupper. Kjeder, kommuner og kretser kan få en samlet oversikt – ta kontakt med oss.')}</p>
          )}
        </>
      )}
    </Shell>
  );
}
