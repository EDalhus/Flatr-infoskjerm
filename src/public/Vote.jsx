// Mobilsiden publikum havner på når de skanner QR-koden for en avstemning
// (/v/<token>): stem, eller send inn og gi hjerte til spørsmål fra salen.
// Ingen innlogging – nettleseren får en tilfeldig id som husker stemmen.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const VOTER_KEY = 'flatr.voter';

// crypto.randomUUID finnes ikke i eldre mobilnettlesere – getRandomValues gjør det.
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

function voterId() {
  try {
    let v = localStorage.getItem(VOTER_KEY);
    if (!v) {
      v = randomId();
      localStorage.setItem(VOTER_KEY, v);
    }
    return v;
  } catch {
    return randomId();
  }
}

function Bars({ options, counts, total, mine }) {
  return (
    <div className="mt-6 space-y-3">
      {options.map((o, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        return (
          <div key={i}>
            <div className="mb-1 flex justify-between text-sm">
              <span className={i === mine ? 'font-bold' : ''}>
                {o}
                {i === mine ? ' · ditt svar' : ''}
              </span>
              <span className="tabular-nums text-[#5b6170]">{pct} %</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#e7ece9]">
              <div className="h-full rounded-full bg-[#027353] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <p className="m-0 pt-1 text-xs text-[#5b6170]">{total === 1 ? '1 stemme' : `${total} stemmer`}</p>
    </div>
  );
}

export default function Vote() {
  const { token } = useParams();
  const [voter] = useState(voterId);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState('');

  const load = () =>
    fetch(`/api/vote?t=${encodeURIComponent(token)}&voter=${voter}`, { cache: 'no-store' })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Fant ikke avstemningen');
        setData(b);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    document.title = 'Stem – Flatr';
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const post = async (body) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/vote?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter, ...body })
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'Noe gikk galt');
      setData(b);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const open = data?.status === 'open';

  return (
    <div className="min-h-screen bg-[#f4f6f5] px-5 py-8 text-[#16181d]">
      <main className="mx-auto max-w-md">
        {!data ? (
          <p className="mt-20 text-center text-[#5b6170]">{error || 'Henter …'}</p>
        ) : (
          <>
            <h1 className="m-0 text-2xl font-extrabold leading-tight">{data.question}</h1>
            {!open && <p className="m-0 mt-2 text-sm font-semibold text-[#b45309]">Avstemningen er avsluttet.</p>}

            {data.kind === 'choice' ? (
              <>
                {open && (
                  <div className="mt-6 space-y-3">
                    {data.options.map((o, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={busy}
                        onClick={() => post({ choice: i })}
                        className={`block w-full rounded-2xl border-2 px-5 py-4 text-left text-lg font-bold transition-colors ${
                          data.mine === i ? 'border-[#027353] bg-[#027353] text-white' : 'border-[#d6ddd9] bg-white hover:border-[#027353]'
                        }`}
                      >
                        {data.mine === i ? '✓ ' : ''}
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {data.mine != null && open && <p className="m-0 mt-3 text-sm text-[#5b6170]">Takk! Du kan endre svaret så lenge avstemningen er åpen.</p>}
                {data.counts ? (
                  <Bars options={data.options} counts={data.counts} total={data.total} mine={data.mine} />
                ) : (
                  data.mine != null && <p className="m-0 mt-4 text-sm text-[#5b6170]">Resultatene vises når avstemningen er ferdig.</p>
                )}
              </>
            ) : (
              <>
                {open && (
                  <form
                    className="mt-6"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await post({ question: text })) {
                        setText('');
                        setThanks(data.moderate ? 'Takk! Spørsmålet vises når det er godkjent.' : 'Takk! Spørsmålet ditt er sendt.');
                      }
                    }}
                  >
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={200}
                      rows={3}
                      placeholder="Skriv spørsmålet ditt …"
                      className="block w-full resize-none rounded-2xl border-2 border-[#d6ddd9] bg-white p-4 text-base outline-none focus:border-[#027353]"
                    />
                    <button
                      type="submit"
                      disabled={busy || text.trim().length < 3}
                      className="mt-3 w-full rounded-2xl bg-[#027353] px-5 py-3.5 text-lg font-bold text-white disabled:opacity-40"
                    >
                      Send spørsmål
                    </button>
                    {thanks && <p className="m-0 mt-2 text-sm font-semibold text-[#027353]">{thanks}</p>}
                  </form>
                )}
                <div className="mt-6 space-y-2">
                  {(data.questions || []).map((q) => {
                    const liked = data.liked?.includes(q.id);
                    return (
                      <div key={q.id} className="flex items-start gap-3 rounded-2xl bg-white p-4">
                        <p className="m-0 min-w-0 flex-1 text-base">{q.text}</p>
                        <button
                          type="button"
                          disabled={!open || liked || busy}
                          onClick={() => post({ like: q.id })}
                          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${liked ? 'bg-[#fde2e7] text-[#be123c]' : 'bg-[#f1f3f2] text-[#5b6170]'}`}
                          aria-label="Gi hjerte"
                        >
                          ♥ {q.likes}
                        </button>
                      </div>
                    );
                  })}
                  {!(data.questions || []).length && <p className="m-0 text-sm text-[#5b6170]">Ingen spørsmål ennå. Bli den første!</p>}
                </div>
              </>
            )}
            {error && <p className="m-0 mt-4 text-sm font-semibold text-[#b91c1c]">{error}</p>}
          </>
        )}
        <p className="m-0 mt-10 text-center text-xs text-[#9aa19d]">Laget med Flatr</p>
      </main>
    </div>
  );
}
