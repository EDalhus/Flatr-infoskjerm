import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { Frame } from './SlideFrame.jsx';

export default function QrSlide({ slide, ctx, chromeless }) {
  const cfg = slide.config || {};
  const bare = chromeless || cfg.frame === false;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const target =
    cfg.mode === 'schedule' ? `${origin}/s/${ctx?.screenId ?? ''}` : cfg.url || '';

  const dataUrl = useMemo(() => {
    if (!target) return '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(target);
      qr.make();
      return qr.createDataURL(10, 2);
    } catch {
      return '';
    }
  }, [target]);

  return (
    <Frame chromeless={bare} title={bare ? null : slide.title || null}>
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-[4%] text-ink"
        style={{ containerType: 'size' }}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="QR-kode"
            className="min-h-0 flex-1 rounded-xl bg-white p-[3%]"
            style={{ objectFit: 'contain', width: 'auto', maxWidth: '100%' }}
          />
        ) : (
          <div className="text-muted">Mangler lenke</div>
        )}
        {cfg.label && (
          <div className="text-center font-extrabold" style={{ fontSize: '9cqmin' }}>
            {cfg.label}
          </div>
        )}
        {cfg.caption && (
          <div className="text-center text-muted" style={{ fontSize: '6cqmin' }}>
            {cfg.caption}
          </div>
        )}
      </div>
    </Frame>
  );
}
