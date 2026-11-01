# Flatr på Google Play (Android TV og Google TV)

Filene:
- `app-release.aab`: lastes opp til Google Play (bygg: `cd android && ./gradlew bundleRelease`)
- `app-release.apk`: til å teste direkte på en TV (ikke til Google Play)
- `icon-512.png`, `feature-graphic-1024x500.png`, `tv-banner-1280x720.png`: bilder til butikken

Opplastingsnøkkelen ligger i `~/Documents/Prosjekter/Flatr-android-nokler/` (ikke i git). Ta vare på
den, f.eks. i passordbehandleren. Med «Play App Signing» kan Google bytte den hvis den blir borte,
men det tar tid.

## 1. Utviklerkonto

Opprett en konto på https://play.google.com/console (engangsavgift). Velg **organisasjon** hvis du
kan: da trengs et D-U-N-S-nummer for firmaet (gratis, men tar noen dager å få). Har Google ikke endret
reglene, må nye *personlige* kontoer kjøre en lukket test med minst 12 testere i 14 dager før appen
kan publiseres. Sjekk det når kontoen lages.

## 2. Opprett appen

- Navn: **Flatr infoskjerm**
- Standardspråk: norsk (bokmål)
- App, gratis
- Innstillinger → Avansert → Formfaktorer: legg til **Android TV**

## 3. Butikkoppføring

**Kort beskrivelse** (maks 80 tegn):

> Gjør TV-en til en infoskjerm. Koble til med kode og styr innholdet fra Flatr.

**Full beskrivelse:**

> Flatr gjør en vanlig TV med Android TV eller Google TV om til en infoskjerm for kontoret,
> kantina, resepsjonen, butikken eller klubbhuset.
>
> Slik virker det:
> 1. Installer Flatr på TV-en og åpne appen. Den viser en kode.
> 2. Logg inn på flatr.no, gå til Skjermer og tast inn koden.
> 3. Ferdig. Skjermen viser presentasjonen du har laget, og oppdaterer seg selv når du endrer noe.
>
> Laget for å stå på hele dagen:
> • Starter av seg selv når TV-en slås på, også etter strømbrudd
> • Holder skjermen våken
> • Viser innholdet videre hvis nettet faller ut
> • Skjermbilde og status for hver TV i Flatr, så du ser hva som vises
> • Hastemeldinger vises med en gang på alle skjermene
>
> Innholdet lager du i Flatr på nettet: bilder, video, tekst, kalender, vær, avganger fra Entur,
> nyheter, bursdager, dagens meny og mye mer.
>
> Du trenger en Flatr-konto. Det er gratis å starte på flatr.no.

Bilder: `icon-512.png` (ikon), `feature-graphic-1024x500.png` (funksjonsgrafikk),
`tv-banner-1280x720.png` (TV-banner) og minst ett TV-skjermbilde i 1920×1080. Et godt skjermbilde
får du fra Skjermer i Flatr (appen sender skjermbilder av det TV-en viser).

Kategori: Business. Kontakt-e-post må være en adresse som tar imot e-post.

## 4. Appinnhold

- **Personvernerklæring:** https://flatr.no/personvern. Fyll inn plassholderne (firmanavn,
  org.nr, kontakt-e-post) først.
- **Tilgang til appen:** appen har ingen innlogging, men viser en kode som må kobles i en
  Flatr-konto. Skriv til Google: «Åpne appen. Logg inn på https://flatr.no med testkontoen
  appreview@flatr.no (passord: …), gå til Skjermer → Legg til skjerm, og tast koden TV-en viser.»
- **Annonser:** nei.
- **Målgruppe:** 18 år og eldre (bedrifter og foreninger).
- **Innholdsvurdering:** fyll ut skjemaet (ingen vold, sex, pengespill eller brukerinnhold i appen).
- **Datasikkerhet:** appen sender enhetsmodell, Android-versjon og skjermbilder av det skjermen
  viser til Flatr-kontoen TV-en er koblet til, for at kunden skal se at skjermen virker. Alt sendes
  kryptert. Ingen deling med andre, ingen reklame. Data slettes når TV-en kobles fra.

## 5. Publiser

1. Testing → **Intern testing** → last opp `app-release.aab`, legg deg selv inn som tester, og
   installer den på en ekte Android TV eller Google TV fra Play.
2. Når alt virker: **Produksjon** → opprett utgivelse med samme fil.
3. Google går gjennom TV-apper ekstra nøye (banner, fjernkontroll, ingen berøring). Det kan ta
   noen dager.

## Ny versjon senere

Øk `versionCode` (og `versionName`) i `android/app/build.gradle.kts`, kjør
`./gradlew bundleRelease`, og last opp den nye `.aab`-fila.
