# Infoskjerm for arrangementer

En infoskjerm-webapp for events, kjørt som en **Cloudflare Worker med statiske
assets** og **D1**. To deler:

| Del | Rute | Beskrivelse |
| --- | --- | --- |
| **Viewer** | `/display/:screenId` | Publikumsvisning. Spiller av skjermens lysbilder på rekke med overganger, 16:9 / 9:16, skalert design-lerret, sanntid via SSE, wake lock, hastemeldinger som overlay. |
| **Admin** | `/admin` | Skjermer (Keynote-aktig editor), live alerts, program, kategorier, sponsorer, mediebibliotek, maler, nylig slettet. |
| **Program** | `/s/:screenId` | Offentlig, mobilvennlig programside for publikum (QR fra skjermen). Nå/neste, dag for dag, kategorifarger, `.ics`-eksport, oppdateres selv. |

## Skjermer og lysbilder

Hver **skjerm** har orientering (16:9 eller 9:16) og en rekke **lysbilder**
(`deck_slides`). Et lysbilde er én fri canvas med posisjonerte **widgets**
(`deck_elements`, x/y/b/h i prosent). Skjermen spiller lysbildene i rekkefølge –
hvert i sitt `duration_seconds`, med valgt **overgang** (ingen / ton inn /
kryss-ton / skyv).

**Editoren** (admin → Skjermer → Rediger) er Keynote-aktig: lysbilde-navigator
til venstre (legg til / dupliser / slett / dra for å omrokere), canvas i midten
(klikk for å velge, dra for å flytte, håndtak for å endre størrelse, piltaster
nudger, Delete sletter), inspektør til høyre (widget- eller lysbilde-egenskaper).

**Widgets:** `text`, `image`, `shape`, `clock`, `countdown` (til tidspunkt eller
neste programpost), `program` (filtrert på kategori / visning / maks / scene),
`qr` (egen lenke eller skjermens programside), `video` (MP4/WebM eller
YouTube/Vimeo), `web` (embed nettside), `sponsors`.

**Bakgrunn** pr. lysbilde: ensfarget, gradient, bilde eller **dynamisk**
(animert – aurora / gradient / bølger / mesh, med egne farger og fart; ren
CSS/SVG, lett på CPU).

**Tidsstyring:** et lysbilde kan settes til å vises bare i et klokkeslett-vindu,
på visse ukedager og/eller i et datointervall («Vises når»). Filtreres i Viewer
mot skjermens lokale klokke.

**Kategorier** (admin → Kategorier) gir navn + farge, vist som merke i
program-widgeten og på den offentlige programsiden.

**Mediebibliotek** (admin → Bibliotek) lagrer opplastede bilder i R2. Bilde-widgets,
sponsorlogoer og lysbilde-bakgrunn kan velge fra biblioteket. Krever en R2-bucket.

**Maler** (admin → Maler): «Lagre som mal» på et lysbilde; malen dukker opp når
du legger til et nytt lysbilde.

**Auto-status:** programposter med `auto_status = 1` flipper `planlagt → pågår →
ferdig` automatisk etter klokka. `avlyst` overstyrer alltid.

**Skjermstatus:** Viewer sender heartbeat, admin viser grønn/grå prikk (online
hvis sett innen 90 s). «Dupliser» kopierer en skjerm inkl. alle lysbilder.

**Nylig slettet:** sletting legger elementet i en papirkurv i 30 dager
(admin → Nylig slettet). Skjermer og lysbilder gjenopprettes med innholdet.

Alle endringer pushes til skjermene i sanntid (SSE).

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
npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0005_canvas_decks.sql
npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0006_pairing.sql
npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0007_pairing_commands.sql
```

`0005` bytter til canvas-modellen (`deck_slides` + `deck_elements`, `orientation`
på skjerm). Sone-tabellene (`screen_slides` / `playlists`) blir liggende urørt,
men brukes ikke lenger – eksisterende skjermer beholder navn, men lysbildene må
bygges på nytt i den nye editoren.

`0006`/`0007` legger til enhets-parring (Apple TV m.fl.): tabellen `pairings`,
kolonnen `client_info` og tabellen `pairing_commands` – se
[Enhets-parring](#enhets-parring-tv-klienter). `0002` legger til kategorier, per-skjerm layout/soner/slides, skjermstatus og
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
| `/api/deck` | `GET` | Lysbilder med elementer for én skjerm (`?screen=`). |
| `/api/deck-slides` | `GET POST PUT DELETE` | Lysbilder. `POST {duplicate_of}` kloner, `{template_id}` fra mal. |
| `/api/deck-elements` | `GET POST PUT DELETE` | Widgets på et lysbilde. |
| `/api/media` | `GET POST DELETE` | Mediebibliotek. `POST` = rå fil-bytes (`?name=&type=`), `GET ?id=&raw=1` serverer fila. |
| `/api/templates` | `GET POST DELETE` | Maler (`?kind=slide\|screen`). |
| `/api/trash` | `GET POST DELETE` | Papirkurv. `POST ?id=` gjenoppretter, `DELETE ?id=` / `?all=1` sletter permanent. |
| `/api/health` | `GET` | `{ ok, db, media, time }`. |
| `/api/categories` | `GET POST PUT DELETE` | Kategorier (navn + farge). |
| `/api/schedule` | `GET POST PUT DELETE` | Program (+ `category_id`, `auto_status`, utledet `effective_status`). |
| `/api/sponsors` | `GET POST PUT DELETE` | Sponsorer. |
| `/api/alerts` | `GET POST DELETE` | Hastemeldinger (`?id=` / `?all=1` arkiverer). |
| `/api/heartbeat` | `POST` | `?screen=` – Viewer melder at den er i live. |
| `/api/state` | `GET` | Samlet tilstand for én skjerm (`?screen=`). Svarer med `ETag`; `If-None-Match` gir `304`. |
| `/api/stream` | `GET` | SSE: `snapshot` ved tilkobling, `update` ved endring. |
| `/api/pairing/request` | `POST` | TV-klient ber om en kode. Åpent. Valgfri body `{ app_version, tvos_version, model, resolution }`. Gir `{ device_id, code, code_display, expires_at, pair_url, poll_interval_seconds }`. |
| `/api/pairing/status/:deviceId` | `GET` | TV-klient poller. Åpent. Valgfri query `?app_version=&tvos_version=&model=&resolution=&uptime_seconds=`. `pending` (+ `pair_url`) / `paired` (+ `auth_token`, `state_url`, `stream_url`, `commands[]`) / `expired` / `unknown`. |
| `/api/pairing/link` | `POST` | Admin kobler `{ pairing_code, screen_id }` til en skjerm. Krever token. |
| `/api/pairing/reassign` | `POST` | Admin flytter en paret enhet: `{ device_id, screen_id }`. Krever token. |
| `/api/pairing/command` | `POST` | Admin køer en fjernkommando: `{ device_id\|screen_id, command }` (`identify\|reload\|clear_cache\|reboot`). Krever token. |
| `/api/pairing` | `GET` | Admin: liste over enheter (+ `online`, `client_info`). Krever token. |
| `/api/pairing/unpair` | `POST` | Admin fjerner en paring (`{ device_id }` eller `{ screen_id }`). Krever token. |

### Sanntid

`stream.js` poller D1 hvert `SSE_POLL_MS` (default 3000 ms) og sender `update`
når en innholds-signatur endres. Tilkoblingen lever ~10 min; `EventSource`
kobler til igjen selv. For større skala: bytt polling mot Durable Objects/Queues
uten å endre klienten.

---

## Enhets-parring (TV-klienter)

En dedikert infoskjerm-app (Apple TV / tvOS, Fire TV, nettleser-kiosk …) knyttes
til en skjerm uten å taste inn URL-er eller tokens. Backend: `src/api/pairing.js`
+ tabellene `pairings` og `pairing_commands` (migrering `0006`/`0007`). Admin-UI:
**Visning → Parring**.

**Flyt**

1. **TV-en starter** → `POST /api/pairing/request` (legg gjerne ved
   `{ app_version, tvos_version, model, resolution }`). Backend lager en opak
   `device_id` (UUID) + en kort, lettlest kode (6 tegn, uten `I/O/0/1`), lagrer en
   `pending`-rad som utløper om 15 min. TV-en lagrer `device_id` permanent og viser
   `code_display` (`"ABC-DEF"`) stort – **og `pair_url` som QR ved siden av**
   (`…/admin?view=pairing&code=ABC-DEF`; skanning åpner admin med koden utfylt).
2. **TV-en poller** `GET /api/pairing/status/<device_id>` hvert `poll_interval_seconds`
   (4 s) så lenge koden vises. Legg ved fersk klient-info som query
   (`?app_version=…&uptime_seconds=…`) – den vises i admin-lista.
3. **Admin** åpner Parring-fanen, taster/skanner koden, velger skjerm og lagrer
   → `POST /api/pairing/link { pairing_code, screen_id }` (krever `ADMIN_TOKEN`).
   Raden settes til `paired`, får `screen_id` og en tilfeldig `auth_token`.
4. **Neste status-poll** svarer `{ status: "paired", screen_id, auth_token,
   state_url, stream_url, display_url, commands }`. TV-en lagrer `auth_token`,
   senker polle-frekvensen (30 s), og henter innhold fra `state_url` + lytter på
   `stream_url` (SSE) – med `Authorization: Bearer <auth_token>` på hver forespørsel.

**Fjernkommandoer** – admin kan kø kommandoer som TV-en henter i `commands`-feltet
på neste status-poll (leveres nøyaktig én gang):

| kommando | forventet handling på TV-en |
| --- | --- |
| `identify` | vis `payload.label` (skjermnavnet) stort i `payload.seconds` (10) |
| `reload` | last innholdet på nytt (hentes automatisk etter «bytt skjerm») |
| `clear_cache` | tøm lokal cache og last på nytt |
| `reboot` | start appen/enheten på nytt |

**Bytt skjerm uten å røre TV-en** – `POST /api/pairing/reassign { device_id,
screen_id }` oppdaterer `screen_id` og køer en `reload`. TV-en plukker opp ny
skjerm ved neste poll.

**Feilhåndtering** – `link` gir tydelige koder: `404` ukjent kode, `410` utløpt
(`reason: "expired"`), `409` koden er alt brukt på en annen skjerm
(`reason: "already_paired"` – bruk `reassign`; samme skjerm er idempotent).
`status` gir `expired` når 15-minuttersvinduet er passert og `unknown` (404) hvis
enheten er slettet / opphevet – da starter TV-en parring på nytt.

**Sikkerhet** – `device_id` er en 128-bits UUID; `status` avslører kun data for en
kjent id. `auth_token` sendes bare til TV-en via `status`, aldri i `link`-svaret.
Klient-info filtreres mot en hvitliste (`app_version`, `tvos_version`, `model`,
`resolution`, `uptime_seconds`). `request` har en enkel innebygd brems
(>60 rader/min → `429`); sett Cloudflare Rate Limiting / WAF foran endepunktet i
produksjon. Gamle `pending`/`expired`-rader og leverte kommandoer ryddes
automatisk.

**Offline-robusthet** – `/api/state` svarer med `ETag` (innholds-signaturen).
TV-en sender siste `ETag` som `If-None-Match`; uendret innhold gir `304` uten
kropp. Cache siste `200`-svar lokalt på enheten, så skjermen kan fortsette å vise
innhold når nettet faller. En `heartbeat` endrer ikke lenger `ETag`/SSE-signaturen.

**Låse ned innholds-endepunktene (valgfritt)** – `/api/state` og `/api/stream` er i
dag åpne (nettleser-forhåndsvisning i admin bruker dem uten token). Vil du kreve
parrings-token for TV-trafikk, bruk `verifyPairingToken(env, request)` fra
`pairing.js` i `state.js` / `stream.js`.

**tvOS-klient (skisse)**

```swift
struct Pairing: Decodable { let device_id, code, code_display, pair_url: String
                            let poll_interval_seconds: Int }
struct Command: Decodable { let id: Int; let command: String; let payload: [String: JSONValue]? }
struct Status: Decodable {
    let status: String
    let screen_id: Int?; let auth_token, state_url, stream_url: String?
    let commands: [Command]?; let poll_interval_seconds: Int
}

let base = URL(string: "https://<ditt-worker-domene>")!
let client = "app_version=1.0.3&tvos_version=18.2&model=Apple%20TV%204K&resolution=1920x1080"

// 1) Oppstart – gjenbruk lagret device_id, ellers be om en ny kode.
func startPairing() async throws -> Pairing {
    var r = URLRequest(url: base.appending(path: "/api/pairing/request"))
    r.httpMethod = "POST"; r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    r.httpBody = try JSONSerialization.data(withJSONObject:
        ["app_version": "1.0.3", "tvos_version": "18.2", "resolution": "1920x1080"])
    let p = try JSONDecoder().decode(Pairing.self, from: try await URLSession.shared.data(for: r).0)
    Keychain.set(p.device_id, "device_id")
    show(code: p.code_display, qr: qrImage(from: p.pair_url))   // CIQRCodeGenerator
    return p
}

func status(_ deviceId: String) async throws -> Status {
    let url = base.appending(path: "/api/pairing/status/\(deviceId)?\(client)&uptime_seconds=\(uptime())")
    return try JSONDecoder().decode(Status.self, from: try await URLSession.shared.data(from: url).0)
}

// 2) Poll-løkke – kjør kontinuerlig, også etter paring (henter kommandoer).
while true {
    let s = try await status(Keychain.string("device_id")!)
    switch s.status {
    case "paired":
        Keychain.set(s.auth_token!, "auth_token")
        begin(screen: s)                                       // hent s.state_url, lytt på s.stream_url
        for c in s.commands ?? [] { handle(c) }                // identify / reload / clear_cache / reboot
    case "expired", "unknown":
        _ = try await startPairing()                           // ny kode
    default: break                                             // pending – fortsett å vise koden
    }
    try await Task.sleep(for: .seconds(s.poll_interval_seconds))
}

// 3) Innhold etter parring – betinget henting + siste gyldige som fallback.
func fetchState(_ path: String) async throws -> Data {
    var req = URLRequest(url: base.appending(path: path))
    req.setValue("Bearer \(Keychain.string("auth_token")!)", forHTTPHeaderField: "Authorization")
    if let tag = Cache.etag { req.setValue(tag, forHTTPHeaderField: "If-None-Match") }
    do {
        let (data, resp) = try await URLSession.shared.data(for: req)
        let http = resp as! HTTPURLResponse
        if http.statusCode == 304 { return Cache.body }        // uendret – behold det vi viser
        Cache.etag = http.value(forHTTPHeaderField: "ETag"); Cache.body = data
        return data
    } catch { return Cache.body }                              // nett nede – vis siste gyldige
}
```

Enkleste variant: etter `paired` kan TV-en bare laste `display_url`
(`/display/<screen_id>`) i en `WKWebView` – da gjenbrukes hele Viewer-en som den
er, og `identify`/`reload` kan implementeres som JS-injeksjon i webviewen.

---

## Prosjektstruktur

```
├── wrangler.jsonc            # Worker: main + assets (ASSETS) + D1 (DB) + R2 (MEDIA)
├── schema.sql                # fullt skjema + demo-data
├── migrations/               # 0001 … 0007 (siste: parrings-kommandoer)
└── src/
    ├── worker.js             # ruter /api/* + ASSETS-fallback
    ├── main.jsx              # ruter: /admin · /display/:id · /s/:id
    ├── api/                   # screens, deck, deckSlides, deckElements, media,
    │                          #   templates, trash, health, categories, schedule,
    │                          #   sponsors, alerts, heartbeat, state, stream,
    │                          #   pairing (TV-parring), _shared
    ├── lib/{api,time,deck,slides,daypart,ics}.js
    ├── hooks/{useNow,useWakeLock,useSSE,useHeartbeat,useFitScale,useListDnd}.js
    ├── viewer/
    │   ├── Viewer.jsx         # skalert design-lerret → <DeckPlayer>
    │   ├── DeckPlayer.jsx     # spiller lysbilder på rekke m/ overgang + tidsstyring
    │   ├── SlideCanvas.jsx    # ett lysbilde: bakgrunn + posisjonerte elementer
    │   ├── ElementView.jsx    # rendrer en widget (text/image/shape + de reelle widget-komponentene)
    │   ├── slides/            # Program/Sponsor/Clock/Web/Video/Qr/Countdown (+ SlideFrame)
    │   └── components/{SponsorCarousel,AlertOverlay}.jsx
    ├── public/Schedule.jsx    # offentlig programside (/s/:id)
    └── admin/
        ├── Admin.jsx          # sidebar-nav i seksjoner (?view=), token
        └── components/
            ├── deck/          # DeckEditor + SlideNavigator + CanvasStage + Inspector + ElementConfigFields
            ├── DaypartFields, MediaPicker
            └── *Manager: Screens / Alerts / Pairing / Schedule / Categories /
                          Sponsors / MediaLibrary / Templates / RecentlyDeleted
```

`buildState` slår sammen lysbilder + elementer til `state.deck`; Viewer rendrer
det rett.

## Viewer-detaljer

- Alt rendres mot et fast 1920×1080 / 1080×1920 lerret og skaleres med
  `transform: scale()` til skjermflaten (`useFitScale`), så det ser likt ut
  overalt – også i editorens forhåndsvisning.
- Elementer plasseres absolutt i prosent av lerretet.
- `navigator.wakeLock` bes om automatisk og fornyes på `visibilitychange`.
- Lysbilder bytter etter `duration_seconds` med valgt overgang; tidsstyrte
  lysbilder utenfor vinduet hoppes over.
- Ny aktiv `alert` gir full-skjerm pop-up (30 s) oppå lysbildet.
