// Send en hastemelding (Hjem → «Send et varsel»): ferdige maler, alvorlighet,
// hvordan den vises, hvor lenge, og om den skal starte nå eller senere.
// Nederst: automatiske farevarsler fra MET for et valgt sted.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { TEMPLATES, SEVERITIES, DISPLAYS, alertColors, alertHeading } from '../../lib/alerts.js';
import { Icon, Button, Input, Textarea, Select, Field, ErrorText } from './ui.jsx';
import { PlaceSearch } from './deck/ElementConfigFields.jsx';
import { tr } from '../../lib/i18n.js';

const DURATIONS = [
  { value: '', label: tr('Til jeg avslutter den') },
  { value: '15', label: tr('15 minutter') },
  { value: '30', label: tr('30 minutter') },
  { value: '60', label: tr('1 time') },
  { value: '120', label: tr('2 timer') },
  { value: '240', label: tr('4 timer') },
  { value: 'eod', label: tr('Resten av dagen') }
];

const MET_LEVELS = [
  { value: 2, label: tr('Gult, oransje og rødt') },
  { value: 3, label: tr('Oransje og rødt') },
  { value: 4, label: tr('Bare rødt') }
];

// datetime-local vil ha lokal tid uten sone: «2026-11-02T08:30».
const localInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function AlertComposer({ screens, onSent }) {
  const [template, setTemplate] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('warning');
  const [display, setDisplay] = useState('flash');
  const [duration, setDuration] = useState('');
  const [later, setLater] = useState(false);
  const [startAt, setStartAt] = useState(() => localInput(new Date(Date.now() + 60 * 60_000)));
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const pick = (id) => {
    setTemplate(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title);
    setMessage(t.message);
    setSeverity(t.severity);
    setDisplay(t.display);
  };

  const send = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError('');
    setBusy(true);
    try {
      const start = later ? new Date(startAt) : new Date();
      if (later && !(start.getTime() > Date.now())) throw new Error(tr('Velg et tidspunkt fram i tid'));
      const body = { message: message.trim(), title: title.trim() || null, severity, display };
      if (later) body.starts_at = start.toISOString();
      if (duration === 'eod') {
        const end = new Date(start);
        end.setHours(23, 59, 0, 0);
        body.ends_at = end.toISOString();
      } else if (duration) body.duration_minutes = Number(duration);
      if (target.startsWith('tag:')) body.target_tag = target.slice(4);
      else if (target) body.target_screen_id = Number(target);
      await api.alerts.create(body);
      setSent(later ? 'Planlagt ✓' : 'Sendt ✓');
      setTemplate('');
      setTitle('');
      setMessage('');
      setTimeout(() => setSent(''), 2500);
      onSent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const preview = { title, message: message || 'Meldingen din', severity, display };
  const colors = alertColors(preview);
  const tags = [...new Set(screens.flatMap((s) => s.tags || []))].sort((a, b) => a.localeCompare(b, 'nb'));

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold text-muted">{tr('Mal')}</span>
        {[{ id: '', label: tr('Egen melding') }, ...TEMPLATES].map((t) => (
          <button
            key={t.id || 'own'}
            type="button"
            onClick={() => (t.id ? pick(t.id) : setTemplate(''))}
            aria-pressed={template === t.id}
            className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${
              template === t.id ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={send} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="grid min-w-0 gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <Field label={tr('Overskrift (valgfri)')}>
              <Input id="alert-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('F.eks. Brannøvelse')} maxLength={80} />
            </Field>
            <Field label={tr('Melding')}>
              <Textarea
                id="alert-message"
                autoFocus
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={tr('F.eks. «Brannøvelse – forlat lokalet rolig.»')}
                maxLength={500}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr('Hvor viktig')}>
              <div className="flex gap-1 rounded-xl border border-line bg-paper p-1">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSeverity(s.value)}
                    aria-pressed={severity === s.value}
                    className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      severity === s.value ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.bg }} />
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={tr('Slik vises den')}>
              <Select id="alert-display" value={display} onChange={(e) => setDisplay(e.target.value)}>
                {DISPLAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr('Hvor lenge')}>
              <Select id="alert-duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr('Hvilke skjermer')}>
              <Select id="alert-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{tr('Alle skjermer')}</option>
                {tags.map((t) => (
                  <option key={`tag:${t}`} value={`tag:${t}`}>
                    {tr('Gruppe:')} {t}
                  </option>
                ))}
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} className="h-4 w-4 rounded border-line text-brand" />
              {tr('Start senere')}
            </label>
            {later && (
              <Input
                id="alert-start"
                type="datetime-local"
                value={startAt}
                min={localInput(new Date())}
                onChange={(e) => setStartAt(e.target.value)}
                className="!w-auto"
                aria-label={tr('Starttidspunkt')}
              />
            )}
            <Button type="submit" variant="danger" disabled={busy || !message.trim()} className="ml-auto">
              <Icon name="megaphone" className="h-4 w-4" />
              {busy ? tr('Sender …') : sent || (later ? tr('Planlegg') : tr('Send nå'))}
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </div>

        <div className="min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-muted">{tr('Slik ser det ut')}</span>
          <div className="relative overflow-hidden rounded-xl border border-hair bg-[#0f2733]" style={{ aspectRatio: '16 / 9' }}>
            {display === 'banner' ? (
              <div className="absolute inset-x-[4%] top-[5%] flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] leading-snug" style={{ background: colors.bg, color: colors.fg }}>
                <span className="font-extrabold">{alertHeading(preview)}</span>
                <span className="truncate opacity-90">· {preview.message}</span>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center" style={{ background: colors.bg, color: colors.fg }}>
                <span className="text-[8px] font-black uppercase tracking-[0.25em] opacity-85">{alertHeading(preview)}</span>
                <span className="mt-1.5 line-clamp-3 text-sm font-extrabold leading-tight">{preview.message}</span>
              </div>
            )}
          </div>
          {display === 'flash' && <span className="mt-1 block text-xs text-muted">{tr('Etter 30 sekunder blir den et banner øverst.')}</span>}
        </div>
      </form>

      <MetSettings />
    </div>
  );
}

/** Automatiske farevarsler fra MET for ett sted. */
function MetSettings() {
  const [met, setMet] = useState(null);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.settings
      .get()
      .then((s) => setMet(s.met_alerts || { enabled: false, place: null, lat: null, lon: null, min_level: 2 }))
      .catch(() => setMet({ enabled: false, min_level: 2 }));
  }, []);

  const save = async (patch) => {
    const next = { ...met, ...patch };
    setMet(next);
    setError('');
    try {
      const s = await api.settings.update({ met_alerts: next });
      setMet(s.met_alerts || next);
      setSaved('Lagret');
      setTimeout(() => setSaved(''), 1800);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!met) return null;
  return (
    <div className="border-t border-hair pt-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-sm">
        <Icon name="sun" className="h-4 w-4 text-muted" />
        <span className="font-semibold text-ink">{tr('Farevarsler fra MET')}</span>
        <span className="truncate text-muted">
          {met.enabled ? tr('· på for {0}', [met.place || tr('valgt sted')]) : tr('· av')}
        </span>
        <span className="ml-auto text-xs font-semibold text-brand">{open ? tr('Skjul') : tr('Endre')}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
          <Field label={met.place ? tr('Sted: {0}', [met.place]) : tr('Sted')} hint={tr('Gule, oransje og røde farevarsler for stedet vises som banner på alle skjermene mens de gjelder.')}>
            <PlaceSearch
              value={met.place}
              onPick={(h) => save({ place: h.municipality && h.municipality !== h.name ? `${h.name}, ${h.municipality}` : h.name, lat: h.lat, lon: h.lon, enabled: true })}
            />
          </Field>
          <Field label={tr('Hvilke varsler')}>
            <Select id="met-level" value={met.min_level || 2} onChange={(e) => save({ min_level: Number(e.target.value) })}>
              {MET_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={!!met.enabled}
              disabled={!met.lat}
              onChange={(e) => save({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-line text-brand"
            />
            {tr('Vis på skjermene')}
            {saved && <span className="text-xs font-semibold text-brand">{saved}</span>}
          </label>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  );
}
