function parseVideo(url) {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/.exec(url || '');
  if (yt) return { kind: 'youtube', id: yt[1] };
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url || '');
  if (vm) return { kind: 'vimeo', id: vm[1] };
  return { kind: 'file' };
}

export default function VideoSlide({ slide, onNext }) {
  const cfg = slide.config || {};
  const v = parseVideo(cfg.url);
  const fit = cfg.fit === 'cover' ? 'object-cover' : 'object-contain';

  if (!cfg.url) {
    return (
      <div className="grid h-full w-full place-items-center rounded-2xl border border-hair bg-card text-muted shadow-card">
        Ingen video-URL
      </div>
    );
  }

  if (v.kind === 'youtube') {
    const p = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      controls: '0',
      playsinline: '1',
      rel: '0',
      modestbranding: '1',
      loop: cfg.loop ? '1' : '0'
    });
    if (cfg.loop) p.set('playlist', v.id);
    return (
      <iframe
        className="h-full w-full rounded-2xl border-0 bg-black shadow-card"
        allow="autoplay; fullscreen; encrypted-media"
        src={`https://www.youtube.com/embed/${v.id}?${p}`}
        title={slide.title || 'Video'}
      />
    );
  }

  if (v.kind === 'vimeo') {
    return (
      <iframe
        className="h-full w-full rounded-2xl border-0 bg-black shadow-card"
        allow="autoplay; fullscreen"
        src={`https://player.vimeo.com/video/${v.id}?autoplay=1&muted=1&background=1&loop=${
          cfg.loop ? 1 : 0
        }`}
        title={slide.title || 'Video'}
      />
    );
  }

  return (
    <video
      src={cfg.url}
      className={`h-full w-full rounded-2xl bg-black shadow-card ${fit}`}
      autoPlay
      muted={cfg.mute !== false}
      loop={!!cfg.loop}
      playsInline
      onEnded={() => {
        if (!cfg.loop) onNext?.();
      }}
    />
  );
}
