# Kelan BC-lausunto – lähdemuistio

Tarkistettu: **20.11.2026** (sivut luettu suoraan kela.fi:stä). Kelan sivujen merkintä: ”Sivu päivitetty 13.11.2026”.

| Käyttötarkoitus | URL | Sovelluksessa |
|---|---|---|
| BC-lausunto, yleinen rakenne | https://www.kela.fi/kumppanit-laakarinlausunto-bc | yleisrakenne (”Muu yksilöity tarkoitus”) |
| Kuntoutuspsykoterapia | https://www.kela.fi/yhteistyokumppanit-terveydenhuolto-laakarinlausunnot-ja-todistukset-b-lausunto-kuntoutus-kuntoutuspsykoterapia | oma pohja |
| Ammatillinen kuntoutus | https://www.kela.fi/kumppanit-laakarinlausunto-bc-kuntoutus-ammatillinen | oma pohja |
| Sairauspäiväraha (yli 2 kk) | https://www.kela.fi/kumppanit-laakarinlausunto-bc-sairauspaivaraha | oma pohja |
| Kuntoutustuki / työkyvyttömyyseläke | https://www.kela.fi/kumppanit-laakarinlausunto-bc-kuntoutustuki-ja-tyokyvyttomyyselake | oma pohja |
| Lääkekorvaus, vammaistuet ym. | (linkit yleissivulla) | **ei vielä tarkistettu** – yleisrakenne ja varoitus |

Keskeiset lainaukset (Kela):

- ”Uusi BC-lausunto korvaa B- ja C-lausunnot.”
- ”Käyttötarkoitus määrittää sen, mitkä lausunnon osat täytetään ja mitä tietoja lausuntoon kirjataan.”
- ”Täytä BC-lausuntoon vain ne tiedot, jotka Kela tarvitsee asiakkaan etuushakemuksen ratkaisemiseksi.”
- Kuntoutuspsykoterapia: ”Kuntoutuspsykoterapiaa varten tehdyssä BC-lausunnossa täytyy olla päihdeanamneesi ja selvitys lääkkeiden käytöstä.” ja ”asianmukaista hoitoa vähintään 3 kuukauden ajan”.
- Työkykyjohtopäätös: ”Valitse vaihtoehto ’En ota kantaa’, jos sinulla ei ole riittäviä tietoja työkykyarvion tekemiseksi.”

Lausunnon osat (Kela, yleisrakenne): lausunnon tarkoitus; olennaiset työ- ja toimintakykyyn
vaikuttavat sairaudet ja vammat tärkeysjärjestyksessä; sairaustiedot; toimintakyky; työ- ja
opiskelukyky; tutkimus- ja hoitosuunnitelma; arvio kuntoutustarpeesta ja kuntoutussuunnitelma;
työkykyä koskevat johtopäätökset; vammaisetuudet; lääke-/ravintovalmistekorvaus; etävastaanotto;
muut arvioinnit; lausunnon laatija.

**Päivitysseuranta:** pohjat ovat tiedostossa `public/core/bc-purposes.js` (`KELA_CHECKED`,
`KELA_PAGE_UPDATED`). Tarkista sivujen ”Sivu päivitetty” -päivä vähintään neljännesvuosittain ja aina
Kelan tiedotteen jälkeen; jos päivä on muuttunut, vertaa ”Näin laadit lausunnon” -luetteloa pohjaan ja
päivitä molemmat päivämäärät. Sovellus ei hae sivuja itse (ei verkkoyhteyttä).

Sovelluksen luonnos on teksti-ehdotus: varsinainen lausunto täytetään, allekirjoitetaan ja välitetään
potilastietojärjestelmän BC-lausunnolla.
