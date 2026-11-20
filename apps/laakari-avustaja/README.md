# Lääkärin kirjoitusavustaja (prototyyppi 0.1)

> **Ei potilaskäyttöön.** Käytä vain keksittyä aineistoa. Katso [tuotantokäytön arvio](docs/tuotantokayton-arvio.md).

Lääkäri liittää tai kirjoittaa vapaata tekstiä yhteen kenttään. Työkalu ehdottaa tehtävää ja tekee
muokattavan luonnoksen. Luonnoksen vieressä on ”Tarkista nämä” -lista: puuttuvat tiedot,
ristiriidat ja erot alkuperäiseen tekstiin. Työkalu valmistelee tekstiä. Se ei diagnosoi, ei
päätä lähetteestä tai etuudesta, ei allekirjoita eikä tallenna mitään potilastietojärjestelmään.

Sijainti: tämä hakemisto (`apps/laakari-avustaja/`) on itsenäinen sovellus REA-repositorion
sisällä. Se ei käytä REA:n koodia eikä riippuvuuksia. Repositoriosta ei löytynyt aiempaa
lääkärisovellusta, joten tämä on sen ensimmäinen versio.

## Käynnistys Windows-työpöydällä

1. Asenna Node.js 20 tai uudempi (nodejs.org), jos sitä ei vielä ole. Sovellus ei tarvitse
   muita ohjelmia eikä `npm install` -komentoa.
2. Avaa PowerShell tässä hakemistossa ja aja:
   ```powershell
   node server.mjs
   ```
3. Avaa Edge tai Chrome osoitteessa **http://localhost:8787/**. Kahden näytön työpöydällä
   sovelluksen voi pitää omassa ikkunassaan toisella näytöllä.
4. Pysäytä palvelin näppäinyhdistelmällä Ctrl+C. Palvelin ei lokita pyyntöjä eikä vastaanota
   tekstiä. Kaikki käsittely tapahtuu selaimessa.

Vaihtoehto ilman Nodea: mikä tahansa staattinen palvelin `public/`-hakemistolle, esimerkiksi
`python -m http.server 8787 --directory public`. Tiedoston avaaminen suoraan (`file://`) ei
toimi, koska selaimet estävät JavaScript-moduulit.

## Saman näkymän avaaminen iPadilla

1. Käynnistä Windows-koneella palvelin lähiverkkotilassa: `node server.mjs --lan`.
   Palvelin tulostaa osoitteen, esimerkiksi `http://192.168.1.23:8787/`.
2. Salli Windowsin palomuurin kysyessä yhteys vain *yksityisessä* verkossa.
3. Avaa osoite iPadin Safarissa. Kopiointi toimii varakeinolla, koska iPadin Clipboard API
   ei toimi http-yhteydessä.
4. Lähiverkkoyhteys on salaamaton. Käytä sitä vain keksityllä aineistolla. Potilaskäyttö
   vaatisi HTTPS:n ja käyttöoikeuksien hallinnan.

## Käyttö

- Kirjoita tai liitä teksti. Ehdotettu tehtävä näkyy heti, ja sen voi vaihtaa yhdellä
  painalluksella tai näppäimillä Alt+1…9. Jos tarkoitus on epäselvä, työkalu näyttää 2–3
  todennäköisintä vaihtoehtoa.
- **Muodosta luonnos** (Ctrl+Enter). Jos ratkaiseva tieto puuttuu, työkalu kysyy vain sen,
  esimerkiksi lausunnon käyttötarkoituksen tai lähetteen kysymyksenasettelun.
- Luonnoksen osiot ovat muokattavia. *Lähteet*-painike näyttää, mihin syötteen kohtaan ja
  mihin lähdetyyppiin lause perustuu: käyttäjän antama tieto, lähdeasiakirja, vahvistettu
  fraasi tai pohjateksti. *Näytä syötteessä* valitsee kohdan syötteestä.
- Hakasulkeissa olevat kohdat ovat täydennettäviä. Ne on täydennettävä tai poistettava ennen
  hyväksyntää.
- Punaiset tarkistukset (ristiriidat ja erot lähteeseen) on kuitattava. Kun hyväksyntärasti on
  asetettu, *Kopioi koko teksti* (Ctrl+Shift+C) tai osion *Kopioi* kopioi tekstin
  kappalejakoineen. *Palauta edellinen versio* (Ctrl+Alt+Z) palauttaa edellisen version.
- **Fraasit** (Alt+F): fraasien lisäys, haku, muokkaus, poisto, tuonti ja vienti (JSON).
  Statusfraasin löydökset rastitaan yksitellen: fraasin valinta ei yksin vahvista, että
  tutkimus on tehty. Esimerkkifraaseja ei ole vahvistettu.
- **Asetukset**: potilaskertomuksen otsikot (oletuksena Esitiedot, Status, Suunnitelma ja
  Yhteenveto; lisäksi Nykytila ja Arvio voi ottaa käyttöön). Samassa näkymässä näkyy, mitkä
  toiminnot ovat sääntöpohjaisia.

## Toiminnot ja tila

| Työnkulku | Tila |
|---|---|
| Potilaskertomus | Toimii. Sääntöpohjainen luokittelu: potilaan kertoma, havainto, tutkimustulos, suunnitelma. |
| Lähete | Toimii. Kohde, kysymyksenasettelu, peruste, hoitokokeilut ja tutkimukset. Kiireellisyys jää aina lääkärin vahvistettavaksi. |
| B-/BC-lausunto | Toimii neljälle käyttötarkoitukselle: kuntoutuspsykoterapia, ammatillinen kuntoutus, sairauspäiväraha ja kuntoutustuki/työkyvyttömyyseläke. Pohjat perustuvat Kelan ohjeisiin. Muille tarkoituksille käytetään yleisrakennetta ja näytetään varoitus. |
| Potilaalle selitys | Toimii. Löydös, tulkinta ja jatkotoimi ovat erillään. Termit avataan sanastosta. |
| Tutkimustiivistelmä, todistus, konsultaatio, hoitosuunnitelma | Perusluonnos. Pohjat ovat yksinkertaisia. |
| Kieliasu | Rajattu: vain välilyönnit, välimerkit ja isot alkukirjaimet. |
| Kielimalli | Ei kytketty. Rajapinta on valmiina (`public/core/model.js`). |

## Rakenne

```
server.mjs              staattinen palvelin (ei POST-rajapintoja, ei lokitusta, CSP, no-store)
public/index.html, app.js, styles.css     käyttöliittymä
public/core/intent.js   asiakirjatyypin tunnistus
public/core/extract.js  poiminta rakenteiseen välitulokseen (lähdekohta, luokka, alkuperä)
public/core/compose.js  asiakirjapohjat ja luonnoksen muodostus
public/core/bc-purposes.js  Kelan BC-lausunnon käyttötarkoitukset (lähde ja tarkistuspäivä)
public/core/checks.js   usean potilaan tunnistus, ristiriidat ja lähdevertailu
public/core/phrases.js  fraasikirjasto
public/core/plain.js    potilaalle-sanasto
public/core/model.js    vaihdettava kielimallirajapinta (oletus: ei mallia)
```

## Testit

```bash
npm test            # 15 yksikkötestiä (node:test), ei riippuvuuksia
npm run test:e2e    # 35 selaintarkistusta: hyväksymistestit A–F, Windows 1920×1080 ja iPad-koko (Playwright + Chromium)
```

E2E-testit vaativat Playwrightin ja Chromiumin, jotka ovat valmiina kehitysympäristössä.
Sovellus ei tarvitse niitä toimiakseen.

Lisätiedot: [työkalukartoitus](docs/tyokalukartoitus.md), [Kelan lähdemuistio](docs/lahteet/kela-bc-lausunto.md),
[tuotantokäytön arvio](docs/tuotantokayton-arvio.md).
