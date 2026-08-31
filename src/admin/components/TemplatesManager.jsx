import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { ELEMENT_LABEL } from '../../lib/deck.js';
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

  const describe = (t) => {
    const p = t.payload || {};
    if (t.kind === 'slide') {
      const kinds = (p.elements || []).map((e) => ELEMENT_LABEL[e.kind] || e.kind);
      return `Lysbilde · ${p.elements?.length || 0} elementer${kinds.length ? ` (${kinds.slice(0, 4).join(', ')})` : ''}`;
    }
    return `${t.kind} · gammel modell`;
  };

  return (
    <>
      <PageHeader crumbs={['Innhold', 'Maler']} />
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6 sm:p-8">
        <p className="text-sm text-muted">
          Lag maler med «Lagre som mal» på et lysbilde i skjerm-editoren. De blir tilgjengelige når
          du legger til et nytt lysbilde.
        </p>
        <ErrorText>{error}</ErrorText>
        <GroupCard label={`Maler · ${items.length}`} icon="layers">
          {items.length === 0 && <div className="px-5 py-4 text-sm text-muted">Ingen maler ennå.</div>}
          {items.map((t) => (
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
      </div>
    </>
  );
}
