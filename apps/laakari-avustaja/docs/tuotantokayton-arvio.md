# Tuotantokäytön arvio – ennen oikeiden potilastietojen käsittelyä

**Tila 20.11.2026: EI hyväksytty potilaskäyttöön.** Prototyyppi toimii teknisesti synteettisellä
aineistolla. Tekninen toimivuus ei riitä potilaskäytön hyväksyntään. Alla on luettelo asioista,
jotka on ratkaistava ja dokumentoitava ennen käyttöönottoa. Kohdat eivät ole oikeudellista
neuvontaa. Tulkinnat on varmistettava organisaation tietosuojavastaavalta ja juristilta.

| Alue | Nykytila prototyypissä | Ratkaistava ennen käyttöä |
|---|---|---|
| Organisaation lupa | Ei lupaa | Lääkäriliikkeen johdon ja vastuulääkärin kirjallinen päätös käyttötarkoituksesta ja rajauksista |
| Rekisterinpitäjä | Ei määritelty | Kuka on rekisterinpitäjä: lääkäriliike, hyvinvointialue vai ostopalvelutilanne. Vastuut käsittelytoimien selosteeseen. |
| Käsittelyn peruste ja vaikutustenarviointi | – | GDPR art. 6 ja 9. Arvioidaan, tarvitaanko vaikutustenarviointi (DPIA): terveystietoja ja mahdollisesti uutta teknologiaa käytetään |
| Käsittelysopimukset | Ei ulkoisia palveluita | Jos kielimalli tai pilvipalvelu otetaan käyttöön: tietojenkäsittelysopimus (DPA), alikäsittelijät, tietojen sijainti, säilytys ja kouluttamiskielto |
| Kansainväliset siirrot | Ei siirtoja; teksti pysyy selaimessa | Jos palvelu on EU:n tai ETA:n ulkopuolella: siirtoperuste (esim. vakiolausekkeet tai tietosuojakehys) ja siirtovaikutusten arvio |
| Käyttöoikeudet | Ei kirjautumista; kuka tahansa samalla koneella tai lähiverkossa (`--lan`) voi avata sovelluksen | Käyttö vain hallitulla työasemalla. Lähiverkkokäytössä tunnistautuminen tai pelkkä paikallinen käyttö. |
| Salaus | Paikallisesti http. `--lan` on salaamaton. | HTTPS ja luotettu varmenne iPad-käyttöön, tai sovellus asennetaan laitteelle. Laitteen levysalaus. |
| Lokitus | Palvelin ei lokita pyyntöjä. Syöte ei mene lokiin (testi F). | Lokituspolitiikka. Jos käyttölokia tarvitaan, siihen ei tallenneta sisältöä. Selaimen virheraportointi pysyy pois päältä. |
| Säilytys | Syöte ja luonnos vain muistissa. Fraasit ja asetukset selaimen localStoragessa. | Fraasit eivät saa sisältää potilastietoja: ohje ja tarkistus. Tyhjennyskäytäntö jaetuilla laitteilla. |
| Potilastietojärjestelmä | Ei integraatiota; kopiointi leikepöydän kautta | Leikepöytähistoria (Windows Win+V, iCloud-leikepöytä) voi säilyttää tekstin. Ohjeistus tai tekninen esto. |
| Suomen sääntely | – | Asiakastietolaki (703/2023) ja Valviran/THL:n määräykset tietojärjestelmille: onko kyse asiakastietojärjestelmästä tai hyvinvointisovelluksesta, mikä luokka ja velvollisuudet, vai pelkästä tekstityökalusta. Tietoturvasuunnitelma. |
| Lääkinnällinen laite | Työkalu valmistelee tekstiä. Se ei diagnosoi eikä tee päätöksiä. | MDR-arvio (EU 2017/745): käyttötarkoituksen sanamuoto on pidettävä sellaisena, ettei ohjelmisto tee kliinisiä päätöksiä. Arvioidaan uudelleen, jos kliiniset ehdotukset otetaan käyttöön. |
| Tekoälyasetus | Ei tekoälyä | Jos kielimalli otetaan käyttöön: tekoälyasetuksen (EU 2024/1689) luokittelu ja avoimuusvelvoitteet |
| Laadunvarmistus | 15 yksikkötestiä ja 35 selaintarkistusta synteettisellä aineistolla | Pilotointi synteettisellä ja anonymisoidulla aineistolla. Virheraportointi ilman potilastietoja. Muutoshallinta. Kelan pohjien tarkistus vähintään neljännesvuosittain. |
| Synapsi | Ei kytketty | Synapsiin saa siirtää vain hyväksyttyjä projektiohjeita ja potilaskohtaisuudesta vapaita fraaseja. Potilaskohtaista sisältöä ei saa siirtää Synapsin yleiseen muistiin. |

Tunnetut tekniset rajoitteet, jotka vaikuttavat arvioon:
- Tietojen poiminta ja ristiriitojen tunnistus ovat sääntöpohjaisia. Ne löytävät tyypilliset
  tapaukset, mutta eivät kaikkia. Lääkärin tarkistus on aina pakollinen.
- iPad-käyttö testattiin Chromiumin iPad-emulaatiolla eikä oikealla Safarilla.
- Clipboard API ei toimi http-lähiverkossa. Silloin käytetään varakeinoa, jota ei ole testattu
  oikealla iPadilla.
