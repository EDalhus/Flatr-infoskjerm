import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatTime } from '../../lib/time.js';
import { Icon, Button, IconButton, GroupCard, Row, MediaTile, PageHeader, ErrorText } from './ui.jsx';
import { tr, locale } from '../../lib/i18n.js';

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
    if (!confirm(tr('Slette permanent? Kan ikke angres.'))) return;
    try {
      await api.trash.purge(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const empty = async () => {
    if (!confirm(tr('Tømme hele papirkurven permanent?'))) return;
    try {
      await api.trash.empty();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const when = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} ${formatTime(iso)}`;
  };

  return (
    <>
      <PageHeader title={tr('Nylig slettet')} subtitle={tr('Slettede ting kan gjenopprettes i 30 dager.')} />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        <p className="text-sm text-muted">
          {tr('Slettede elementer ligger her i 30 dager og kan gjenopprettes. Skjermer og lysbilder gjenopprettes med innholdet sitt.')}
        </p>
        <ErrorText>{error}</ErrorText>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-muted">
            {tr('Papirkurven er tom.')}
          </p>
        ) : (
          <GroupCard
            label={tr('I papirkurven · {0}', [items.length])}
            icon="x"
            right={
              <button
                onClick={empty}
                className="text-xs font-semibold text-zoneink/80 hover:text-zoneink"
              >
                {tr('Tøm alt')}
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
                    <span>{tr('· slettet')} {when(t.deleted_at)}</span>
                  </>
                }
                actions={
                  <>
                    <IconButton name="x" label={tr('Slett permanent')} tone="danger" onClick={() => purge(t.id)} />
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => restore(t.id)}>
                      {tr('Gjenopprett')}
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
