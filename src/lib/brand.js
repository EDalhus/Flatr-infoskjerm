// Merkevaresettet per konto: logo, farger og skrifter. Lagres i settings.brand.
// Brukes av editoren (fargesnarveier, standardskrift og -bakgrunn) og av
// AI-assistenten (bindende regler). Felles for server og nettleser.

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v) => (HEX.test(String(v || '')) ? String(v).toLowerCase() : null);
const str = (v, max) => String(v ?? '').trim().slice(0, max);

export const BRAND_COLORS = [
  { key: 'primary', label: 'Hovedfarge' },
  { key: 'accent', label: 'Aksentfarge' },
  { key: 'background', label: 'Bakgrunn' },
  { key: 'text', label: 'Tekst' }
];

/** Renser merkevaresettet. null-felt = ikke satt. */
export function cleanBrand(b) {
  const colors = {};
  for (const { key } of BRAND_COLORS) colors[key] = hex(b?.colors?.[key]);
  const extra = (Array.isArray(b?.extra) ? b.extra : [])
    .map((c) => ({ name: str(c?.name, 40), hex: hex(c?.hex) }))
    .filter((c) => c.hex)
    .slice(0, 8);
  const logo = str(b?.logo, 500);
  return {
    name: str(b?.name, 80) || null,
    logo: /^(\/api\/media\?|https:\/\/)/.test(logo) ? logo : null,
    colors,
    extra,
    fonts: { heading: str(b?.fonts?.heading, 120) || null, body: str(b?.fonts?.body, 120) || null },
    notes: str(b?.notes, 2000) || null
  };
}

export const brandIsEmpty = (b) =>
  !b || (!b.logo && !b.name && !Object.values(b.colors || {}).some(Boolean) && !b.extra?.length && !b.fonts?.heading && !b.fonts?.body && !b.notes);

/** Alle farger som snarveier: [{ name, hex }]. */
export function brandSwatches(b) {
  if (!b) return [];
  const out = BRAND_COLORS.filter(({ key }) => b.colors?.[key]).map(({ key, label }) => ({ name: label, hex: b.colors[key] }));
  for (const c of b.extra || []) out.push({ name: c.name || c.hex, hex: c.hex });
  return out.filter((c, i, all) => all.findIndex((x) => x.hex === c.hex) === i);
}


/**
 * Gir tekstelementer merkevarens skrift (overskrift for store tekster, ellers
 * brødtekst) og tekstfarge der elementet bruker standarden (hvit / ingen skrift).
 */
export function applyBrandToElements(elements, b) {
  if (!b) return elements;
  return (elements || []).map((e) => {
    if (e.kind !== 'text') return e;
    const c = { ...(e.config || {}) };
    const heading = (Number(c.size) || 64) >= 80;
    if (!c.font) c.font = (heading ? b.fonts?.heading : b.fonts?.body) || b.fonts?.heading || b.fonts?.body || '';
    if ((!c.color || c.color.toLowerCase() === '#ffffff') && b.colors?.text) c.color = b.colors.text;
    return { ...e, config: c };
  });
}

/** Bakgrunn for nye lysbilder, eller null. */
export const brandBackground = (b) => (b?.colors?.background ? { type: 'color', color: b.colors.background } : null);
