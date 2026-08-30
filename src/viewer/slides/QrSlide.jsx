import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import SlideFrame from './SlideFrame.jsx';

export default function QrSlide({ slide, ctx }) {
  const cfg = slide.config || {};
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
    <SlideFrame title={slide.title || null}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-6">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="QR-kode"
            className="h-[62%] max-h-full w-auto rounded-2xl bg-white p-4 shadow-card"
          />
        ) : (
          <div className="text-muted">Mangler lenke</div>
        )}
        {cfg.label && (
          <div className="text-center text-4xl font-extrabold text-ink portrait:text-3xl">
            {cfg.label}
          </div>
        )}
        {cfg.caption && (
          <div className="text-center text-2xl text-muted portrait:text-xl">{cfg.caption}</div>
        )}
      </div>
    </SlideFrame>
  );
}
