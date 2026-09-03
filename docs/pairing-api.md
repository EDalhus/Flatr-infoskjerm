# Flatr-infoskjerm – parrings-API for TV-klienter

Kontrakt for en dedikert infoskjerm-app (Apple TV / tvOS, Fire TV, nettleser-kiosk).
Implementasjon: [`src/api/pairing.js`](../src/api/pairing.js). Se også
[README → Enhets-parring](../README.md#enhets-parring-tv-klienter).

## Base-URL

| Miljø | URL |
| --- | --- |
| Produksjon | `https://flatr.no` |
| Lokalt | `http://<din-mac-ip>:8788` (`npx wrangler dev`) |

Worker-en `flatr-infoskjerm` er *custom domain* på apex av `flatr.no`.
`workers.dev`-subdomenet er avslått – det finnes ingen `*.workers.dev`-URL.

Alle svar er JSON. `Access-Control-Allow-Origin: *`. Tidsstempler er ISO-8601 UTC.

## Autentisering

| Gruppe | Auth |
| --- | --- |
| TV-endepunkt (`request`, `status`) | ingen |
| Admin-endepunkt (`link`, `reassign`, `rename`, `command`, `unpair`, `GET /api/pairing`) | `Authorization: Bearer <ADMIN_TOKEN>` når secreten er satt i miljøet. Er den ikke satt, er endepunktene åpne. |
| Innhold (`/api/state`, `/api/stream`) | ingen i dag. Send `Authorization: Bearer <auth_token>` likevel for framtidig innstramming (`verifyPairingToken` finnes klar i `pairing.js`). |

---

## Livssyklus

```
        oppstart
           │
           ▼
  POST /api/pairing/request ──▶ { device_id, code_display, pair_url, … }
           │                       lagre device_id permanent (Keychain)
           │                       vis code_display + QR av pair_url
           ▼
  GET /api/pairing/status/:deviceId   (poll hvert poll_interval_seconds)
           │
   ┌───────┼─────────────┬───────────────┬─────────────────┐
 pending  paired       expired          unknown (404)
   │       │             │                 │
 vis kode  begin(state)  vis ny kode:      enhet slettet/opphevet:
 fortsett  hent commands  kall /request     kall /request
 å polle   fortsett å polle
```

Poll videre **også etter `paired`** – det er slik `commands` leveres.
Be aldri om ny kode når du har en lagret `device_id`; poll status i stedet.

---

## TV-endepunkt

### `POST /api/pairing/request`

Kalles én gang ved oppstart hvis `device_id` ikke er lagret.

**Body** (valgfritt, hvitlistet – ukjente nøkler forkastes, strenger kappes til 60 tegn):

| tekstfelt | tallfelt |
| --- | --- |
| `device_name` · `app_version` · `player_version` · `tvos_version` · `os_version` · `model` · `resolution` · `ip` · `hostname` | `uptime_seconds` · `storage_pct` · `memory_pct` · `cpu_temp` · `gpu_temp` |

```json
{ "device_name": "Stue Apple TV", "app_version": "1.0.3", "tvos_version": "18.2",
  "model": "Apple TV 4K", "resolution": "1920x1080", "ip": "192.168.40.123",
  "hostname": "atv-stue", "storage_pct": 51, "memory_pct": 78, "cpu_temp": 42 }
```

`device_name` vises i admin-lista (med mindre en admin har satt et eget kallenavn);
resten fyller telemetri-kortene i enhetens detaljpanel. Feltene **flettes** – en
`status`-poll med bare noen av dem nuller ikke resten.

**201 Created**

```json
{
  "device_id": "0e3f2a10-…-uuid",
  "code": "6FEAWJ",
  "code_display": "6FE-AWJ",
  "expires_at": "2026-09-03T20:27:46.710Z",
  "status_url": "/api/pairing/status/0e3f2a10-…",
  "pair_path": "/admin?view=pairing&code=6FE-AWJ",
  "pair_url": "https://flatr.no/admin?view=pairing&code=6FE-AWJ",
  "poll_interval_seconds": 4
}
```

| Felt | Bruk |
| --- | --- |
| `device_id` | lagre permanent (Keychain). Identifiserer enheten for alltid. |
| `code_display` | vis stort på skjermen |
| `pair_url` | vis som QR ved siden av koden (skanning åpner admin med koden utfylt) |
| `expires_at` | koden er død etter dette (15 min). Da: kall `request` på nytt. |
| `poll_interval_seconds` | vent så mange sekunder mellom status-poll |

**Feil:** `429 { "error": … }` (for mange forespørsler) · `503 { "error": … }` (klarte ikke lage kode – prøv igjen).

### `GET /api/pairing/status/:deviceId`

Poll hvert `poll_interval_seconds`. Legg gjerne ved fersk klient-info som query –
den vises i admin-lista:

```
?device_name=Stue%20Apple%20TV&app_version=1.0.3&tvos_version=18.2&model=Apple%20TV%204K&resolution=1920x1080&ip=192.168.40.123&uptime_seconds=3600&storage_pct=51&memory_pct=78&cpu_temp=42
```

**200 – pending**

```json
{
  "status": "pending",
  "code": "6FEAWJ",
  "code_display": "6FE-AWJ",
  "expires_at": "2026-09-03T20:27:46.710Z",
  "pair_path": "/admin?view=pairing&code=6FE-AWJ",
  "pair_url": "https://flatr.no/admin?view=pairing&code=6FE-AWJ",
  "poll_interval_seconds": 4
}
```

**200 – paired**

```json
{
  "status": "paired",
  "screen_id": 1,
  "auth_token": "rTtZuVlmr5ngqn7JSDUXKbCkRdJQwConEwOzq41RZXU",
  "state_url": "/api/state?screen=1",
  "stream_url": "/api/stream?screen=1",
  "display_url": "/display/1",
  "commands": [
    { "id": 12, "command": "identify", "payload": { "label": "Hovedscene", "seconds": 10 } }
  ],
  "poll_interval_seconds": 30
}
```

| Felt | Bruk |
| --- | --- |
| `auth_token` | lagre. Send som `Authorization: Bearer …` på innholdskall. |
| `state_url` / `stream_url` | relativt til base-URL |
| `display_url` | `/display/<screen_id>` – kan lastes rått i en `WKWebView` (hele Viewer-en) |
| `commands` | kø av fjernkommandoer. **Leveres nøyaktig én gang** – tom `[]` når ingenting venter. |

**200 – expired** → `{ "status": "expired", "poll_interval_seconds": 4 }` – vis ny kode (kall `request`).

**404 – unknown** → `{ "status": "unknown", "poll_interval_seconds": 4 }` – enheten er slettet/opphevet i admin; kall `request` og start parring på nytt.

### Fjernkommandoer

Kommandoer kommer i `commands`-arrayet på et `paired`-svar. Håndter hver `{ id, command, payload }`:

| `command` | forventet handling på TV-en |
| --- | --- |
| `identify` | vis `payload.label` (skjermnavnet) stort på skjermen i `payload.seconds` (10) sekunder |
| `reload` | last innholdet på nytt (køes automatisk etter «bytt skjerm» i admin) |
| `clear_cache` | tøm lokal cache og last på nytt |
| `reboot` | start appen / enheten på nytt |

`id` er kun til egen deduplisering; ingen ack-kall er nødvendig (serveren markerer som levert ved utsending).

---

## Innhold

### `GET /api/state?screen=<id>`

Full tilstand for skjermen. Støtter betinget henting.

**Request-headere**

```
If-None-Match: <forrige ETag>        ← anbefalt
Authorization: Bearer <auth_token>   ← send den, ignoreres i dag
```

**200 OK** – full tilstand + `ETag: W/"…"` og `Cache-Control: no-cache`.
Topp-nøkler: `screen, deck, categories, schedule, sponsors, alerts, serverTime, version`.

**304 Not Modified** – tom kropp. Behold forrige `200`-svar. Cache siste gyldige
svar lokalt, så skjermen kan vise innhold videre når nettet faller.

> En `heartbeat` endrer ikke `ETag` – bare reelt innhold gjør det.

### `GET /api/stream?screen=<id>`

Server-Sent Events.

| Event | Data |
| --- | --- |
| `snapshot` | full tilstand, sendt ved tilkobling |
| `update` | full tilstand, sendt når innhold endres |
| `error` | `{ "message": "…" }` |

Kommentar-linjer (`: keep-alive …`) som holder forbindelsen i live. Serveren
sender `retry: 5000` og lukker etter ~10 min – `EventSource` kobler til igjen selv.

---

## Admin-endepunkt

Krever `Authorization: Bearer <ADMIN_TOKEN>` når secreten er satt.

### `POST /api/pairing/link`

```json
{ "pairing_code": "6FE-AWJ", "screen_id": 1 }
```

`pairing_code` godtar både `"6FE-AWJ"` og `"6feawj"`.

| Status | Kropp |
| --- | --- |
| `200` | `{ "ok": true, "screen_id": 1, "screen_name": "Hovedscene", "device_id": "…" }` |
| `200` (idempotent) | `{ "ok": true, "already": true, "screen_id": 1, "screen_name": "Hovedscene" }` |
| `400` | `{ "error": "pairing_code er påkrevd" }` / `"screen_id er påkrevd"` |
| `404` | `{ "error": "…", "reason": "not_found" }` – ukjent kode |
| `410` | `{ "error": "…", "reason": "expired" }` – utløpt kode |
| `409` | `{ "error": "…", "reason": "already_paired" }` – koden er brukt på en annen skjerm (bruk `reassign`) |

### `POST /api/pairing/reassign`

Flytt en paret enhet til en annen skjerm uten å røre TV-en. Køer automatisk en `reload`.

```json
{ "device_id": "…", "screen_id": 2 }
```

`200 { "ok": true, "screen_id": 2, "screen_name": "Inngangsparti" }` ·
`404` hvis enheten ikke er paret · `404` hvis skjermen ikke finnes.

### `POST /api/pairing/rename`

Sett eller fjern et kallenavn (`label`) på en enhet. Tom streng fjerner det.
Kallenavnet overstyrer `device_name` i admin-visningen.

```json
{ "device_id": "…", "label": "Inngang venstre" }
```

`200 { "ok": true, "label": "Inngang venstre" }` · `400` uten `device_id` ·
`404` hvis enheten ikke finnes.

### `POST /api/pairing/command`

```json
{ "device_id": "…", "command": "identify" }
```

Eller mot alle enheter på en skjerm: `{ "screen_id": 1, "command": "reload" }`.
`command` ∈ `identify | reload | clear_cache | reboot`.
For `identify` uten `payload` settes `payload` automatisk til `{ "label": <skjermnavn>, "seconds": 10 }`.

`200 { "ok": true, "command": "identify", "queued": 1 }` ·
`400` ugyldig kommando · `404` ingen paret enhet å sende til.

### `POST /api/pairing/unpair`

```json
{ "device_id": "…" }
```

Eller `{ "screen_id": 1 }` for å fjerne alle enheter på en skjerm. `204 No Content`.
Enheten får `unknown` ved neste poll og starter parring på nytt.

### `GET /api/pairing`

Liste over alle enheter (nyeste + ventende først), maks 100.

```json
[
  {
    "id": 4,
    "code": "6FEAWJ",
    "device_id": "…",
    "status": "paired",
    "label": "Inngang venstre",
    "screen_id": 2,
    "screen_name": "Inngangsparti",
    "created_at": "2026-09-03T20:12:46.711Z",
    "expires_at": "2026-09-03T20:27:46.710Z",
    "paired_at": "2026-09-03T20:12:46.853Z",
    "last_seen": "2026-09-03T20:14:02.934Z",
    "client_info": {
      "device_name": "Stue Apple TV", "app_version": "1.0.4", "tvos_version": "18.2",
      "model": "Apple TV 4K", "resolution": "1920x1080", "ip": "192.168.40.123",
      "hostname": "atv-stue", "uptime_seconds": 3600,
      "storage_pct": 51, "memory_pct": 78, "cpu_temp": 42, "gpu_temp": 40
    },
    "online": true
  }
]
```

`status` er utledet (`pending` blir `expired` når `expires_at` er passert).
`online` = `last_seen` under 90 sekunder gammel.

### `GET /api/screens`

Skjermvelger for admin. Array med `id, name, location, orientation, …`.

---

## Klientskisse (Swift, forkortet)

```swift
struct Pairing: Decodable { let device_id, code_display, pair_url: String; let poll_interval_seconds: Int }
struct Command: Decodable { let id: Int; let command: String }
struct Status: Decodable {
    let status: String
    let screen_id: Int?; let auth_token, state_url, stream_url: String?
    let commands: [Command]?; let poll_interval_seconds: Int
}

let base = URL(string: "https://flatr.no")!
let client = "app_version=1.0.3&tvos_version=18.2&model=Apple%20TV%204K&resolution=1920x1080"

func requestCode() async throws -> Pairing {
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

// Kjør kontinuerlig – også etter paring (henter kommandoer).
while true {
    let deviceId = Keychain.string("device_id") ?? (try await requestCode()).device_id
    let s = try await status(deviceId)
    switch s.status {
    case "paired":
        Keychain.set(s.auth_token!, "auth_token")
        begin(screen: s)                                       // hent s.state_url, lytt på s.stream_url
        for c in s.commands ?? [] { handle(c) }
    case "expired", "unknown":
        Keychain.delete("device_id")                           // tving ny kode neste runde
    default: break                                             // pending – fortsett å vise koden
    }
    try await Task.sleep(for: .seconds(s.poll_interval_seconds))
}

// Innhold: betinget henting + siste gyldige som fallback.
func fetchState(_ path: String) async throws -> Data {
    var req = URLRequest(url: base.appending(path: path))
    req.setValue("Bearer \(Keychain.string("auth_token")!)", forHTTPHeaderField: "Authorization")
    if let tag = Cache.etag { req.setValue(tag, forHTTPHeaderField: "If-None-Match") }
    do {
        let (data, resp) = try await URLSession.shared.data(for: req)
        let http = resp as! HTTPURLResponse
        if http.statusCode == 304 { return Cache.body }
        Cache.etag = http.value(forHTTPHeaderField: "ETag"); Cache.body = data
        return data
    } catch { return Cache.body }                              // nett nede – vis siste gyldige
}
```

Enkleste variant: etter `paired` last `display_url` (`/display/<screen_id>`) i en
`WKWebView` – da gjenbrukes hele Viewer-en. `identify` / `reload` kan da gjøres som
JS-injeksjon i webviewen.
