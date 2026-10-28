// Mørke kartfliser (som Kystverkets kart), laget av Kartverkets topografiske
// fliser i nettleseren. Hver flis fargelegges én gang og mellomlagres som et
// bilde, så kartet ikke trenger et levende SVG-filter (som gjorde editoren treg).
//
// Vann er lyst og tydelig blått (blå − rød ≥ 13 og grønn ≥ 224 – bygninger er
// også blå, men mørke); alt annet – land, veier, tekst – blir land. Vannflaten
// «lukkes» (utvides og krympes 2 px), så tynne ting midt i sjøen – stedsnavn,
// stiplede linjer – forsvinner, mens kystlinjen står. Gjennomsiktige deler
// (utenfor Kartverkets dekning) forblir gjennomsiktige.

export const NAUTICAL = { sea: [11, 22, 48], land: [46, 50, 56] };

const SIZE = 256;
const R = 2; // lukkeradius i piksler
const MAX_CACHED = 600;
const cache = new Map(); // flis-URL -> Promise<objectURL | null>

/** Maks/min over et (2R+1)-vindu, separabelt (horisontalt, så vertikalt). */
function morph(src, max) {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const pick = max ? (a, b) => (a > b ? a : b) : (a, b) => (a < b ? a : b);
  const edge = max ? 0 : 1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let v = edge ? 1 : 0;
      for (let k = -R; k <= R; k++) {
        const xx = x + k;
        v = pick(v, xx < 0 || xx >= SIZE ? src[y * SIZE + x] : src[y * SIZE + xx]);
      }
      tmp[y * SIZE + x] = v;
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let v = edge ? 1 : 0;
      for (let k = -R; k <= R; k++) {
        const yy = y + k;
        v = pick(v, yy < 0 || yy >= SIZE ? tmp[y * SIZE + x] : tmp[yy * SIZE + x]);
      }
      out[y * SIZE + x] = v;
    }
  }
  return out;
}

async function render(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(SIZE, SIZE) : Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;

  const water = new Uint8Array(SIZE * SIZE);
  for (let i = 0, p = 0; p < water.length; i += 4, p++) {
    water[p] = d[i + 3] > 0 && d[i + 2] - d[i] >= 13 && d[i + 1] >= 224 ? 1 : 0;
  }
  const closed = morph(morph(water, true), false);

  const [sr, sg, sb] = NAUTICAL.sea;
  const [lr, lg, lb] = NAUTICAL.land;
  for (let i = 0, p = 0; p < closed.length; i += 4, p++) {
    if (d[i + 3] === 0) continue; // utenfor dekning
    const w = closed[p];
    d[i] = w ? sr : lr;
    d[i + 1] = w ? sg : lg;
    d[i + 2] = w ? sb : lb;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return URL.createObjectURL(blob);
}

/** Objekt-URL til den mørke versjonen av flisen (mellomlagret). */
export function nauticalTile(url) {
  let p = cache.get(url);
  if (!p) {
    p = render(url).catch(() => null);
    cache.set(url, p);
    if (cache.size > MAX_CACHED) {
      const [oldUrl, old] = cache.entries().next().value;
      cache.delete(oldUrl);
      old.then((u) => u && URL.revokeObjectURL(u));
    }
  }
  return p;
}
