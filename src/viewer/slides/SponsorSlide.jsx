import SponsorCarousel from '../components/SponsorCarousel.jsx';

export default function SponsorSlide({ slide, ctx }) {
  const cfg = slide.config || {};
  const ids = Array.isArray(cfg.sponsorIds) ? cfg.sponsorIds : [];
  const sponsors = ids.length
    ? (ctx.sponsors || []).filter((s) => ids.includes(s.id))
    : ctx.sponsors || [];

  return (
    <div className="flex h-full w-full flex-col">
      <SponsorCarousel sponsors={sponsors} />
    </div>
  );
}
