// Legg til en skjerm: enten en Apple TV (tast koden den viser) eller en
// nettleser/smart-TV (åpne en lenke). Brukes på Skjermer og i oppstartsveiviseren.

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Input, Select, Button, Field, Segmented, ErrorText } from './ui.jsx';

export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const codeFromUrl = () =>
  typeof window === 'undefined' ? '' : normalizeCode(new URLSearchParams(window.location.search).get('code') || '');

const NEW = 'new';

export function CodeInput({ value, onChange, inputRef }) {
  const chars = value.padEnd(6, ' ').split('');
  return (
    <label className="relative block w-fit cursor-text">
      <span className="sr-only">Koden som vises på TV-en</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(normalizeCode(e.target.value))}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
        aria-label="Kode fra TV-en"
      />
      <span className="pointer-events-none flex items-center gap-1.5" aria-hidden="true">
        {chars.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i === 3 && <span className="mx-1 text-2xl font-bold text-muted">–</span>}
            <span
              className={`grid h-14 w-11 place-items-center rounded-xl border-2 bg-paper font-mono text-2xl font-bold text-ink sm:h-16 sm:w-12 ${
                i === value.length ? 'border-brand' : c.trim() ? 'border-line' : 'border-hair'
              }`}
            >
              {c.trim()}
            </span>
          </span>
        ))}
      </span>
    </label>
  );
}

export function CopyLink({ link }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Kopier lenken:', link);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink">{link}</code>
      <Button variant="outline" onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
        {copied ? 'Kopiert' : 'Kopier'}
      </Button>
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        aria-label="Åpne i ny fane"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-ink hover:bg-hair"
      >
        <Icon name="external" className="h-4 w-4" />
      </a>
    </div>
  );
}

/**
 * Skjemaet for en ny skjerm. Med `playlistId` er presentasjonen bestemt på
 * forhånd (veiviseren), ellers velger man blant `playlists` eller lager en ny.
 * `onDone({ screen_id, name, mode })` kalles når skjermen finnes.
 */
export function AddScreenForm({ playlists = [], playlistId, initialCode = '', onDone, onCancel }) {
  const [mode, setMode] = useState('tv');
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [content, setContent] = useState(playlistId ? String(playlistId) : playlists[0] ? String(playlists[0].id) : NEW);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef(null);

  useEffect(() => {
    if (mode === 'tv') codeRef.current?.focus();
  }, [mode]);

  const target = () => ({
    name: name.trim(),
    ...(content !== NEW ? { playlist_id: Number(content) } : {})
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'tv' && code.length < 6) return setError('Koden har 6 tegn – den står på TV-en.');
    if (mode === 'browser' && !name.trim()) return setError('Gi skjermen et navn.');
    setBusy(true);
    try {
      if (mode === 'tv') {
        const res = await api.pairing.link(code, target());
        onDone?.({ screen_id: res.screen_id, name: res.screen_name, mode });
      } else {
        const s = await api.screens.create(target());
        onDone?.({ screen_id: s.id, name: s.name, mode });
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'tv', label: 'Apple TV' },
          { value: 'browser', label: 'Nettleser / smart-TV' }
        ]}
        className="w-fit"
      />

      {mode === 'tv' ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted">Koden som står på TV-en</span>
          <CodeInput value={code} onChange={setCode} inputRef={codeRef} />
          <span className="text-xs text-muted">
            Åpne Flatr-appen på Apple TV-en. Du kan også skanne QR-koden med mobilen, så fylles koden ut av seg selv.
          </span>
        </div>
      ) : (
        <p className="m-0 max-w-lg text-sm text-muted">
          Du får en lenke du åpner i nettleseren på skjermen, f.eks. en smart-TV, en PC eller en Chromecast med nettleser.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Navn på skjermen">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === 'tv' ? 'Resepsjon (valgfritt)' : 'Resepsjon'}
            autoFocus={mode === 'browser'}
          />
        </Field>
        {!playlistId && (
          <Field label="Skal vise">
            <Select value={content} onChange={(e) => setContent(e.target.value)}>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={NEW}>+ Ny tom presentasjon</option>
            </Select>
          </Field>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy || (mode === 'tv' && code.length < 6)}>
          {busy ? 'Legger til …' : mode === 'tv' ? 'Koble til' : 'Lag lenke'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Avbryt
          </Button>
        )}
      </div>
    </form>
  );
}

/** Ferdig-melding etter at en skjerm er lagt til. */
export function AddedScreen({ result, onAnother, onClose }) {
  const link = `${window.location.origin}/display/${result.screen_id}`;
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-ok-tint text-ok">
        <Icon name="check" className="h-7 w-7" />
      </span>
      <h2 className="m-0 text-xl font-bold text-ink">«{result.name}» er lagt til</h2>
      {result.mode === 'tv' ? (
        <p className="m-0 max-w-md text-sm text-muted">TV-en begynner å vise innholdet om noen sekunder.</p>
      ) : (
        <div className="flex w-full max-w-lg flex-col gap-2">
          <p className="m-0 text-sm text-muted">Åpne denne lenken i nettleseren på skjermen og sett den i fullskjerm.</p>
          <CopyLink link={link} />
        </div>
      )}
      <div className="mt-2 flex gap-2">
        {onAnother && <Button onClick={onAnother}>Legg til en til</Button>}
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Ferdig
          </Button>
        )}
      </div>
    </div>
  );
}
