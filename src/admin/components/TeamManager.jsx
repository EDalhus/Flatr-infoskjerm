import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Field, Input, Select, Button, IconButton, Card, GroupCard, Row, PageHeader, ErrorText } from './ui.jsx';

const ROLE_LABEL = { owner: 'Eier', editor: 'Redaktør', viewer: 'Leser' };

export default function TeamManager({ me }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = me?.role === 'owner';
  const [require2fa, setRequire2fa] = useState(null);
  useEffect(() => {
    api.settings.get().then((s) => setRequire2fa(!!s.require_2fa)).catch(() => {});
  }, []);
  const toggle2fa = async (on) => {
    setError('');
    try {
      setRequire2fa(!!(await api.settings.update({ require_2fa: on })).require_2fa);
    } catch (err) {
      setError(err.message);
    }
  };

  const load = () =>
    api.team
      .list()
      .then((rows) => setMembers(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const invite = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      setMembers(await api.team.invite(email, role));
      setNotice(`Invitasjon sendt til ${email}.`);
      setEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m, next) => {
    setError('');
    try {
      setMembers(await api.team.setRole(m.user_id, next));
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (m) => {
    if (!confirm(`Fjerne ${m.email} fra teamet? Personen logges ut med en gang.`)) return;
    setError('');
    try {
      setMembers(await api.team.remove(m.user_id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader title="Team" subtitle="Hvem som har tilgang til kontoen." />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        {isOwner && (
          <Card title="Inviter en kollega">
            <form onSubmit={invite} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <Field label="E-post">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kollega@firma.no"
                />
              </Field>
              <Field label="Rolle">
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="editor">Redaktør</option>
                  <option value="viewer">Leser</option>
                  <option value="owner">Eier</option>
                </Select>
              </Field>
              <Button type="submit" disabled={busy}>
                <Icon name="plus" className="h-4 w-4" />
                {busy ? 'Sender …' : 'Send invitasjon'}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted">
              Lesere kan se alt, men ikke endre noe. Redaktører kan endre alt innhold og alle skjermer. Eiere kan i tillegg administrere teamet og godkjenne.
            </p>
            {notice && <p className="mt-3 text-sm font-medium text-brand">{notice}</p>}
          </Card>
        )}

        <ErrorText>{error}</ErrorText>

        {isOwner && require2fa !== null && (
          <Card title="Sikkerhet">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={require2fa} onChange={(e) => toggle2fa(e.target.checked)} />
              <span>
                <span className="font-semibold text-ink">Krev tofaktor for alle i teamet</span>
                <span className="block text-muted">
                  Alle må bruke en autentiseringsapp i tillegg til passordet. De som ikke har slått det på, blir bedt om å gjøre det før de kommer inn. Du må ha det på selv først.
                </span>
              </span>
            </label>
          </Card>
        )}

        <GroupCard label={`Medlemmer · ${members.length}`} icon="home">
          {members.map((m) => {
            const self = m.email === me?.email;
            return (
              <Row
                key={m.user_id}
                media={
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-bold text-brand">
                    {(m.name || m.email).slice(0, 2)}
                  </span>
                }
                title={
                  <>
                    {m.name || m.email.split('@')[0]}
                    {self && <span className="ml-2 text-xs font-medium text-muted">(deg)</span>}
                  </>
                }
                meta={
                  <>
                    {m.email} · {ROLE_LABEL[m.role] ?? m.role}
                  </>
                }
                actions={
                  isOwner && (
                    <>
                      <Select
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value)}
                        className="!w-32"
                        aria-label="Rolle"
                      >
                        <option value="editor">Redaktør</option>
                        <option value="viewer">Leser</option>
                        <option value="owner">Eier</option>
                      </Select>
                      <IconButton name="x" label="Fjern fra teamet" tone="danger" onClick={() => remove(m)} />
                    </>
                  )
                }
              />
            );
          })}
        </GroupCard>
      </div>
    </>
  );
}
