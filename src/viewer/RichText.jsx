// Formatert tekst (se src/lib/richText.js): avsnitt, punktlister og nummererte
// lister med hengende innrykk, og fet/kursiv/understreket/farget skrift.

const JUSTIFY = { center: 'center', right: 'flex-end' };

function Runs({ runs, weight }) {
  if (!runs.length) return '​'; // tom linje beholder høyden
  return runs.map((r, i) => (
    <span
      key={i}
      style={{
        // Fet = tydelig tyngre enn resten av teksten (som ofte er tykk fra før).
        fontWeight: r.b ? Math.min(900, weight + 300) : undefined,
        fontStyle: r.i ? 'italic' : undefined,
        textDecoration: r.u ? 'underline' : undefined,
        color: r.c || undefined
      }}
    >
      {r.t}
    </span>
  ));
}

export default function RichText({ blocks, weight = 700, align = 'left' }) {
  let n = 0;
  return blocks.map((b, i) => {
    n = b.type === 'ol' ? n + 1 : 0;
    if (b.type === 'p') {
      return (
        <div key={i}>
          <Runs runs={b.runs} weight={weight} />
        </div>
      );
    }
    return (
      <div key={i} className="flex" style={{ justifyContent: JUSTIFY[align] || 'flex-start' }}>
        <span className="shrink-0 text-right" style={{ minWidth: b.type === 'ul' ? '0.9em' : '1.4em', marginRight: '0.4em' }}>
          {b.type === 'ul' ? '•' : `${n}.`}
        </span>
        <div className="min-w-0">
          <Runs runs={b.runs} weight={weight} />
        </div>
      </div>
    );
  });
}
