# Infoskjerm for arrangementer

En komplett infoskjerm-webapp for events, laget for **Cloudflare Pages** med
**Pages Functions** og **D1**. Appen har to deler:

| Del | Rute | Beskrivelse |
| --- | --- | --- |
| **Viewer** | `/display/:screenId` | Publikumsvisning på TV/skjerm. Auto-responsiv 16:9 / 9:16, sanntid via SSE, wake lock, sponsorkarusell og pop-up-varsler. |
| **Admin** | `/admin` | Administrasjon av skjermer, program, sponsorer og hastemeldinger. |

## Teknologi

- React + Vite + Tailwind CSS, React Router (`react-router-dom`)
- Cloudflare Pages Functions i `/functions/api`
- Cloudflare D1 (SQLite) via `env.DB`-binding
- Sanntid med Server-Sent Events (`/functions/api/stream.js`)
- Konfigurasjon i `wrangler.jsonc`

---

## 1. Kjøre lokalt

```bash
npm install
```

Sett opp en lokal D1-database og last inn skjemaet (kjør én gang):

```bash
# Oppretter en lokal SQLite-fil under .wrangler/ og kjører schema.sql
npm run db:local
```

> `npm run db:local` er en snarvei for
> `wrangler d1 execute event-infoscreen-db --local --file=./schema.sql`.

(Valgfritt) lag en `.dev.vars` for admin-token:

```bash
cp .dev.vars.example .dev.vars
```

Start utviklingsserveren:

```bash
npm run dev
```

`npm run dev` starter Vite (klient, port 5173) som subprosess av
`wrangler pages dev`, som serverer Functions og proxyer `/api/*`. Åpne adressen
Wrangler skriver ut (typisk `http://localhost:8788`):

- Admin: <http://localhost:8788/admin>
- Viewer: <http://localhost:8788/display/1>

Roter nettleservinduet (eller bruk devtools device-modus) for å se
16:9- og 9:16-layoutene bytte via Tailwind `landscape:` / `portrait:`.

### Kun klient (uten Functions)

```bash
npm run dev:client   # ren Vite på http://localhost:5173, /api svarer ikke
```

---

## 2. Cloudflare D1 – opprette og migrere

### Opprett databasen

```bash
npx wrangler d1 create event-infoscreen-db
```

Kommandoen skriver ut et `database_id`. Lim det inn i `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "event-infoscreen-db",
    "database_id": "<DITT_DATABASE_ID>"
  }
]
```

### Kjør skjema / migrering

Lokalt:

```bash
npx wrangler d1 execute event-infoscreen-db --local --file=./schema.sql
# eller: npm run db:local
```

Mot produksjon (remote D1):

```bash
npx wrangler d1 execute event-infoscreen-db --remote --file=./schema.sql
# eller: npm run db:remote
```

`schema.sql` bruker `CREATE TABLE IF NOT EXISTS` og kan kjøres på nytt. Nederst i
fila ligger demo-data – fjern den blokken hvis du vil ha tom database.

Ad hoc-spørringer:

```bash
npx wrangler d1 execute event-infoscreen-db --remote --command "SELECT * FROM schedule;"
```

---

## 3. Deploy til Cloudflare Pages

### Første gang

```bash
npm run build                              # bygger til ./dist
npx wrangler pages project create event-infoscreen \
  --production-branch main
```

### Deploy

```bash
npm run deploy
# = npm run build && npx wrangler pages deploy dist
```

Wrangler laster opp `./dist` og `/functions`. D1-bindingen (`DB`) leses fra
`wrangler.jsonc`.

> Kobler du prosjektet til Git i Cloudflare-dashboardet i stedet, sett:
> **Build command:** `npm run build` · **Build output directory:** `dist`.
> Legg til D1-bindingen `DB` under *Settings → Functions → D1 database bindings*.

### Admin-token (anbefalt i produksjon)

Uten `ADMIN_TOKEN` er skrive-endepunktene åpne. Sett en hemmelighet:

```bash
npx wrangler pages secret put ADMIN_TOKEN
```

Skriv inn samme verdi i `ADMIN_TOKEN`-feltet øverst i `/admin` (lagres i
`localStorage` og sendes som `Authorization: Bearer …`). `GET`-endepunktene og
SSE er alltid åpne slik at skjermene kan lese uten token.

---

## API

Alle endepunkter ligger under `/api`. Skriveoperasjoner krever `Authorization:
Bearer <ADMIN_TOKEN>` når hemmeligheten er satt.

| Endepunkt | Metoder | Beskrivelse |
| --- | --- | --- |
| `/api/screens` | `GET`, `POST`, `PUT`, `DELETE` | Skjermer (`?id=` for én / endre / slette). |
| `/api/schedule` | `GET`, `POST`, `PUT`, `DELETE` | Programposter (`?stage=` filtrerer GET, `?id=` for PUT/DELETE). |
| `/api/sponsors` | `GET`, `POST`, `PUT`, `DELETE` | Sponsorer (`?id=` for PUT/DELETE). |
| `/api/alerts` | `GET`, `POST`, `DELETE` | Hastemeldinger. `POST {message, target_screen_id?}`. `DELETE ?id=` eller `?all=1` arkiverer. |
| `/api/state` | `GET` | Samlet tilstand for en Viewer (`?screen=`). |
| `/api/stream` | `GET` | SSE. `event: snapshot` ved tilkobling, `event: update` ved endring. |

### Sanntid

`stream.js` poller D1 hvert `SSE_POLL_MS` (default 3000 ms, satt i
`wrangler.jsonc`) og sender `update` når en innholds-signatur endres. Hver
tilkobling lever i maks ~10 minutter; `EventSource` i klienten kobler seg til
igjen automatisk. For høyere skala kan polling byttes ut med **Durable Objects**
eller **Queues** som pub/sub uten å endre klienten.

---

## Prosjektstruktur

```
├── wrangler.jsonc            # Pages + D1-binding (DB)
├── schema.sql                # D1-skjema + demo-data
├── index.html                # Vite entry
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── public/_redirects         # SPA-fallback
├── functions/api/
│   ├── _shared.js            # json()/CORS/auth/buildState() (ikke rutet)
│   ├── screens.js
│   ├── schedule.js
│   ├── sponsors.js
│   ├── alerts.js
│   ├── state.js
│   └── stream.js             # SSE
└── src/
    ├── main.jsx              # React Router
    ├── lib/{api,time}.js
    ├── hooks/{useNow,useWakeLock,useSSE}.js
    ├── viewer/
    │   ├── Viewer.jsx
    │   └── components/{Clock,NowNext,ProgramPanel,SponsorCarousel,MessageBoard,AlertOverlay}.jsx
    └── admin/
        ├── Admin.jsx
        └── components/{ui,ScreensManager,ScheduleManager,SponsorsManager,AlertsManager}.jsx
```

## Viewer-detaljer

- **Responsivt:** `landscape:` gir 2-kolonners layout (program ~70 % venstre,
  sidepanel ~30 % høyre). `portrait:` stabler vertikalt (program ~65 % øverst,
  sponsorer/sekundærinfo ~35 % nederst).
- **Wake Lock:** `navigator.wakeLock` bes om automatisk og fornyes når fanen blir
  synlig igjen.
- **Nå / Neste:** utledes fra klokkeslett mot `start_time`/`end_time`.
- **Sponsorkarusell:** roterer hvert `duration_seconds` (per sponsor, default 10 s).
- **Instant Alerts:** ny aktiv `alert` trigger en full-skjerm pop-up (30 s), og
  vises samtidig i «Meldinger»-lista til admin arkiverer den.
