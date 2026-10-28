import { useMemo, useState } from 'react';
import { api } from '../../../lib/api.js';
import { normBirthdate, parsePeopleList, upcomingBirthdays, todayIn } from '../../../lib/birthdays.js';
import BirthdayView from '../../../viewer/slides/BirthdayView.jsx';
import { Icon, Field, Input, Textarea, Button, IconButton, Card, GroupCard, ErrorText } from '../ui.jsx';
import { SaveBar, Section } from './parts.jsx';

// Innstillingene til Bursdager: hvem som er med (navn + fødselsdato), om alder
// skal vises, og innliming av en hel liste. Forhåndsvisningen regnes ut lokalt,
// så den oppdateres mens du skriver.

const newId = () => Math.random().toString(36).slice(2, 10);

export default function BirthdaySettings({ app, onSaved }) {
  const [people, setPeople] = useState(app.config?.people || []);
  const [showAge, setShowAge] = useState(app.config?.showAge !== false);
  const [draft, setDraft] = useState({ name: '', date: '' });
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const change = (fn) => {
    fn();
    setDirty(true);
    setNotice('');
  };

  const add = (e) => {
    e.preventDefault();
    const date = normBirthdate(draft.date);
    if (!draft.name.trim()) return setError('Skriv inn et navn.');
    if (!date) return setError('Velg en gyldig fødselsdato.');
    setError('');
    change(() => setPeople((list) => [...list, { id: newId(), name: draft.name.trim(), date, hideAge: false }]));
    setDraft({ name: '', date: '' });
  };

  const importList = () => {
    const { people: found, skipped } = parsePeopleList(paste);
    if (!found.length) return setError('Fant ingen linjer med navn og dato. Bruk f.eks. «Kari Nordmann; 14.11.1990».');
    // Samme navn + dato fra før hoppes over, så du kan lime inn lista på nytt.
    const seen = new Set(people.map((p) => `${p.name.toLowerCase()}|${p.date}`));
    const fresh = found.filter((p) => !seen.has(`${p.name.toLowerCase()}|${p.date}`));
    change(() => setPeople((list) => [...list, ...fresh.map((p) => ({ id: newId(), ...p, hideAge: false }))]));
    setError(skipped.length ? `Hoppet over ${skipped.length} linje(r) uten gyldig navn og dato: ${skipped.slice(0, 3).join(' · ')}` : '');
    setNotice(`La til ${fresh.length} ${fresh.length === 1 ? 'person' : 'personer'}${found.length - fresh.length ? ` (${found.length - fresh.length} fantes fra før)` : ''}. Husk å lagre.`);
    setPaste('');
    setPasteOpen(false);
  };

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const saved = await api.apps.update(app.id, { config: { people, showAge } });
      setPeople(saved.config.people);
      setDirty(false);
      setNotice('');
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => upcomingBirthdays(people, todayIn('Europe/Oslo'), { max: 20, showAge }), [people, showAge]);
  const sorted = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return people
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.p.name.localeCompare(b.p.name, 'nb'));
  }, [people, filter]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-6">
        {notice && !dirty ? null : notice && <p className="m-0 text-sm font-medium text-brand">{notice}</p>}
        <ErrorText>{error}</ErrorText>

        <Section icon="eye" title="Visning">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={showAge} onChange={(e) => change(() => setShowAge(e.target.checked))} className="h-4 w-4 rounded border-line text-brand" />
            Vis hvor gamle de blir («fyller 34»)
          </label>
          <p className="m-0 mt-2 text-xs text-muted">Fødselsdatoene vises aldri på skjermene – bare dag og måned. Alder kan også skjules for enkeltpersoner under.</p>
        </Section>

        <Section
          title="Personer"
          count={people.length}
          icon="users"
          flush
          action={
            <Button size="sm" variant="outline" onClick={() => setPasteOpen(!pasteOpen)}>
              <Icon name={pasteOpen ? 'x' : 'copy'} className="h-4 w-4" />
              {pasteOpen ? 'Lukk' : 'Lim inn liste'}
            </Button>
          }
        >
          {pasteOpen && (
            <div className="grid gap-2 p-4">
              <Field label="Én person per linje: navn og fødselsdato" hint="Skill med semikolon, komma eller tabulator – du kan kopiere to kolonner rett fra Excel. Datoer som 14.11.1990 eller 1990-11-14.">
                <Textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Kari Nordmann; 14.11.1990\nOla Nordmann; 02.03.1985'} />
              </Field>
              <div>
                <Button size="sm" onClick={importList} disabled={!paste.trim()}>
                  <Icon name="plus" className="h-4 w-4" />
                  Legg til fra lista
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={add} className="grid gap-3 border-t border-hair bg-zone/40 px-5 py-4 sm:grid-cols-[1fr_170px_auto] sm:items-end">
            <Field label="Navn">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Kari Nordmann" maxLength={80} />
            </Field>
            <Field label="Fødselsdato">
              <Input type="date" value={draft.date} max={todayIn('Europe/Oslo')} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </Field>
            <Button type="submit" variant="outline">
              <Icon name="plus" className="h-4 w-4" />
              Legg til
            </Button>
          </form>

          {people.length > 8 && (
            <div className="px-4 pb-3">
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Søk etter navn" aria-label="Søk etter navn" />
            </div>
          )}

          {sorted.map(({ p, i }) => (
            <div key={p.id} className="group grid items-center gap-3 border-t border-hair px-5 py-2.5 hover:bg-zone/50 sm:grid-cols-[1fr_170px_auto_auto]">
              <Input
                value={p.name}
                onChange={(e) => change(() => setPeople((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))))}
                aria-label="Navn"
              />
              <Input
                type="date"
                value={p.date}
                max={todayIn('Europe/Oslo')}
                onChange={(e) => change(() => setPeople((list) => list.map((x, j) => (j === i ? { ...x, date: e.target.value } : x))))}
                aria-label="Fødselsdato"
              />
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted" title="Skjul alderen til denne personen på skjermene">
                <input
                  type="checkbox"
                  checked={!!p.hideAge}
                  onChange={(e) => change(() => setPeople((list) => list.map((x, j) => (j === i ? { ...x, hideAge: e.target.checked } : x))))}
                  className="h-4 w-4 rounded border-line text-brand"
                />
                Skjul alder
              </label>
              <IconButton name="x" label={`Fjern ${p.name}`} tone="danger" onClick={() => change(() => setPeople((list) => list.filter((_, j) => j !== i)))} />
            </div>
          ))}
          {!people.length && <p className="m-0 px-4 pb-4 text-sm text-muted">Ingen er lagt inn ennå.</p>}
        </Section>
      </div>

      <div className="min-w-0">
        <div className="sticky top-4 space-y-2">
          <div className="mb-1 text-xs font-semibold text-muted">Forhåndsvisning</div>
          <div
            className="aspect-[4/3] w-full overflow-hidden rounded-2xl p-5 text-white"
            style={{ background: 'linear-gradient(135deg, #1f5566, #0f2733)', containerType: 'size' }}
          >
            <BirthdayView items={preview} days={7} />
          </div>
          <p className="m-0 text-xs text-muted">
            Legg kortet på et lysbilde med <strong>Widgeter → Bursdager</strong> i editoren. Hvor mange dager fram og overskrift velger du på elementet.
          </p>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        busy={busy}
        error={error}
        onSave={save}
        onDiscard={() => {
          setPeople(app.config?.people || []);
          setShowAge(app.config?.showAge !== false);
          setDirty(false);
          setError('');
          setNotice('');
        }}
      />
    </div>
  );
}
