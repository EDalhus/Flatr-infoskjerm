import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import AppIcon from './AppIcon.jsx';
import { Icon, Button, ErrorText, Segmented } from '../ui.jsx';

// Endre appikonet: last opp en logo (PNG, JPEG, WebP, GIF – maks 2 MB) og
// velg bakgrunn. Lagres med en gang; bare eiere/den som laget appen og
// superadmin får se knappen (serveren sjekker også).

const BGS = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'white', label: 'Hvit' },
  { value: 'black', label: 'Svart' }
];

export default function IconEditor({ appKey, item, onChange, onClose }) {
  const [image, setImage] = useState(item.image || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      const next = await fn();
      setImage(next);
      onChange(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError('Bildet er for stort (maks 2 MB).');
    run(() => api.appMarket.setIcon(appKey, { file, bg: image?.bg || 'transparent' }));
  };

  return (
    <div ref={boxRef} className="absolute left-0 top-full z-40 mt-2 w-80 rounded-2xl border border-line bg-card p-4 shadow-pop">
      <div className="flex items-center gap-4">
        <AppIcon icon={item.icon} color={item.color} size={72} image={image} />
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-ink">Ikon</div>
          <div className="text-xs text-muted">PNG, JPEG, WebP eller GIF, maks 2 MB. Kvadratisk ser best ut.</div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files?.[0]);
        }}
        className="mt-4 grid place-items-center rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted"
      >
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="image" className="h-4 w-4" />
          {busy ? 'Laster opp …' : image?.url ? 'Bytt bilde' : 'Last opp bilde'}
        </Button>
        <span className="mt-2">eller slipp en fil her</span>
      </div>

      {image?.url && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold text-muted">Bakgrunn</div>
          <Segmented value={image.bg || 'transparent'} onChange={(bg) => run(() => api.appMarket.setIcon(appKey, { bg }))} options={BGS} />
        </div>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="mt-4 flex justify-between">
        {image?.url ? (
          <button type="button" className="text-sm font-medium text-danger hover:underline" disabled={busy} onClick={() => run(async () => (await api.appMarket.removeIcon(appKey), null))}>
            Fjern logo
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="text-sm text-muted hover:text-ink" onClick={onClose}>
          Ferdig
        </button>
      </div>
    </div>
  );
}
