# Infoskjerm for arrangementer

En infoskjerm-webapp for events, kjørt som en **Cloudflare Worker med statiske
assets** og **D1**. To deler:

| Del | Rute | Beskrivelse |
| --- | --- | --- |
| **Viewer** | `/display/:screenId` | Publikumsvisning. Layout med soner, per-sone slideshow, kategorifarger, auto-responsiv 16:9 / 9:16, sanntid via SSE, wake lock, hastemeldinger som overlay. |
| **Admin** | `/admin` | Program, kategorier, sponsorer, spillelister, mediebibliotek, maler, skjermer (layout + slides), live alerts, nylig slettet. |
| **Program** | `/s/:screenId` | Offentlig, mobilvennlig programside for publikum (QR fra skjermen). Nå/neste, dag for dag, kategorifarger, `.ics`-eksport, oppdateres selv. |

## Skjermoppsett

Hver skjerm har en **layout** og én eller flere **soner** (a/b/c …). Hver sone
har en **spilleliste av slides** som roterer som et slideshow – hver slide i sitt
eget `duration_seconds`.

**Layout-presets:** `solo` (helskjerm), `main-side` (70/30), `split` (50/50),
`thirds` (stor A + B/C stablet) og `custom` (egendefinerte sone-rektangler i
prosent – full kontroll, sonene kan overlappe).

**Slide-typer:** `program`, `sponsors`, `message`, `clock`, `image`, `video`
(MP4/WebM eller YouTube/Vimeo), `web` (embed en nettside), `qr` (QR-kode – kan
peke på skjermens egen programside), `countdown` (til et tidspunkt eller til
neste programpost), `layout` (fri slide med posisjonerte tekst-/bilde-elementer).
En sone kan også vise en **delt spilleliste** i stedet for inline-slides.

**Tidsstyring:** hver slide / spilleliste-element kan settes til å vises bare i
et klokkeslett-vindu, på visse ukedager og/eller i et datointervall («Vises
når» i editoren). Filtreres i Viewer mot skjermens lokale klokke.
Program-slides filtreres pr. **kategori** (`categoryIds` – tom = alle), visning
(`agenda` / `nowNext` / `next`), maks antall og evt. scene. Slik kan én skjerm
vise kun «Scene»-poster mens en annen viser alt.

**Kategorier** (admin → Kategorier) gir navn + farge, som vises som merke på de
offentlige skjermene.

**Spillelister** (admin → Spillelister) er gjenbrukbare rekker av slides. En
sone på en skjerm kan peke på en spilleliste, så samme innhold (f.eks.
«Sponsorer VLAN») vedlikeholdes ett sted og brukes på mange skjermer.

**Mediebibliotek** (admin → Bibliotek) lagrer opplastede bilder i R2. Bilde-slides
og sponsorlogoer kan velge fra biblioteket i stedet for å lime inn en URL.
Krever en R2-bucket – se «Mediebibliotek» under.

**Maler** (admin → Maler): «Lagre som mal» på en slide eller en hel skjerm, og
«Fra mal» når du legger til slides / oppretter en skjerm.

**Live forhåndsvisning:** slide-editoren rendrer den ekte Viewer-komponenten
skalert ned ved siden av feltene og oppdaterer mens du skriver. På en fri slide
kan du dra elementene rett på forhåndsvisningen.

**Dra-og-slipp:** slides i en sone / spilleliste kan omrokeres ved å dra radene
(opp/ned-pilene finnes fortsatt).

**Nylig slettet:** sletting legger elementet i en papirkurv i 30 dager
(admin → Nylig slettet). Skjermer og spillelister gjenopprettes med innholdet.

**Auto-status:** programposter med `auto_status = 1` flipper `planlagt → pågår →
ferdig` automatisk etter klokka. `avlyst` overstyrer alltid.

**Skjermstatus:** Viewer sender heartbeat, og admin viser grønn/grå prikk
(online hvis sett innen 90 s). «Dupliser» kopierer en skjerm inkl. alle slides.

Alle endringer pushes til skjermene i sanntid (SSE). Skjerm-editoren har en
live `<iframe>`-forhåndsvisning.

## Teknologi

- React + Vite + Tailwind CSS, React Router
- Én Worker (`src/worker.js`) ruter `/api/*` → `src/api/*`, `ASSETS` serverer
  `dist/` med SPA-fallback
- Cloudflare D1 via `env.DB`
- SSE (`src/api/stream.js`)
- `wrangler.jsonc`

---

## 1. Kjøre lokalt

```bash
npm install
npm run db:local     # laster schema.sql inn i lokal D1 (kjør én gang)
cp .dev.vars.example .dev.vars   # valgfritt: ADMIN_TOKEN
npm run dev          # vite build && wrangler dev  →  http://localhost:8788
```

- Admin: <http://localhost:8788/admin>
- Viewer: <http://localhost:8788/display/1>

Rask UI-iterasjon uten API: `npm run dev:client` (ren Vite, port 5173).

---

## 2. Cloudflare D1

### Opprett

```bash
npx wrangler d1 create event-infoscreen-db   # lim database_id inn i wrangler.jsonc
```

### Frisk database (alt + demo-data)

```bash
npx wrangler d1 execute event-infoscreen-db --remote --file=./schema.sql
# eller lokalt: npm run db:local
```

### Migrering av en eksisterende database

`schema.sql` er for tomme databaser. Har du data fra en tidligere versjon, kjør
migreringene i rekkefølge:

```bash
npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0002_zones_categories_slides.sql
npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0003_playlists_media_templates.sql
npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0004_slidetypes_dayparting_trash.sql
```

`0002` legger til kategorier, per-skjerm layout/soner/slides, skjermstatus og
auto-status. `0003` legger til spillelister, mediebibliotek og maler. `0004`
legger til tidsstyring på slides og en papirkurv. SQLite har ikke «ADD COLUMN
IF NOT EXISTS» – har du alt kjørt en migrering, feiler `ALTER`-linjene med
«duplicate column name», og da er du allerede oppdatert (kjør resten manuelt om
en migrering stopper midt i – se feilmeldingen).

## Mediebibliotek (R2)

Bilder lastes opp til en R2-bucket (binding `MEDIA` i `wrangler.jsonc`). Opprett
den én gang:

```bash
npx wrangler r2 bucket create flatr-infoscreen-media
```

Uten bucketen fungerer resten av appen som normalt – Bibliotek-fanen viser bare
en melding, og bilde-slides/sponsorer kan fortsatt bruke vanlige URL-er.
`wrangler dev` simulerer R2 lokalt automatisk.

Ad hoc:

```bash
npx wrangler d1 execute event-infoscreen-db --remote --command "SELECT * FROM screen_slides;"
```

---

## 3. Deploy

Git-koblet Worker: hver push kjører `npm install → npm run build → npx wrangler
deploy`. `wrangler.jsonc` laster opp `dist/`, deployer `src/worker.js` og kobler
på D1-bindingen `DB`.

> `name` i `wrangler.jsonc` må være navnet på Worker-prosjektet i dashboardet.

Manuelt: `npm run deploy`. Admin-token i prod: `npx wrangler secret put ADMIN_TOKEN`.
For mediebibliotek: `npx wrangler r2 bucket create flatr-infoscreen-media` (én gang).

---

## API

Under `/api`, rutet av `src/worker.js`. Skriveoperasjoner krever
`Authorization: Bearer <ADMIN_TOKEN>` når hemmeligheten er satt.

| Endepunkt | Metoder | Beskrivelse |
| --- | --- | --- |
| `/api/screens` | `GET POST PUT DELETE` | Skjermer + layout/rotasjon. `GET` gir `slide_count` + `online`. `POST {duplicate_of}` kloner. |
| `/api/slides` | `GET POST PUT DELETE` | Slides pr. skjerm (`?screen=` / `?id=`). `playlist_id` gjør raden til en spilleliste-referanse. |
| `/api/playlists` | `GET POST PUT DELETE` | Spillelister (`?id=` gir elementene). |
| `/api/playlist-items` | `GET POST PUT DELETE` | Elementer i en spilleliste (`?playlist=` / `?id=`). |
| `/api/media` | `GET POST DELETE` | Mediebibliotek. `POST` = rå fil-bytes (`?name=&type=`), `GET ?id=&raw=1` serverer fila. |
| `/api/templates` | `GET POST DELETE` | Maler (`?kind=slide\|screen`). |
| `/api/trash` | `GET POST DELETE` | Papirkurv. `POST ?id=` gjenoppretter, `DELETE ?id=` / `?all=1` sletter permanent. |
| `/api/health` | `GET` | `{ ok, db, media, time }`. |
| `/api/categories` | `GET POST PUT DELETE` | Kategorier (navn + farge). |
| `/api/schedule` | `GET POST PUT DELETE` | Program (+ `category_id`, `auto_status`, utledet `effective_status`). |
| `/api/sponsors` | `GET POST PUT DELETE` | Sponsorer. |
| `/api/alerts` | `GET POST DELETE` | Hastemeldinger (`?id=` / `?all=1` arkiverer). |
| `/api/heartbeat` | `POST` | `?screen=` – Viewer melder at den er i live. |
| `/api/state` | `GET` | Samlet tilstand for én skjerm (`?screen=`). |
| `/api/stream` | `GET` | SSE: `snapshot` ved tilkobling, `update` ved endring. |

### Sanntid

`stream.js` poller D1 hvert `SSE_POLL_MS` (default 3000 ms) og sender `update`
når en innholds-signatur endres. Tilkoblingen lever ~10 min; `EventSource`
kobler til igjen selv. For større skala: bytt polling mot Durable Objects/Queues
uten å endre klienten.

---

## Prosjektstruktur

```
├── wrangler.jsonc            # Worker: main + assets (ASSETS) + D1 (DB) + R2 (MEDIA)
├── schema.sql                # fullt skjema + demo-data
├── migrations/               # 0001 … 0004 (init · soner+kategorier · spillelister+media+maler · slidetyper+tidsstyring+papirkurv)
└── src/
    ├── worker.js             # ruter /api/* + ASSETS-fallback
    ├── main.jsx              # ruter: /admin · /display/:id · /s/:id
    ├── api/                   # screens, slides, playlists, playlistItems, media,
    │                          #   templates, trash, health, categories, schedule,
    │                          #   sponsors, alerts, heartbeat, state, stream, _shared
    ├── lib/{api,time,layouts,slides,daypart,ics}.js
    ├── hooks/{useNow,useWakeLock,useSSE,useOrientation,useSlideshow,useHeartbeat,useFitScale,useListDnd}.js
    ├── viewer/
    │   ├── Viewer.jsx         # skalert design-lerret, løser soner + monterer <Zone>
    │   ├── Zone.jsx           # per-sone slideshow + tidsstyrings-filter
    │   ├── slides/            # SlideView + Program/Sponsor/Message/Clock/Image/Layout/Web/Video/Qr/Countdown
    │   └── components/{SponsorCarousel,AlertOverlay}.jsx
    ├── public/Schedule.jsx    # offentlig programside (/s/:id)
    └── admin/
        ├── Admin.jsx          # sidebar-nav i seksjoner (?view=), token
        └── components/        # ui, MediaPicker, slides/{SlideForm,SlidePreview}, og *Manager for
                               #   Schedule / Categories / Sponsors / Playlists / MediaLibrary /
                               #   Templates / Screens / Alerts / RecentlyDeleted
```

Buildstate løser spilleliste-referanser opp til de faktiske elementene, så
Viewer trenger ingen kunnskap om spillelister – en sone får bare en flat liste
slides.

## Viewer-detaljer

- Sonene plasseres absolutt i prosent; `thirds`/`main-side`/`split` har egne
  rektangler for liggende og stående, `custom` bruker `screens.custom_layout`.
- `navigator.wakeLock` bes om automatisk og fornyes på `visibilitychange`.
- Hver sone crossfader mellom sine slides; små prikker viser posisjon.
- Ny aktiv `alert` gir full-skjerm pop-up (30 s) oppå alle soner.
