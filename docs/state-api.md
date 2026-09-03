# `GET /api/state` – tilstand for én skjerm

Alt en viewer trenger for å tegne en skjerm. Bygges av `buildState()` i
[`src/api/_shared.js`](../src/api/_shared.js). Samme kropp sendes som `snapshot`/
`update` på `GET /api/stream?screen=<id>` (SSE).

```
GET https://flatr.no/api/state?screen=5
If-None-Match: W/"…"            (valgfritt – gir 304 uten kropp når uendret)
```

Svaret får `ETag: W/"<version>"` og `Cache-Control: no-cache`. `304` = behold
forrige kropp. **Ukjent `screen` gir `200` med `screen: null` og tom `deck`** –
ikke `404`.

---

## Topp-nivå

```jsonc
{
  "screen":     { … } | null,   // raden fra screens, alle kolonner
  "deck":       [ … ],          // lysbilder, allerede sortert på position ASC
  "categories": [ … ],          // alle kategorier (program-widgeten slår opp her)
  "schedule":   [ … ],          // HELE programmet + utledet effective_status
  "sponsors":   [ … ],          // alle sponsorer (sponsors-widgeten slår opp her)
  "alerts":     [ … ],          // aktive hastemeldinger for denne skjermen
  "serverTime": "2026-09-03T19:12:00.000Z",  // ISO, settes ved hvert svar
  "version":    "1770423991"                 // opak endrings-signatur (== ETag-verdien)
}
```

`serverTime` og `version` endrer seg hvert svar / ved endring – ikke del av
innholdskontrakten. Alt annet er stabilt.

---

## `screen`

```json
{
  "id": 5,
  "name": "Skjerm 1",
  "location": "Inngang",
  "orientation": "portrait",          // "portrait" | "landscape"
  "layout": "main-side",              // historisk, ubrukt
  "custom_layout": null,              // historisk, ubrukt
  "rotation_seconds": 15,             // historisk fallback, ubrukt av deck-modellen
  "last_seen": "2026-08-31T18:03:57.807Z",
  "created_at": "2026-08-31T15:29:37.637Z"
}
```

Bare **`orientation`** betyr noe for en viewer. Den gir lerret-størrelsen som all
posisjonering er relativ til:

| `orientation` | lerret (px) |
| --- | --- |
| `landscape` | 1920 × 1080 |
| `portrait` | 1080 × 1920 |

---

## `deck` – lysbilder

Array, allerede sortert (`position` stigende). Serveren returnerer bare
`enabled = 1`. **Tidsstyring (`active_*`) filtreres IKKE av serveren** – vil du
respektere den, gjør det klientside (se [dayparting](#dayparting)); ellers vis
alle.

```jsonc
{
  "id": 2,
  "screen_id": 5,
  "position": 0,
  "name": "Velkommen",              // editor-etikett, vises ikke
  "duration_seconds": 2,            // hvor lenge lysbildet vises (viewer bør ha min. 2)
  "transition": "dissolve",         // overgang INN til dette lysbildet
  "transition_ms": 1500,            // varighet på overgangen
  "background": { … },              // se under – alltid et objekt (aldri null/streng)
  "enabled": 1,                     // alltid 1 i svaret
  "active_from": null,              // "HH:MM"  – dagvindu start (lokal tid)
  "active_to": null,                // "HH:MM"  – dagvindu slutt
  "active_days": null,              // "1,2,5"  – ISO ukedager, 1=man … 7=søn, CSV
  "active_from_date": null,         // "YYYY-MM-DD"
  "active_to_date": null,           // "YYYY-MM-DD"
  "created_at": "2026-08-31T15:29:37.688Z",
  "elements": [ … ]                 // se under – sortert på z stigende
}
```

`transition`: `none` · `fade` · `dissolve` (kryss-ton) · `push-left` · `push-up`.

### `background`

Alltid ett av (feiler parsing → `{ "type": "color", "color": "#0f2733" }`):

```jsonc
{ "type": "color", "color": "#0f2733" }
{ "type": "gradient", "from": "#1f5566", "to": "#0f2733", "angle": 135 }
{ "type": "dynamic", "preset": "aurora|gradient|waves|mesh",
  "base": "#0a0f1e", "colors": ["#22d3ee", "#a855f7"], "angle": 130, "speed": 2.5 }
{ "type": "image", "url": "…", "fit": "cover|contain", "color": "#0f2733" }
```

`dynamic` er en animert CSS-bakgrunn. Enkleste korrekte fallback på en TV:
fyll med `base` (evt. `colors[0]`) – det er nøyaktig hva web-viewer-en gjør når
den ikke animerer.

### `elements` – widgets

```jsonc
{
  "id": 9,
  "slide_id": 2,
  "z": 1,                 // stablingsrekkefølge, stigende
  "kind": "image",        // ALLTID satt – ikke gjett fra filendelse
  "x": 14, "y": 38,       // posisjon i PROSENT av lerretet (0–100), origo øverst venstre
  "w": 72, "h": 24,       // størrelse i prosent
  "rotation": 0,          // grader
  "config": { … },        // kind-spesifikk, ALLTID et objekt (aldri null/streng)
  "created_at": "2026-08-31T16:06:55.602Z"
}
```

`config` per `kind` (manglende nøkler → bruk default):

| `kind` | `config`-felter (default) |
| --- | --- |
| `text` | `text` `""` · `font` `""` (CSS font-family; tom = Inter) · `size` `64` (px målt på lerretet over) · `weight` `700` (300–900) · `align` `left\|center\|right` · `valign` `top\|middle\|bottom` · `color` `"#ffffff"` · `fill` `null` eller `{ type:"gradient", from, to, angle }` (overstyrer `color`) · `lineHeight` `1.1` · `tracking` `0` · `italic` `false` · `underline` `false` · `strike` `false` · `shadow` `false`. `text` kan inneholde `\n`. |
| `image` | `url` `""` · `fit` `"contain"` (\|`cover`) · `radius` `0` (px). `url` kan være **relativ** (`/api/media?id=1&raw=1`) – legg på base-URL – eller absolutt. |
| `shape` | `shape` `"rect"` (\|`ellipse`) · `fill` `"#1f5566"` · `radius` `16` (px) · `opacity` `100` (0–100) |
| `clock` | `showDate` `true` · `showSeconds` `true` · `frame` `false`. Tegnes klientside fra enhetens klokke. |
| `countdown` | `mode` `"nextItem"` (\|`"target"`) · `target` `""` (ISO datetime når `mode:"target"`) · `title` `""` · `doneText` `"Nå kjører vi!"` · `emphasis` `"info"` (\|`"none"`). `nextItem` teller ned til `start_time` på neste kommende `schedule`-post. |
| `program` | `mode` `"agenda"` (\|`"nowNext"`) · `categoryIds` `[]` (int – filtrer `schedule` på `category_id`) · `max` `8` · `stage` `""` (filtrer på `schedule.stage`) · `showCategory` `true` · `frame` `false`. Tegnes fra `schedule` + `categories` i samme svar. |
| `qr` | `mode` `"schedule"` (\|`"url"`) · `url` `""` (når `mode:"url"`) · `label` `""` · `caption` `""` · `frame` `false`. `mode:"schedule"` → kod `"<base>/s/<screen_id>"`. |
| `video` | `url` `""` · `loop` `false` · `mute` `true` · `fit` `"contain"` (\|`cover`) |
| `web` | `url` `""` · `refreshMinutes` `0` (0 = aldri). Ekstern side i iframe/webview. |
| `sponsors` | `{}` – ingen config. Tegn en roterende karusell fra `sponsors`-arrayet (kun bilde, ingen ramme/tekst). |

---

## `categories`

```json
[ { "id": 1, "name": "Esport", "color": "#b91c1c", "created_at": "2026-08-31T14:44:27.137Z" } ]
```

## `schedule`

Hele programmet, sortert på `start_time`. `effective_status` er utledet server­side
(når `auto_status = 1`): `scheduled` før start, `live` mellom start og slutt,
`done` etter slutt (`end_time`, ellers start + 1 t). `cancelled` vinner alltid.

```jsonc
{
  "id": 1,
  "title": "Åpning og velkommen",
  "description": "Konferansier ønsker velkommen.",
  "start_time": "2026-08-30T20:29:58.535Z",
  "end_time": "2026-08-30T20:59:58.535Z",   // kan være null
  "stage": "Hovedscene",                     // kan være null
  "status": "live",                          // rå lagret verdi
  "auto_status": 1,
  "category_id": null,                       // → slå opp i categories
  "effective_status": "done"                 // BRUK DENNE
}
```

## `sponsors`

```json
[
  { "id": 1, "name": "Cloudflare",  "image_url": "https://…/Cloudflare",  "duration_seconds": 10 },
  { "id": 2, "name": "Acme AS",     "image_url": "https://…/Acme+AS",     "duration_seconds": 8 },
  { "id": 3, "name": "Nordlys Bank","image_url": "https://…/Nordlys+Bank","duration_seconds": 12 }
]
```

`image_url` kan være relativ (`/api/media?id=…&raw=1`) eller absolutt.

## `alerts`

```jsonc
[ { "id": 7, "message": "Brannøvelse kl. 14", "target_screen_id": null, "active": 1,
    "created_at": "…" } ]
```

`target_screen_id: null` = alle skjermer. Vis som overlay over lysbildet.

---

## Dayparting

Hvis du vil respektere planlegging på lysbilder: skjul et lysbilde når `now`
faller utenfor. Logikken (fra [`src/lib/daypart.js`](../src/lib/daypart.js)):

1. `active_from_date` / `active_to_date` satt → `now`-dato må være innenfor (inklusiv).
2. `active_days` satt → ISO-ukedag (`1`=man … `7`=søn) må være i CSV-lista.
3. `active_from` / `active_to` satt → klokkeslett må være innenfor. Er `from > to`
   krysser vinduet midnatt (f.eks. `22:00`–`06:00`).

Alle `null` = alltid på.

---

## Faktisk svar — `GET /api/state?screen=5`

Ekte data fra prod (2026-09-03). `serverTime`/`version` er runtime-verdier.

```json
{
  "screen": {
    "id": 5,
    "name": "Skjerm 1",
    "location": "Inngang",
    "orientation": "portrait",
    "layout": "main-side",
    "custom_layout": null,
    "rotation_seconds": 15,
    "last_seen": "2026-08-31T18:03:57.807Z",
    "created_at": "2026-08-31T15:29:37.637Z"
  },
  "deck": [
    {
      "id": 2,
      "screen_id": 5,
      "position": 0,
      "name": "Velkommen",
      "duration_seconds": 2,
      "transition": "dissolve",
      "transition_ms": 1500,
      "background": { "type": "dynamic", "preset": "mesh", "base": "#0a0f1e", "colors": ["#22d3ee", "#a855f7", "#f43f5e", "#34d399"], "speed": 2.5 },
      "enabled": 1,
      "active_from": null, "active_to": null, "active_days": null,
      "active_from_date": null, "active_to_date": null,
      "created_at": "2026-08-31T15:29:37.688Z",
      "elements": [
        {
          "id": 8, "slide_id": 2, "z": 0, "kind": "text",
          "x": 20, "y": 26.5, "w": 60, "h": 14, "rotation": 0,
          "config": { "text": "Velkommen til", "font": "", "size": 88, "weight": 700, "align": "center", "valign": "middle", "color": "#ffffff", "fill": null, "lineHeight": 1.1, "tracking": 0, "italic": false, "underline": false, "strike": false, "shadow": false },
          "created_at": "2026-08-31T16:06:40.168Z"
        },
        {
          "id": 9, "slide_id": 2, "z": 1, "kind": "image",
          "x": 14, "y": 38, "w": 72, "h": 24, "rotation": 0,
          "config": { "url": "/api/media?id=1&raw=1", "fit": "contain", "radius": 0 },
          "created_at": "2026-08-31T16:06:55.602Z"
        },
        {
          "id": 10, "slide_id": 2, "z": 2, "kind": "sponsors",
          "x": 73, "y": 67, "w": 25, "h": 30, "rotation": 0,
          "config": {},
          "created_at": "2026-08-31T16:11:21.635Z"
        },
        {
          "id": 12, "slide_id": 2, "z": 3, "kind": "text",
          "x": 2, "y": 73, "w": 60, "h": 24, "rotation": 0,
          "config": { "text": "Trådløst nettverk:\nSSID: SDOK\nPassord: SunnmoreData", "font": "", "size": 48, "weight": 700, "align": "left", "valign": "bottom", "color": "#ffffff", "fill": null, "lineHeight": 1.1, "tracking": 0, "italic": false, "underline": false, "strike": false, "shadow": false },
          "created_at": "2026-08-31T16:25:03.796Z"
        }
      ]
    },
    {
      "id": 6,
      "screen_id": 5,
      "position": 1,
      "name": "Vann",
      "duration_seconds": 2,
      "transition": "none",
      "transition_ms": 1500,
      "background": { "type": "dynamic", "preset": "mesh", "base": "#0a0f1e", "colors": ["#22d3ee", "#a855f7", "#f43f5e", "#34d399"], "speed": 2.5 },
      "enabled": 1,
      "active_from": null, "active_to": null, "active_days": null,
      "active_from_date": null, "active_to_date": null,
      "created_at": "2026-08-31T16:29:31.459Z",
      "elements": [
        {
          "id": 13, "slide_id": 6, "z": 0, "kind": "text",
          "x": 20, "y": 43, "w": 60, "h": 14, "rotation": 0,
          "config": { "text": "Husk å få i deg nok vann!", "font": "", "size": 88, "weight": 700, "align": "center", "valign": "middle", "color": "#ffffff", "fill": null, "lineHeight": 1.1, "tracking": 0, "italic": false, "underline": false, "strike": false, "shadow": false },
          "created_at": "2026-08-31T16:29:31.528Z"
        },
        {
          "id": 15, "slide_id": 6, "z": 2, "kind": "sponsors",
          "x": 73, "y": 67, "w": 25, "h": 30, "rotation": 0,
          "config": {},
          "created_at": "2026-08-31T16:29:31.528Z"
        },
        {
          "id": 16, "slide_id": 6, "z": 3, "kind": "text",
          "x": 2, "y": 76.5, "w": 59, "h": 20.5, "rotation": 0,
          "config": { "text": "Trådløst nettverk:\nSSID: SDOK\nPassord: SunnmoreData", "font": "", "size": 48, "weight": 700, "align": "left", "valign": "bottom", "color": "#ffffff", "fill": null, "lineHeight": 1.1, "tracking": 0, "italic": false, "underline": false, "strike": false, "shadow": false },
          "created_at": "2026-08-31T16:29:31.528Z"
        }
      ]
    },
    {
      "id": 8,
      "screen_id": 5,
      "position": 2,
      "name": "Discord",
      "duration_seconds": 5,
      "transition": "none",
      "transition_ms": 1500,
      "background": { "type": "dynamic", "preset": "mesh", "base": "#0a0f1e", "colors": ["#22d3ee", "#a855f7", "#f43f5e", "#34d399"], "speed": 2.5 },
      "enabled": 1,
      "active_from": null, "active_to": null, "active_days": null,
      "active_from_date": null, "active_to_date": null,
      "created_at": "2026-08-31T16:34:10.753Z",
      "elements": [
        {
          "id": 21, "slide_id": 8, "z": 0, "kind": "text",
          "x": 20, "y": 45.5, "w": 60, "h": 24, "rotation": 0,
          "config": { "text": "Vi er på discord!\nwww.sdok.no/discord", "font": "", "size": 98, "weight": 700, "align": "center", "valign": "middle", "color": "#ffffff", "fill": null, "lineHeight": 1.1, "tracking": 0, "italic": false, "underline": false, "strike": false, "shadow": false },
          "created_at": "2026-08-31T16:34:10.820Z"
        },
        {
          "id": 22, "slide_id": 8, "z": 2, "kind": "sponsors",
          "x": 73, "y": 67, "w": 25, "h": 30, "rotation": 0,
          "config": {},
          "created_at": "2026-08-31T16:34:10.820Z"
        },
        {
          "id": 24, "slide_id": 8, "z": 3, "kind": "image",
          "x": 15.5, "y": 4, "w": 69, "h": 44, "rotation": 0,
          "config": { "url": "/api/media?id=2&raw=1", "fit": "contain", "radius": 0 },
          "created_at": "2026-08-31T16:35:15.512Z"
        },
        {
          "id": 23, "slide_id": 8, "z": 4, "kind": "text",
          "x": 2, "y": 75.5, "w": 61, "h": 21.5, "rotation": 0,
          "config": { "text": "Trådløst nettverk:\nSSID: SDOK\nPassord: SunnmoreData", "font": "", "size": 48, "weight": 700, "align": "left", "valign": "bottom", "color": "#ffffff", "fill": null, "lineHeight": 1.1, "tracking": 0, "italic": false, "underline": false, "strike": false, "shadow": false },
          "created_at": "2026-08-31T16:34:10.820Z"
        }
      ]
    }
  ],
  "categories": [
    { "id": 1, "name": "Esport", "color": "#b91c1c", "created_at": "2026-08-31T14:44:27.137Z" }
  ],
  "schedule": [
    { "id": 1, "title": "Åpning og velkommen", "description": "Konferansier ønsker velkommen.", "start_time": "2026-08-30T20:29:58.535Z", "end_time": "2026-08-30T20:59:58.535Z", "stage": "Hovedscene", "status": "live", "auto_status": 1, "category_id": null, "effective_status": "done" },
    { "id": 2, "title": "Keynote: Fremtidens edge", "description": "Hovedforedrag om distribuert databehandling.", "start_time": "2026-08-30T20:59:58.535Z", "end_time": "2026-08-30T21:59:58.535Z", "stage": "Hovedscene", "status": "scheduled", "auto_status": 1, "category_id": null, "effective_status": "done" },
    { "id": 4, "title": "Paneldebatt", "description": "Bransjen møtes til debatt.", "start_time": "2026-08-30T22:29:58.535Z", "end_time": "2026-08-30T23:29:58.535Z", "stage": "Hovedscene", "status": "scheduled", "auto_status": 1, "category_id": null, "effective_status": "done" },
    { "id": 5, "title": "Påmelding til konkurranser", "description": null, "start_time": "2026-08-31T14:45:00.000Z", "end_time": "2026-10-02T14:45:00.000Z", "stage": "Hovedscene", "status": "scheduled", "auto_status": 1, "category_id": 1, "effective_status": "live" }
  ],
  "sponsors": [
    { "id": 1, "name": "Cloudflare", "image_url": "https://dummyimage.com/800x400/1d4ed8/ffffff&text=Cloudflare", "duration_seconds": 10 },
    { "id": 2, "name": "Acme AS", "image_url": "https://dummyimage.com/800x400/0f766e/ffffff&text=Acme+AS", "duration_seconds": 8 },
    { "id": 3, "name": "Nordlys Bank", "image_url": "https://dummyimage.com/800x400/9333ea/ffffff&text=Nordlys+Bank", "duration_seconds": 12 }
  ],
  "alerts": [],
  "serverTime": "2026-09-03T19:12:00.000Z",
  "version": "1770423991"
}
```

> Merk: nåværende prod-skjerm har `id = 5` (ikke `1`). `GET /api/state?screen=1`
> gir `{ "screen": null, "deck": [], … }`. TV-en får riktig `screen_id` fra
> `/api/pairing/status`.

---

## DeckMapper – huskeliste

- Toppnøkkel er **`deck`** (ikke `slides`/`items`); hvert lysbilde har **`elements`**.
- **`kind` er alltid satt** på hvert element – ikke utled fra filendelse.
- **`x/y/w/h` er prosent (0–100)** av lerretet, ikke piksler. Lerret = 1080×1920
  (portrait) / 1920×1080 (landscape) fra `screen.orientation`.
- **`config` er alltid et objekt** (server tvinger `{}` ved feil). Slå sammen med
  defaultene i tabellen over.
- **`background` er alltid et objekt** med `type` ∈ `color|gradient|dynamic|image`.
- Medie-URL-er (`config.url`, `sponsors[].image_url`) kan være **relative** –
  prefiks med base-URL-en.
- `program` / `qr` / `countdown` / `sponsors` henter data fra
  `schedule` / `categories` / `sponsors` i **samme** svar – ingen ekstra kall.
- Bruk `schedule[].effective_status`, ikke `status`.
- `duration_seconds` ligger på lysbildet; overgang (`transition`, `transition_ms`)
  gjelder overgangen INN til lysbildet.
- Serveren filtrerer ikke på `active_*` – gjør [dayparting](#dayparting) selv om
  du trenger planlagte lysbilder.
