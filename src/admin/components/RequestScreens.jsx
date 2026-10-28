import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Field, Select, Textarea, Button, ErrorText } from './ui.jsx';
import ReferralCard from './ReferralCard.jsx';

// «Be om flere skjermer»: sender en e-post til Flatr (plattformeierne) med
// svar-til deg. Grensen økes i superadmin – gratis i betaperioden.

export default function RequestScreens({ plan, onClose }) {
  const [extra, setExtra] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.plan.request(extra, message.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(e) => !box.current?.contains(e.target) && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Be om flere skjermer" className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-pop">
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-tint text-brand">
              <Icon name="check" className="h-6 w-6" />
            </div>
            <h2 className="m-0 text-lg font-bold text-ink">Forespørselen er sendt</h2>
            <p className="m-0 mt-2 text-sm text-muted">Vi svarer deg på e-post så fort vi kan, og øker grensen når det er klart.</p>
            <Button className="mt-5" onClick={onClose}>
              Lukk
            </Button>
          </div>
        ) : (
          <form onSubmit={send} className="grid gap-4">
            <div>
              <h2 className="m-0 text-lg font-bold text-ink">Trenger du flere skjermer?</h2>
              <p className="m-0 mt-1.5 text-sm text-muted">
                Du bruker {plan.screens.used} av {plan.screens.limit} {plan.screens.limit === 1 ? 'skjerm' : 'skjermer'}. Si fra hvor mange du trenger, så ordner vi det – i
                betaperioden er det gratis.
              </p>
            </div>
            <ReferralCard compact />
            <Field label="Eller: hvor mange skjermer til trenger dere?">
              <Select value={extra} onChange={(e) => setExtra(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'skjerm' : 'skjermer'} til
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Melding (valgfritt)">
              <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="F.eks. hva skjermene skal brukes til" maxLength={2000} />
            </Field>
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Avbryt
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Sender …' : 'Send forespørsel'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
