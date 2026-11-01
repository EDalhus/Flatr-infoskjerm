import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Field, Input, Select, Button, IconButton, Card, GroupCard, Row, PageHeader, ErrorText } from './ui.jsx';
import ReferralCard from './ReferralCard.jsx';
import { tr } from '../../lib/i18n.js';

const ROLE_LABEL = { owner: tr('Eier'), editor: tr('Redaktør'), viewer: tr('Leser') };

export default function TeamManager({ me }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = me?.role === 'owner';
  const [require2fa, setRequire2fa] = useState(null);
  const [approval, setApproval] = useState(null);
  useEffect(() => {
    api.settings.get().then((s) => setRequire2fa(!!s.require_2fa)).catch(() => {});
    api.review.pending().then((r) => setApproval(!!r.required)).catch(() => {});
  }, []);
  const toggleApproval = async (on) => {
    if (on && !confirm(tr('Slå på godkjenning? Slik presentasjonene ser ut nå, blir publisert. Etter dette må en eier publisere endringer før de vises på skjermene.'))) return;
    setError('');
    try {
      setApproval((await api.review.setRequired(on)).required);
    } catch (err) {
      setError(err.message);
    }
  };
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
      setNotice(tr('Invitasjon sendt til {0}.', [email]));
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
    if (!confirm(tr('Fjerne {0} fra teamet? Personen logges ut med en gang.', [m.email]))) return;
    setError('');
    try {
      setMembers(await api.team.remove(m.user_id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader title={tr('Team')} subtitle={tr('Hvem som har tilgang til kontoen.')} />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        {isOwner && (
          <Card title={tr('Inviter en kollega')}>
            <form onSubmit={invite} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <Field label={tr('E-post')}>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kollega@firma.no"
                />
              </Field>
              <Field label={tr('Rolle')}>
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="editor">{tr('Redaktør')}</option>
                  <option value="viewer">{tr('Leser')}</option>
                  <option value="owner">{tr('Eier')}</option>
                </Select>
              </Field>
              <Button type="submit" disabled={busy}>
                <Icon name="plus" className="h-4 w-4" />
                {busy ? tr('Sender …') : tr('Send invitasjon')}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted">
              {tr('Lesere kan se alt, men ikke endre noe. Redaktører kan endre alt innhold og alle skjermer. Eiere kan i tillegg administrere teamet og godkjenne.')}
            </p>
            {notice && <p className="mt-3 text-sm font-medium text-brand">{notice}</p>}
          </Card>
        )}

        <ErrorText>{error}</ErrorText>

        {isOwner && require2fa !== null && (
          <Card title={tr('Sikkerhet')}>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={require2fa} onChange={(e) => toggle2fa(e.target.checked)} />
              <span>
                <span className="font-semibold text-ink">{tr('Krev tofaktor for alle i teamet')}</span>
                <span className="block text-muted">
                  {tr('Alle må bruke en autentiseringsapp i tillegg til passordet. De som ikke har slått det på, blir bedt om å gjøre det før de kommer inn. Du må ha det på selv først.')}
                </span>
              </span>
            </label>
            {approval !== null && (
              <label className="mt-4 flex items-start gap-3 border-t border-hair pt-4 text-sm">
                <input type="checkbox" className="mt-1" checked={approval} onChange={(e) => toggleApproval(e.target.checked)} />
                <span>
                  <span className="font-semibold text-ink">{tr('Krev godkjenning før publisering')}</span>
                  <span className="block text-muted">
                    {tr('Endringer i presentasjoner vises ikke på skjermene før en eier har publisert dem. Redaktører trykker «Send til godkjenning», og eierne får beskjed på e-post (og Slack/Teams).')}
                  </span>
                </span>
              </label>
            )}
          </Card>
        )}

        <GroupCard label={tr('Medlemmer · {0}', [members.length])} icon="home">
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
                    {self && <span className="ml-2 text-xs font-medium text-muted">{tr('(deg)')}</span>}
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
                        aria-label={tr('Rolle')}
                      >
                        <option value="editor">{tr('Redaktør')}</option>
                        <option value="viewer">{tr('Leser')}</option>
                        <option value="owner">{tr('Eier')}</option>
                      </Select>
                      <IconButton name="x" label={tr('Fjern fra teamet')} tone="danger" onClick={() => remove(m)} />
                    </>
                  )
                }
              />
            );
          })}
        </GroupCard>

        <ReferralCard />
      </div>
    </>
  );
}
