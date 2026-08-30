import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatTime } from '../../lib/time.js';
import { Icon, Button, IconButton, GroupCard, Row, MediaTile, PageHeader, ErrorText } from './ui.jsx';

export default function RecentlyDeletedManager({ onChange }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.trash
      .list()
      .then((r) => setItems(r || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const restore = async (id) => {
    setBusy(true);
    setError('');
    try {
      await api.trash.restore(id);
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const purge = async (id) => {
    if (!confirm('Slette permanent? Kan ikke angres.')) return;
    try {
      await api.trash.purge(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const empty = async () => {
    if (!confirm('Tømme hele papirkurven permanent?')) return;
    try {
      await api.trash.empty();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const when = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${formatTime(iso)}`;
  };

  return (
    <>
      <PageHeader crumbs={['Visning', 'Nylig slettet']} />
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6 sm:p-8">
        <p className="text-sm text-muted">
          Slettede elementer ligger her i 30 dager og kan gjenopprettes. Skjermer og spillelister
          gjenopprettes med innholdet sitt.
        </p>
        <ErrorText>{error}</ErrorText>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-muted">
            Papirkurven er tom.
          </p>
        ) : (
          <GroupCard
            label={`I papirkurven · ${items.length}`}
            icon="x"
            right={
              <button
                onClick={empty}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-zoneink/80 hover:text-zoneink"
              >
                Tøm alt
              </button>
            }
          >
            {items.map((t) => (
              <Row
                key={t.id}
                media={
                  <MediaTile tone="muted">
                    <Icon name="x" className="h-5 w-5" />
                  </MediaTile>
                }
                title={t.label}
                meta={
                  <>
                    <span>{t.kind_label}</span>
                    <span>· slettet {when(t.deleted_at)}</span>
                  </>
                }
                actions={
                  <>
                    <IconButton name="x" label="Slett permanent" tone="danger" onClick={() => purge(t.id)} />
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => restore(t.id)}>
                      Gjenopprett
                    </Button>
                  </>
                }
              />
            ))}
          </GroupCard>
        )}
      </div>
    </>
  );
}
