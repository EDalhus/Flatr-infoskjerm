import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { SLIDE_TYPE_LABEL } from '../../lib/slides.js';
import { Icon, IconButton, GroupCard, Row, MediaTile, PageHeader, ErrorText } from './ui.jsx';

export default function TemplatesManager({ onChange }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const load = () =>
    api.templates
      .list()
      .then((r) => setItems(r || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    if (!confirm('Slette malen?')) return;
    try {
      await api.templates.remove(id);
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const slideT = items.filter((t) => t.kind === 'slide');
  const screenT = items.filter((t) => t.kind === 'screen');

  const describe = (t) => {
    if (t.kind === 'slide') {
      const p = t.payload || {};
      return `Slide · ${SLIDE_TYPE_LABEL[p.type] || p.type || '—'} · ${p.duration_seconds || 15}s`;
    }
    const zones = Object.keys(t.payload?.zones || {});
    return `Skjerm · ${t.payload?.layout || '—'} · soner ${zones.join(', ') || '—'}`;
  };

  const section = (label, list) => (
    <GroupCard label={`${label} · ${list.length}`} icon="layers">
      {list.length === 0 && <div className="px-5 py-4 text-sm text-muted">Ingen maler.</div>}
      {list.map((t) => (
        <Row
          key={t.id}
          media={
            <MediaTile tone="muted">
              <Icon name="layers" className="h-5 w-5" />
            </MediaTile>
          }
          title={t.name}
          meta={<span>{describe(t)}</span>}
          actions={<IconButton name="x" label="Slett" tone="danger" onClick={() => remove(t.id)} />}
        />
      ))}
    </GroupCard>
  );

  return (
    <>
      <PageHeader crumbs={['Innhold', 'Maler']} />
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6 sm:p-8">
        <p className="text-sm text-muted">
          Maler lages med «Lagre som mal» i en slide (skjerm-editor / spilleliste) eller på en hel
          skjerm. Bruk dem via «Fra mal» når du legger til slides eller oppretter en skjerm.
        </p>
        <ErrorText>{error}</ErrorText>
        {section('Slide-maler', slideT)}
        {section('Skjermmaler', screenT)}
      </div>
    </>
  );
}
