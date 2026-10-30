import { readFileSync } from 'node:fs';

// Gjør AIS-destinasjoner leselige. Mannskapet skriver ofte havnekoden fra
// UN/LOCODE («NOAES», «NO AES», «NOKSU>NOAES») i stedet for navnet. Tabellen
// (locodePorts.json) er alle havner i UN/LOCODE: kode -> navn («NOAES» -> «Ålesund»),
// hentet fra datasets/un-locode. Lastes først når den trengs.

let ports, names;
const table = () => (ports ??= JSON.parse(readFileSync(new URL('./locodePorts.json', import.meta.url), 'utf8')));
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/Ø/g, 'O').replace(/Æ/g, 'AE');
// Havnenavn på fem bokstaver («FJELL»), som ellers kunne blitt lest som en kode (FJ + ELL).
const isName = (s) => (names ??= new Set(Object.values(table()).map(plain))).has(s);

// «ALESUND» -> «Alesund», «HAV SAGA» -> «Hav Saga» (AIS-tekst er store bokstaver).
const nice = (s) => (/\p{Ll}/u.test(s) ? s : s.toLowerCase().replace(/(^|[\s\-/])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase()));

/** «NOAES» / «NO AES» / «NO-AES» -> «Ålesund». Ukjent kode eller fritekst -> pent skrevet tekst. */
export function portName(raw) {
  if (!raw) return null;
  // «NOKSU>NOAES» / «KRISTIANSUND > ALESUND»: fra > til – det er målet som gjelder.
  const s = String(raw).split('>').pop().replace(/\s+/g, ' ').trim().toUpperCase();
  if (!s) return null;
  const m = /^([A-Z]{2})[ \-_.]?([A-Z2-9]{3})\b/.exec(s);
  const hit = m && !(s.length === 5 && isName(s)) && table()[m[1] + m[2]];
  return hit || nice(s);
}
