// «Kom i gang etter bransje» (veiviseren på Hjem): en ferdig presentasjon og
// forslag til apper for det Flatr skal brukes til. Appene aktiveres bare hvis
// kunden lar dem stå på. Lysbilder som trenger en app, tas bare med når appen er valgt.
//
// slides(ctx) får ctx = { org, app(kind) -> app-id eller null, poll -> id } og
// gir lysbilder i samme form som POST /api/deck-slides.

import { defaultElement } from '../../lib/deck.js';

const el = (kind, x, y, w, h, config = {}, z = 0) => {
  const d = defaultElement(kind, z);
  return { ...d, x, y, w, h, config: { ...d.config, ...config } };
};
const text = (x, y, w, h, value, config = {}, z = 1) =>
  el('text', x, y, w, h, { text: value, size: 64, weight: 700, color: '#ffffff', autoFit: true, ...config }, z);

const BG = {
  green: { type: 'gradient', from: '#027353', to: '#0b2a22', angle: 135 },
  night: { type: 'dynamic', preset: 'aurora', base: '#0a1a2f', colors: ['#34d399', '#22d3ee', '#3b82f6'] },
  warm: { type: 'gradient', from: '#9a3412', to: '#1f2937', angle: 135 },
  sea: { type: 'gradient', from: '#0e7490', to: '#0f172a', angle: 135 },
  violet: { type: 'gradient', from: '#6d28d9', to: '#111827', angle: 135 },
  slate: { type: 'color', color: '#0f172a' }
};

const welcome = (title, sub, background) => ({
  name: 'Velkommen',
  duration_seconds: 12,
  background,
  elements: [text(7, 30, 70, 24, title, { size: 140, weight: 800, valign: 'bottom' }), text(7, 56, 66, 14, sub, { size: 52, weight: 500, color: '#d7f5ec' }, 2), el('clock', 72, 7, 22, 15, { showDate: true, showSeconds: false }, 3)]
});

const appSlide = (name, appId, config, background, title) => ({
  name,
  duration_seconds: 15,
  background,
  elements: [
    ...(title ? [text(6, 6, 80, 11, title, { size: 72, weight: 800 })] : []),
    el('app', 6, title ? 19 : 8, 88, title ? 74 : 84, { appId, frame: false, ...config }, 2)
  ]
});

export const INDUSTRIES = [
  {
    id: 'sport',
    title: 'Idrettslag og klubb',
    text: 'Kamper, sponsorer og beskjeder i klubbhuset.',
    icon: 'calendar',
    apps: [
      { kind: 'fixtures', why: 'Neste kamper rett fra fotball.no eller handball.no' },
      { kind: 'poll', why: 'Avstemninger og spørsmål på medlemsmøter og klubbkvelder' }
    ],
    tips: ['Legg sponsorlogoene i mappen «Sponsorer» i Biblioteket, så går de rundt på sponsorlysbildet.'],
    slides: ({ org, app }) => [
      welcome(`Velkommen til ${org}`, 'Heia oss!', BG.green),
      ...(app('fixtures') ? [appSlide('Neste kamper', app('fixtures'), { fixturesView: 'list', max: 6, title: 'Neste kamper' }, BG.slate)] : []),
      {
        name: 'Sponsorer',
        duration_seconds: 15,
        background: { type: 'color', color: '#ffffff' },
        elements: [
          text(6, 7, 88, 12, 'Takk til sponsorene våre', { size: 72, weight: 800, color: '#0f172a', align: 'center' }),
          el('carousel', 15, 25, 70, 65, { folder: 'Sponsorer', seconds: 6, fit: 'contain' }, 2)
        ]
      },
      {
        name: 'Kiosken',
        duration_seconds: 10,
        background: BG.warm,
        elements: [text(7, 28, 80, 24, 'Kiosken er åpen i pausen', { size: 110, weight: 800 }), text(7, 55, 70, 12, 'Vi tar Vipps og kort', { size: 56, weight: 500 }, 2)]
      }
    ]
  },
  {
    id: 'canteen',
    title: 'Kantine og lunsjrom',
    text: 'Dagens meny, bursdager og beskjeder til de ansatte.',
    icon: 'calendar',
    apps: [
      { kind: 'menu', why: 'Dagens og ukens meny, lagt inn i Flatr' },
      { kind: 'birthdays', why: 'Hvem som har bursdag denne uka' }
    ],
    slides: ({ org, app }) => [
      ...(app('menu') ? [appSlide('Dagens meny', app('menu'), { menuView: 'today' }, BG.warm)] : []),
      ...(app('birthdays') ? [appSlide('Bursdager', app('birthdays'), { days: 7 }, BG.violet)] : []),
      welcome(`God lunsj!`, `Hilsen alle oss i ${org}`, BG.green),
      {
        name: 'Husk',
        duration_seconds: 10,
        background: BG.slate,
        elements: [text(7, 30, 80, 30, 'Husk å sette brettet tilbake 🙏', { size: 110, weight: 800 })]
      }
    ]
  },
  {
    id: 'reception',
    title: 'Resepsjon og kontor',
    text: 'Velkommen, avganger og praktisk informasjon til besøkende.',
    icon: 'home',
    apps: [
      { kind: 'entur', why: 'Avganger fra holdeplassen i nærheten, i sanntid' },
      { kind: 'weather', why: 'Været fra Yr på skjermen' }
    ],
    tips: ['Skriv inn navnet og passordet til gjestenettet på lysbildet «Gjestenett».'],
    slides: ({ org, app }) => [
      welcome(`Velkommen til ${org}`, 'Meld deg i resepsjonen', BG.night),
      ...(app('entur') ? [appSlide('Avganger', app('entur'), { max: 8, walkMinutes: 3 }, BG.slate)] : []),
      {
        name: 'Gjestenett',
        duration_seconds: 10,
        background: BG.sea,
        elements: [
          text(7, 24, 80, 14, 'Gjestenett', { size: 90, weight: 800 }),
          text(7, 42, 80, 22, 'Nettverk: Gjest\nPassord: skriv-passordet-her', { size: 64, weight: 500, lineHeight: 1.3 }, 2)
        ]
      }
    ]
  },
  {
    id: 'event',
    title: 'Arrangement og konferanse',
    text: 'Program, nedtelling og avstemninger fra salen.',
    icon: 'megaphone',
    apps: [
      { kind: 'events', why: 'Programmet med scener og tider, og nedtelling til neste post' },
      { kind: 'poll', why: 'Publikum stemmer og stiller spørsmål fra mobilen' }
    ],
    slides: ({ org, app, poll }) => [
      welcome(`Velkommen til ${org}`, 'Godt arrangement!', BG.violet),
      ...(app('events')
        ? [
            { name: 'Program', duration_seconds: 15, background: BG.slate, elements: [text(6, 6, 80, 11, 'Program', { size: 72, weight: 800 }), el('program', 6, 19, 88, 74, { mode: 'agenda', max: 8 }, 2)] },
            { name: 'Neste', duration_seconds: 10, background: BG.night, elements: [el('countdown', 15, 25, 70, 50, { mode: 'nextItem' }, 1)] }
          ]
        : []),
      ...(app('poll') ? [appSlide('Avstemning', app('poll'), { pollId: poll ?? null }, BG.violet)] : [])
    ]
  },
  {
    id: 'harbor',
    title: 'Havn og sjø',
    text: 'Skipstrafikk, tidevann og vær for havna og kaia.',
    icon: 'pin',
    apps: [
      { kind: 'tides', why: 'Tidevann, bølger og sjøtemperatur fra Kartverket og MET' },
      { kind: 'ais', why: 'Båtene i sanntid på kart (krever en gratis nøkkel fra BarentsWatch)' }
    ],
    slides: ({ org, app }) => [
      welcome(`Velkommen til ${org}`, 'Skipstrafikk og tidevann', BG.sea),
      ...(app('tides') ? [appSlide('Tidevann', app('tides'), { tideView: 'both' }, BG.slate)] : []),
      ...(app('ais') ? [appSlide('Skipstrafikk', app('ais'), { view: 'map' }, BG.slate)] : [])
    ]
  }
];

/** Eksempelavstemning for arrangementer (lages bare når Avstemning er valgt). */
export const EXAMPLE_POLL = { kind: 'choice', question: 'Hva synes du om arrangementet så langt?', options: ['Kjempebra', 'Bra', 'Middels', 'Kunne vært bedre'] };
