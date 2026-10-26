// flatr.no/superadmin – plattformeierens oversikt over alle kontoer.
import { useEffect, useMemo, useState } from 'react';
import { AuthShell, CheckEmail } from './AuthPages.jsx';
import { Button, ErrorText, Field, Icon, Input } from '../admin/components/ui.jsx';
import { LogoLockup } from '../admin/components/Logo.jsx';

const call = async (path, opts = {}) => {
  const res = await fetch(`/api/superadmin${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || `${res.status}`), { status: res.status });
  return data;
};

const fmtBytes = (b) => {
  const n = Number(b) || 0;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
};
const ago = (iso) => {
  if (!iso) return '–';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min siden`;
  if (s < 86400) return `${Math.floor(s / 3600)} t siden`;
  return `${Math.floor(s / 86400)} d siden`;
};
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

function Login({ expired }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(expired ? 'Lenken er utløpt eller brukt. Be om en ny.' : '');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await call('/login', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <AuthShell title={sent ? 'Sjekk e-posten din' : 'Superadmin'} subtitle={sent ? null : 'Bare for plattformens eiere.'}>
      {sent ? (
        <CheckEmail email={email} onBack={() => setSent(false)}>
          Har adressen superadmin-tilgang, finner du en innloggingslenke der.
        </CheckEmail>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-post">
            <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full py-3">
            Send innloggingslenke
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

function QuotaEditor({ t, onSaved, onClose }) {
  const [f, setF] = useState({
    max_storage_mb: t.overrides.max_storage_mb ?? '',
    max_devices: t.overrides.max_devices ?? '',
    max_screens: t.overrides.max_screens ?? ''
  });
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try {
      onSaved(await call(`/tenants?id=${t.id}`, { method: 'PUT', body: f }));
    } catch (err) {
      setError(err.message);
    }
  };
  const field = (k, label, std) => (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        placeholder={`Standard: ${std}`}
      />
    </Field>
  );
  return (
    <form onSubmit={save} className="grid gap-3 border-t border-hair bg-zone p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      {field('max_storage_mb', 'Lagring (MB)', Math.round(t.limits.storageBytes / 1024 / 1024))}
      {field('max_devices', 'Skjermer (TV-er)', t.limits.devices)}
      {field('max_screens', 'Kanaler', t.limits.screens)}
      <div className="flex gap-2">
        <Button type="submit">Lagre</Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Lukk
        </Button>
      </div>
      <p className="m-0 text-xs text-muted sm:col-span-4">Tomt felt = standardkvoten for betaen.</p>
      {error && (
        <div className="sm:col-span-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </form>
  );
}

export default function SuperAdmin() {
  const [me, setMe] = useState(undefined);
  const [tenants, setTenants] = useState(null);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const expired = new URLSearchParams(window.location.search).get('login') === 'expired';

  useEffect(() => {
    document.title = 'Superadmin – Flatr';
    call('/me')
      .then((m) => {
        setMe(m);
        return call('/tenants').then(setTenants);
      })
      .catch((err) => (err.status === 401 ? setMe(null) : setError(err.message)));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tenants || []).filter(
      (t) => !q || [t.name, t.slug, ...t.owners].some((v) => String(v).toLowerCase().includes(q))
    );
  }, [tenants, query]);

  const totals = useMemo(
    () =>
      (tenants || []).reduce(
        (a, t) => ({
          accounts: a.accounts + 1,
          devices: a.devices + (t.devices || 0),
          online: a.online + (t.online || 0),
          storage: a.storage + (t.storageBytes || 0),
          active: a.active + (t.last_login && Date.now() - Date.parse(t.last_login) < 7 * 86400_000 ? 1 : 0)
        }),
        { accounts: 0, devices: 0, online: 0, storage: 0, active: 0 }
      ),
    [tenants]
  );

  if (me === undefined) return <div className="h-full bg-paper" />;
  if (me === null) return <Login expired={expired} />;

  const logout = async () => {
    await call('/logout', { method: 'POST' }).catch(() => {});
    window.location.reload();
  };

  return (
    <div className="min-h-full overflow-y-auto bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-line bg-card px-6 py-3">
        <LogoLockup className="h-6 w-auto text-ink" />
        <span className="rounded-full bg-warn-tint px-2.5 py-0.5 text-xs font-bold text-warn">Superadmin</span>
        <span className="ml-auto text-sm text-muted">{me.email}</span>
        <Button variant="outline" size="sm" onClick={logout}>
          Logg ut
        </Button>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <h1 className="page-title m-0">Kontoer</h1>
        <ErrorText>{error}</ErrorText>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Kontoer', totals.accounts],
            ['Aktive siste 7 dager', totals.active],
            ['Parede skjermer', totals.devices],
            ['Online nå', totals.online],
            ['Lagring totalt', fmtBytes(totals.storage)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-line bg-card p-4">
              <div className="text-xs font-semibold text-muted">{label}</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
            </div>
          ))}
        </section>

        <label className="flex max-w-sm items-center gap-2">
          <Icon name="search" className="h-4 w-4 text-muted" />
          <span className="sr-only">Søk</span>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk konto, subdomene eller e-post …" />
        </label>

        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="bg-zone text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Konto</th>
                <th className="px-4 py-2.5 font-medium">Eier</th>
                <th className="px-4 py-2.5 font-medium">Opprettet</th>
                <th className="px-4 py-2.5 font-medium">Sist innlogget</th>
                <th className="px-4 py-2.5 font-medium">Skjermer</th>
                <th className="px-4 py-2.5 font-medium">Kanaler</th>
                <th className="px-4 py-2.5 font-medium">Lysbilder</th>
                <th className="px-4 py-2.5 font-medium">Lagring</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const pct = t.limits.storageBytes ? Math.min(100, ((t.storageBytes || 0) / t.limits.storageBytes) * 100) : 0;
                return (
                  <FragmentRow key={t.id}>
                    <tr className="border-t border-hair align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{t.name}</div>
                        <a
                          href={`${window.location.protocol}//${t.slug}.${me.base_domain}/admin`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand hover:underline"
                        >
                          {t.slug}.{me.base_domain}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {t.owners.join(', ') || '–'}
                        {t.members > t.owners.length && <div className="text-xs">+{t.members - t.owners.length} til</div>}
                      </td>
                      <td className="px-4 py-3 text-muted">{date(t.created_at)}</td>
                      <td className="px-4 py-3 text-muted">{ago(t.last_login)}</td>
                      <td className="px-4 py-3">
                        <span className="tabular-nums">
                          {t.devices ?? 0} / {t.limits.devices}
                        </span>
                        <div className="text-xs text-muted">
                          {t.online ? `${t.online} online` : t.lastSeen ? `sist ${ago(t.lastSeen)}` : 'ingen'}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {t.screens ?? 0} / {t.limits.screens}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {t.slides ?? 0}
                        <div className="text-xs text-muted">{t.playlists ?? 0} lister</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="tabular-nums">
                          {fmtBytes(t.storageBytes)} <span className="text-muted">/ {fmtBytes(t.limits.storageBytes)}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-zone">
                          <div className={`h-full rounded-full ${pct > 90 ? 'bg-danger' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                          Kvoter
                        </Button>
                      </td>
                    </tr>
                    {editing === t.id && (
                      <tr>
                        <td colSpan={9} className="p-0">
                          <QuotaEditor
                            t={t}
                            onClose={() => setEditing(null)}
                            onSaved={(fresh) => {
                              setTenants((list) => list.map((x) => (x.id === fresh.id ? fresh : x)));
                              setEditing(null);
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
          {tenants && shown.length === 0 && <p className="m-0 p-6 text-center text-muted">Ingen kontoer.</p>}
        </div>
      </main>
    </div>
  );
}

const FragmentRow = ({ children }) => <>{children}</>;
