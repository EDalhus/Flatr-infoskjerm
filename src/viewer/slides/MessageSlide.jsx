const TONES = {
  info: 'bg-brand text-white',
  success: 'bg-ok text-white',
  warn: 'bg-danger text-white'
};

export default function MessageSlide({ slide }) {
  const cfg = slide.config || {};
  const tone = TONES[cfg.emphasis] || TONES.info;

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center rounded-2xl p-10 text-center shadow-card ${tone}`}
    >
      {slide.title && (
        <div className="mb-4 text-xl font-black uppercase tracking-[0.35em] text-white/80">
          {slide.title}
        </div>
      )}
      <div className="text-5xl font-extrabold leading-tight portrait:text-3xl">
        {cfg.text || 'Ingen melding'}
      </div>
    </div>
  );
}
