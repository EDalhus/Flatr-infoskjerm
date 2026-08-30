export default function ImageSlide({ slide }) {
  const cfg = slide.config || {};
  const fit = cfg.fit === 'cover' ? 'object-cover' : 'object-contain';

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-hair bg-card shadow-card">
      {cfg.url ? (
        <img src={cfg.url} alt={cfg.caption || slide.title || ''} className={`h-full w-full ${fit}`} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          Ingen bilde-URL
        </div>
      )}
      {cfg.caption && (
        <div className="absolute inset-x-0 bottom-0 bg-ink/70 px-6 py-3 text-center text-xl font-semibold text-white">
          {cfg.caption}
        </div>
      )}
    </div>
  );
}
