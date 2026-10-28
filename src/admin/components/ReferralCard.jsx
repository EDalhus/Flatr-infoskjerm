// Henvisningsprogrammet: del lenken – hver organisasjon som registrerer seg
// via den og kobler til en skjerm, gir én skjerm ekstra (maks 5).

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Button } from './ui.jsx';

export default function ReferralCard({ compact = false }) {
  const [r, setR] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.referral().then(setR).catch(() => setR(null));
  }, []);
  if (!r) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ingen utklippstavle */
    }
  };
  return (
    <div className={`rounded-2xl border border-brand/30 bg-brand-tint ${compact ? 'p-4' : 'p-5'}`}>
      <div className="text-sm font-bold text-ink">Få flere skjermer gratis 🎁</div>
      <p className="m-0 mt-1 text-sm text-muted">
        Del lenken med andre bedrifter. For hver som oppretter en Flatr-konto via den og kobler til en skjerm, får dere én skjerm ekstra – opptil {r.max}.
      </p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={r.url} onFocus={(e) => e.target.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 font-mono text-xs text-ink" aria-label="Din henvisningslenke" />
        <Button size="sm" onClick={copy}>
          {copied ? 'Kopiert ✓' : 'Kopier'}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span>
          <strong className="text-ink">{r.referred}</strong> registrert via lenken
        </span>
        <span>
          <strong className="text-ink">{r.active}</strong> har koblet til skjerm
        </span>
        <span>
          <strong className="text-ink">
            {r.bonus} / {r.max}
          </strong>{' '}
          ekstra skjermer
        </span>
      </div>
    </div>
  );
}
