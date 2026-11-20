# Työkalukartoitus (20.11.2026)

Kartoitus tehtiin ennen suunnittelua. Saatavuus tarkistettiin tässä ympäristössä:
Claude-pluginluettelosta ja MCP-rekisteristä haettiin, npm-rekisteristä katsottiin versiot,
ja kirjastot asennettiin kokeiltaviksi. Nimen perusteella ei päätelty mitään.

Ryhmät:
- **A** = väline, jolla sovellusta rakennetaan ja testataan
- **B** = kirjasto, joka sisältyy valmiiseen sovellukseen
- **C** = ulkoinen palvelu, jolle sovellus lähettäisi tietoa

Tärkein periaate: ryhmän A väline ei anna valmiille sovellukselle mitään oikeuksia. Esimerkiksi
selaintestaus ei tarkoita, että sovellus saisi pääsyn selaimeen tai potilastietojärjestelmään.

## Vertailu

| Vaihtoehto | Ryhmä | Käyttö tässä projektissa | Lähde / tila | Kustannus | Oikeudet | Lähettääkö tietoa ulos | Toimiiko tässä ympäristössä | Päätös |
|---|---|---|---|---|---|---|---|---|
| Playwright (Node, valmiiksi asennettu) + Chromium | A | Hyväksymistestit A–F, Windows-näkymä 1920×1080 ja iPad-koko | playwright.dev, Microsoft; aktiivinen | Maksuton (Apache-2.0) | Paikallinen selain | Ei | Kyllä: `require('playwright')` toimii | **Valittu** (tehtävä 3) |
| Playwright MCP -plugin | A | Ad hoc -selaintarkistus Clauden kautta | claude-plugins-official / Microsoft | Maksuton | Selainohjaus | Ei | Kyllä | **Vain satunnaiseen tarkistukseen.** Sama tehtävä kuin edellä. Tallentaa kuvat ja konsolilokin työhakemistoon (`.playwright-mcp/`), mikä on vuotoriski oikealla aineistolla. |
| axe-accessibility MCP | A | Saavutettavuusauditointi | Deque | Vaatii tilin tai avaimen | API | Kyllä (Deque) | Ei: yhteys katkesi | Hylätty nyt. Kosketuskohteet ja näppäimistö testataan Playwrightilla. |
| Kelan sivut kela.fi | lähde | BC-lausuntopohjien sisältö | Kela; sivut päivitetty 13.11.2026 | Maksuton | Verkko: kela.fi | Ei (vain luku) | Kyllä, kun ympäristöön lisättiin kela.fi | **Valittu** (tehtävä 2). Tarkistettu 20.11.2026. |
| WebSearch | A | Kelan sivujen löytäminen | Anthropic | Sisältyy | – | Hakusana | Kyllä | Käytetty vain sivujen löytämiseen. Sisältö luettiin sivuilta suoraan. |
| jsdiff `diff@9.0.0` | B | Sanatason erot | npm; BSD-3 | Maksuton | – | Ei | Kyllä, kokeiltu | **Hylätty ajonaikaisena riippuvuutena.** Ks. koe 2. |
| Oma vertailija (`core/checks.js`, `wordDiff`) | B | Puuttuvat tiedot, luvut, puolet, kiellot, epävarmuus | Oma koodi | – | – | Ei | Kyllä | **Valittu** (tehtävä 4) |
| libvoikko 4.3 (PyPI) / voikko-fi | A/B | Suomen oikoluku kieliasun tarkistukseen | Voikko-projekti; MPL/GPL/LGPL | Maksuton | – | Ei | **Ei:** natiivikirjasto `libvoikko.so.1` ja sanasto puuttuvat, apt-paketteja ei ole saatavilla | Jatkovaiheen ehdotus (tehtävä 1) |
| Kielimalli (esim. Claude API) | C | Sujuva muotoilu ja kieliasu | – | Maksullinen | API-avain | **Kyllä: potilasteksti lähtisi** | – | **Ei kytketty.** Rajapinta on valmiina (`core/model.js`). Käyttöönotto vaatii tuotantokäytön arvion. |
| Synthea / Mock Data Hydrator / TDCv2 | A | Synteettiset potilastapaukset | Synthea on Yhdysvaltain dataan perustuva; TDCv2 on etäpalvelu | Maksuton tai etäpalvelu | – | TDCv2: kyllä | Ei kokeiltu | **Hylätty.** Eivät tuota suomalaista kliinistä vapaatekstiä. Käsin laaditut tapaukset (`tests/fixtures.mjs`) ja satunnainen kanaria testissä F riittävät. |
| `@faker-js/faker` 10.6 | A | Suomalaiset nimet testeihin | npm; MIT | Maksuton | – | Ei | Saatavilla | Hylätty. Nimiä ei tarvita, ja oikean näköiset nimet lisäisivät sekaannusvaaraa. |
| npm audit / OSV | A | Riippuvuuksien haavoittuvuudet | npm | Maksuton | – | Pakettilista | Kyllä | Ei tarvetta: sovelluksella ei ole yhtään ajonaikaista riippuvuutta. |
| Security review -taito, finecomb, OWASP-plugin | A | Koodin tietoturvakatselmointi | Claude Code -taidot | Maksuton | Lukuoikeus | Ei | security-review on saatavilla | security-review on käytettävissä katselmointiin. Pluginit ovat päällekkäisiä, joten niitä ei asennettu. |
| Oma lokivuototesti (kanaria) | A | Testi F | Oma | – | – | Ei | Kyllä | **Valittu** (tehtävä 6) |
| PubMed, Arca FDA, ClinicalTrials -MCP | C | Lääketieteellinen kirjallisuus | Anthropicin hakemisto | Maksuton | Verkko | Hakusana | Ei asennettu | Hylätty. Ei tarvetta tässä vaiheessa, eikä kliininen sisältö kuulu sovelluksen tehtäviin. |
| Synapsi (C:\Synapsi) | C/lähde | Projektiohjeet ja fraasit | Käyttäjän holvi | – | Tiedosto-oikeus | – | **Ei avaudu** tässä pilvikontissa | Jatkovaihe. Fraasivienti on JSON-muotoista, joten myöhempi tuonti on mahdollinen ilman potilastietoja. |

## Kokeet synteettisillä esimerkeillä

1. **Kelan sivujen saatavuus.** Ensin `curl` ja hakuagentti epäonnistuivat, koska ympäristö esti
   kela.fi:n (DNS). Ympäristöön lisättiin kaksi sallittua osoitetta (`www.kela.fi`, `kela.fi`).
   Sen jälkeen viisi sivua latautui (HTTP 200) ja muunnettiin tekstiksi `markitdown`-työkalulla.
   *Koe osoitti:* lausuntopohjat voidaan johtaa Kelan omasta tekstistä, ja sivujen
   päivityspäivä (13.11.2026) voidaan lukea suoraan sivulta. Keskeinen havainto: **BC-lausunto
   korvaa B- ja C-lausunnot**, ja käyttötarkoitus määrää täytettävät osat.
2. **jsdiff verrattuna omaan vertailijaan.** Testilause: ”pot kertoo oik olkapää kipeä 3 vk … 400mg”
   ja sen siistitty versio. Molemmat tuottivat oikeat sanaerot. jsdiff käsitteli välimerkit
   siistimmin. Kumpikin näytti kuitenkin muutoksena kohdat ”400mg”→”400 mg” ja ”vk”→”viikkoa”,
   jotka eivät muuta merkitystä. *Koe osoitti:* kliiniseen vertailuun tarvitaan
   merkitystason tarkistus: normalisoidut luvut, puoli, kielto ja epävarmuus. Pelkkä merkkiero
   ei riitä. Omassa toteutuksessa ei ole riippuvuutta (jsdiff vie 1 Mt), ja se kattaa tarpeen.
3. **Voikko.** `pip install libvoikko` onnistui, mutta `Voikko('fi')` kaatui, koska
   natiivikirjasto puuttuu. *Koe osoitti:* Voikkoa ei voi käyttää tässä ympäristössä.
   Kieliasun korjaus on siksi rajattu turvallisiin muotomuutoksiin, ja rajaus kerrotaan
   käyttäjälle avoimesti.
4. **Playwright-skripti verrattuna Playwright MCP:hen.** Yksi MCP-tilannekuva tyhjästä sivusta oli
   2,8 kt (noin 800 tokenia), ja jokainen toiminto lisää uuden tilannekuvan. Koko
   hyväksymistestiajon (35 tarkistusta, 5 päänäkymää ja 2 iPad-kokoa) tulos on noin 3 kt yhdellä
   ajolla, ja se on toistettavissa (`npm run test:e2e`). MCP kirjoitti lisäksi tiedostoja
   repositorion juureen (`.playwright-mcp/`). Ne poistettiin, ja hakemisto lisättiin
   `.gitignore`-tiedostoon. *Koe osoitti:* skripti on regressiotestaukseen nopeampi ja säästää
   kontekstia. MCP sopii vain satunnaiseen visuaaliseen tutkimiseen. MCP-kokeilu paljasti myös
   puuttuvan favicon-tiedoston aiheuttaman konsolivirheen, joka korjattiin.

## Mitä otettiin käyttöön

- Ympäristöön lisättiin rajattu verkkopääsy: sallitut osoitteet `www.kela.fi` ja `kela.fi`. Muutos tehtiin
  hyväksyntäkehotteen kautta, eikä sovellus itse ota yhteyttä verkkoon.
- Mitään ei asennettu repositorioon. Sovelluksella ei ole yhtään npm-riippuvuutta. Valmiiksi
  asennettu Playwright riittää testeihin.
- Jsdiff- ja Voikko-kokeilut tehtiin väliaikaishakemistossa, ja ne jäivät pois repositoriosta.

## Vaikutus toteutussuunnitelmaan

- B-lausunto toteutettiin **BC-lausuntona**. Kela otti BC-lausunnon käyttöön syksyllä 2026.
  Pohjat rakennettiin käyttötarkoituksittain Kelan ”Näin laadit lausunnon” -luetteloiden mukaan.
- Lähdevertailu tehtiin merkitystasolla. Sanatason ero on käytössä vain kieliasutilassa.
- Kieliasutila on sääntöpohjainen ja suppea. Laajempi korjaus odottaa Voikkoa tai erikseen
  arvioitua kielimallia.
- Hyväksymistestit ovat toistettava Playwright-skripti. MCP:tä ei käytetä regressiotestaukseen.
- Sovellus jäi kokonaan ilman riippuvuuksia. Tämä yksinkertaistaa tietoturva-arviota ja
  käyttöönottoa Windowsilla.
