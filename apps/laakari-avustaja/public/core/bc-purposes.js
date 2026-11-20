// B-/BC-lausunnon käyttötarkoitukset. Sisältö on johdettu Kelan virallisista
// ohjesivuista, jotka luettiin suoraan kela.fi:stä 20.11.2026 (sivut päivitetty 13.11.2026).
// Kela: "Uusi BC-lausunto korvaa B- ja C-lausunnot." Tämä on tekstiluonnoksen
// tarkistuslista, ei potilastietojärjestelmän lomake.

export const KELA_CHECKED = "2026-11-20";
export const KELA_PAGE_UPDATED = "2026-11-13";
export const KELA_BC_URL = "https://www.kela.fi/kumppanit-laakarinlausunto-bc";

/**
 * @typedef {{ id: string, label: string, detect?: RegExp, needsDoctor?: boolean }} CheckItem
 * @typedef {{ heading: string, categories: import("./extract.js").Category[], match?: RegExp, items: CheckItem[], doctorOnly?: boolean, note?: string }} BcSection
 * @typedef {{ id: string, label: string, detect: RegExp, url: string, verified: boolean, author: string, sections: BcSection[], notes: string[] }} BcPurpose
 */

const FUNCTION_RE = /toimintaky\p{L}*|arje\p{L}*|selviyt\p{L}*|kotityö\p{L}*|itsestä\p{L}*\s+huolehti|sosiaali\p{L}*|harrastu\p{L}*|kognitii\p{L}*|keskittymi\p{L}*|vuorokausirytmi|unirytmi/iu;
const WORK_RE = /työ\p{L}*|opiske\p{L}*|opin(?:not|noissa|toja|tojen|nois)\p{L}*|ammatti\p{L}*|koulu\p{L}*/iu;

/** Yhteiset osat Kelan BC-lausunnon rakenteesta (kela.fi/kumppanit-laakarinlausunto-bc). */
const common = {
  diagnoses: /** @type {BcSection} */ ({
    heading: "Olennaiset työ- ja toimintakykyyn vaikuttavat sairaudet ja vammat (tärkeysjärjestyksessä, ICD-koodit)",
    categories: [],
    match: /(?<![\p{L}])[A-Z]\d{2}(?:\.\d+)?(?![\p{N}])|diagnoo\p{L}*|dg(?![\p{L}])/u,
    items: [{ id: "icd", label: "Diagnoosit ICD-koodeineen tärkeysjärjestyksessä", detect: /(?<![\p{L}])[A-Z]\d{2}(?:\.\d+)?(?![\p{N}])/u }],
  }),
  clinicalDate: /** @type {BcSection} */ ({
    heading: "Kliinisen tutkimuksen päivämäärä",
    categories: [],
    match: /\d{1,2}\.\d{1,2}\.\d{2,4}/,
    items: [{ id: "pvm", label: "Viimeisimmän kliinisen tutkimuksen päivämäärä", detect: /\d{1,2}\.\d{1,2}\.\d{2,4}/ }],
  }),
  conclusion: /** @type {BcSection} */ ({
    heading: "Työkykyä koskevat johtopäätökset",
    categories: [],
    doctorOnly: true,
    items: [{ id: "johtopaatos", label: "Työkykyä koskeva johtopäätös on lääkärin valinta (myös ”En ota kantaa” on mahdollinen)", needsDoctor: true }],
  }),
  remote: /** @type {BcSection} */ ({
    heading: "Etävastaanotto",
    categories: [],
    match: /etävastaanot\p{L}*|videovastaanot\p{L}*|videoyhtey\p{L}*|läsnävastaanot\p{L}*|vastaanotolla/iu,
    items: [{ id: "eta", label: "Perustuuko lausunto läsnä- vai videovastaanottoon", detect: /etävastaanot|video|läsnävastaanot|vastaanotolla/i }],
  }),
};

/** @type {BcPurpose[]} */
export const BC_PURPOSES = [
  {
    id: "kuntoutuspsykoterapia",
    label: "Kuntoutuspsykoterapia",
    detect: /kuntoutuspsykoterap\p{L}*|psykoterapi\p{L}*/iu,
    url: "https://www.kela.fi/yhteistyokumppanit-terveydenhuolto-laakarinlausunnot-ja-todistukset-b-lausunto-kuntoutus-kuntoutuspsykoterapia",
    verified: true,
    author: "1. vuosi: psykiatrian alan erikoislääkäri (tai julkisen erikoissairaanhoidon psykiatrisen yksikön lääkäri). 2.–3. vuosi: hoitava lääkäri, jos terapia edennyt suunnitellusti.",
    notes: [
      "Edellytys: asianmukainen hoito vähintään 3 kuukautta diagnoosin jälkeen.",
      "Lausunnossa täytyy olla päihdeanamneesi ja selvitys lääkkeiden käytöstä.",
      "Lääkärin täytyy tavata potilas henkilökohtaisesti (kasvokkain tai videoyhteydellä).",
    ],
    sections: [
      { heading: "Lausunnon tarkoitus", categories: [], items: [] },
      common.diagnoses,
      {
        heading: "Esitiedot",
        categories: ["perustieto", "potilaan_kertoma"],
        items: [
          { id: "alku", label: "Mielenterveyden häiriön alkaminen ja kulku", detect: /alka\p{L}*|alkoi|alusta|vuode\p{L}*|kuukaude\p{L}*|\d+\s?(?:kk|v)(?![\p{L}])/iu },
          { id: "hoito3kk", label: "Diagnoosin jälkeen toteutunut alkuvaiheen hoito (≥ 3 kk) ja sen tulokset", detect: /lyhytterap\p{L}*|lyhytpsykoterap\p{L}*|hoitokontakt\p{L}*|hoitosuhte\p{L}*|psykiatrisel\p{L}*|depressiohoita\p{L}*|terapeut\p{L}*|hoito\p{L}*\s+\d|psykososiaali\p{L}*/iu },
          { id: "paihde", label: "Päihdeanamneesi", detect: /alkoho\p{L}*|päihte\p{L}*|kannabi\p{L}*|huume\p{L}*|audit(?![\p{L}])|raitti\p{L}*/iu },
          { id: "laake", label: "Lääkitys", detect: /\d+\s?mg|lääki\p{L}*|lääke\p{L}*|ssri|snri|sertraliini|essitalopraami|venlafaksiini|bupropioni|mirtatsapiini|ketiapiini/iu },
        ],
      },
      common.clinicalDate,
      {
        heading: "Nykytila",
        categories: ["havainto"],
        items: [{ id: "status", label: "Milloin ja miten statustutkimus tehtiin (läsnä/video) ja nykytilan havainnot", detect: /status|vastaanotolla|video|psyykki\p{L}*\s+tila|mieliala\p{L}*\s+(?:on|vaikutt)/iu }],
      },
      { heading: "Tutkimukset ja mittaukset", categories: ["tutkimustulos"], items: [] },
      { heading: "Yhteenveto sairaustiedoista ja ennusteesta", categories: [], doctorOnly: true, items: [{ id: "ennuste", label: "Miten diagnoosiin on päädytty ja ennuste hyvän hoidon myötä", needsDoctor: true }] },
      {
        heading: "Toimintakyky",
        categories: [],
        match: FUNCTION_RE,
        items: [{ id: "toimintakyky", label: "Häiriön vaikutus toimintakykyyn arjessa (fyysinen, psyykkinen, sosiaalinen, kognitiivinen)", detect: FUNCTION_RE }],
      },
      {
        heading: "Työ- ja opiskelukyky",
        categories: [],
        match: WORK_RE,
        items: [{ id: "tyokyky", label: "Uhkaako häiriö työ- tai opiskelukykyä alkuvaiheen hoidon jälkeen, ja miten", detect: WORK_RE }],
      },
      { heading: "Tutkimus- ja hoitosuunnitelma", categories: ["suunnitelma"], items: [] },
      {
        heading: "Arvio kuntoutustarpeesta ja kuntoutussuunnitelma",
        categories: [],
        match: /kuntoutu\p{L}*|motivaa\p{L}*|motivoitu\p{L}*|vastavuoroi\p{L}*|terapiamuoto|yksilöterap\p{L}*|yksilöpsykoterap\p{L}*|ryhmäterap\p{L}*/iu,
        items: [
          { id: "riittamaton", label: "Miksi aiempi hoito ja kuntoutus eivät ole riittäneet", detect: /ei (?:ole )?riittä\p{L}*|riittämät\p{L}*|ei auttanut|osittai\p{L}*\s+apu|jäännösoire\p{L}*/iu },
          { id: "soveltuvuus", label: "Soveltuvuus ja oikea-aikaisuus (hyötyminen, motivaatio, vastavuoroisuus, tunteiden käsittely)", detect: /motivaa\p{L}*|motivoitu\p{L}*|vastavuoroi\p{L}*|valmi\p{L}*\s+muutt|työskentelyvalmiu\p{L}*/iu },
          { id: "muoto", label: "Suositeltu psykoterapiamuoto (yksilö, ryhmä, perhe, pari …)", detect: /yksilö\p{L}*|ryhmä\p{L}*|perhe\p{L}*|pari\p{L}*|kuvataide\p{L}*|musiikkiterap\p{L}*/iu },
        ],
      },
      common.conclusion,
      common.remote,
    ],
  },
  {
    id: "ammatillinen",
    label: "Ammatillinen kuntoutus",
    detect: /ammatilli\p{L}*\s+kuntou\p{L}*|ammatilli\p{L}*/iu,
    url: "https://www.kela.fi/kumppanit-laakarinlausunto-bc-kuntoutus-ammatillinen",
    verified: true,
    author: "Lääkäri tai lääkärin tehtävissä toimiva lääketieteen kandidaatti.",
    notes: [
      "Sairauden tai vamman täytyy olla todettu asianmukaisesti ja hoidon vakiintuneessa vaiheessa.",
      "Arvioi, onko sairaus ja elämäntilanne vakiintunut niin, että ammatillinen kuntoutus on ajankohtaista.",
    ],
    sections: [
      { heading: "Lausunnon tarkoitus", categories: [], items: [] },
      common.diagnoses,
      { heading: "Esitiedot", categories: ["perustieto", "potilaan_kertoma"], items: [{ id: "dgperuste", label: "Miten sairaus on diagnosoitu, mihin diagnoosi perustuu ja miten hoito ja kuntoutus on toteutunut", detect: /diagnoo\p{L}*|hoito\p{L}*|kuntoutu\p{L}*/iu }] },
      common.clinicalDate,
      { heading: "Nykytila", categories: ["havainto"], items: [{ id: "status", label: "Nykytilan kliininen tutkimus ja tapa (läsnä/video)", detect: /status|vastaanotolla|video|tutkittaessa/i }] },
      { heading: "Tutkimukset ja mittaukset", categories: ["tutkimustulos"], items: [] },
      { heading: "Yhteenveto sairaustiedoista ja ennusteesta", categories: [], doctorOnly: true, items: [{ id: "ennuste", label: "Ennuste hyvän hoidon ja kuntoutuksen myötä", needsDoctor: true }] },
      { heading: "Toimintakyky", categories: [], match: FUNCTION_RE, items: [{ id: "toimintakyky", label: "Kokonaistilanne: fyysiset, psyykkiset, sosiaaliset ja kognitiiviset vaatimukset sekä ympäristötekijät", detect: FUNCTION_RE }] },
      {
        heading: "Työ- ja opiskelukyky",
        categories: [],
        match: WORK_RE,
        items: [
          { id: "tyohistoria", label: "Aiempi työ tai opiskelu, koulutus- ja työhistoria", detect: /koulutu\p{L}*|työhistori\p{L}*|ammatti\p{L}*|työskennel\p{L}*|työskentelee/iu },
          { id: "heikentyma", label: "Miten sairaus heikentää työ-/opiskelukykyä olennaisesti hoidon jälkeenkin", detect: /heikent\p{L}*|ei pysty|ei kykene|rajoit\p{L}*/iu },
        ],
      },
      { heading: "Tutkimus- ja hoitosuunnitelma", categories: ["suunnitelma"], items: [] },
      {
        heading: "Arvio kuntoutustarpeesta ja kuntoutussuunnitelma",
        categories: [],
        match: /kuntoutu\p{L}*|motivaa\p{L}*|voimavar\p{L}*|työkokeilu\p{L}*|koulutuskokeilu\p{L}*|uudelleenkoulutu\p{L}*/iu,
        items: [
          { id: "voimavarat", label: "Voimavarat, vahvuudet, motivaatio ja sitoutuminen", detect: /voimavar\p{L}*|vahvuu\p{L}*|motivaa\p{L}*|motivoitu\p{L}*/iu },
          { id: "suunnitelma", label: "Kuntoutuksen tavoitteet, toteuttaja ja aikataulu", detect: /tavoite\p{L}*|työkokeilu\p{L}*|koulutu\p{L}*|kuntoutusselvity\p{L}*/iu },
        ],
      },
      common.conclusion,
      common.remote,
    ],
  },
  {
    id: "sairauspaivaraha",
    label: "Sairauspäiväraha (yli 2 kk)",
    detect: /sairauspäivära\p{L}*|(?<![\p{L}])spr(?![\p{L}])/iu,
    url: "https://www.kela.fi/kumppanit-laakarinlausunto-bc-sairauspaivaraha",
    verified: true,
    author: "Lääkäri tai lääkärin tehtävissä toimiva lääketieteen kandidaatti.",
    notes: [
      "Työkykyä arvioidaan yleensä suhteessa potilaan omaan työhön: kuvaa työ riittävän tarkasti.",
      "Työkykyarvio edellyttää tutkimista läsnä- tai videovastaanotolla; pelkkä chatti ei riitä.",
    ],
    sections: [
      { heading: "Lausunnon tarkoitus", categories: [], items: [] },
      common.diagnoses,
      { heading: "Esitiedot", categories: ["perustieto", "potilaan_kertoma"], items: [{ id: "kulku", label: "Sairauden alkaminen ja kulku, oireet, aiemmat vaiheet ja hoidot", detect: /alka\p{L}*|alkoi|hoido\p{L}*|hoito\p{L}*/iu }] },
      common.clinicalDate,
      { heading: "Nykytila", categories: ["havainto"], items: [{ id: "status", label: "Nykytilan tutkimus ja tapa (läsnä/video)", detect: /status|vastaanotolla|video|tutkittaessa/i }] },
      { heading: "Tutkimukset ja mittaukset", categories: ["tutkimustulos"], items: [] },
      { heading: "Yhteenveto sairaustiedoista ja ennusteesta", categories: [], doctorOnly: true, items: [{ id: "ennuste", label: "Miten diagnoosiin on päädytty ja ennuste", needsDoctor: true }] },
      { heading: "Toimintakyky", categories: [], match: FUNCTION_RE, items: [{ id: "toimintakyky", label: "Vaikutus arjen toimintoihin ja toimintakyvyn muutos", detect: FUNCTION_RE }] },
      {
        heading: "Työ- ja opiskelukyky",
        categories: [],
        match: WORK_RE,
        items: [
          { id: "tyo", label: "Nykyinen työ tai ammatti riittävällä tarkkuudella", detect: /työskentelee|ammatti\p{L}*|työ(?:ssä|nä|tehtäv\p{L}*)|opiskel\p{L}*/iu },
          { id: "paluu", label: "Arvio vaikutuksesta työkykyyn ja suunnitelma työhön paluusta", detect: /paluu\p{L}*|palaa\p{L}*|palata/iu },
        ],
      },
      { heading: "Tutkimus- ja hoitosuunnitelma", categories: ["suunnitelma"], items: [] },
      { heading: "Arvio kuntoutustarpeesta ja kuntoutussuunnitelma", categories: [], match: /kuntoutu\p{L}*/iu, items: [] },
      common.conclusion,
      common.remote,
    ],
  },
  {
    id: "kuntoutustuki",
    label: "Kuntoutustuki tai työkyvyttömyyseläke",
    detect: /kuntoutustu\p{L}*|työkyvyttömyyseläk\p{L}*/iu,
    url: "https://www.kela.fi/kumppanit-laakarinlausunto-bc-kuntoutustuki-ja-tyokyvyttomyyselake",
    verified: true,
    author: "Hoitava lääkäri tai lääkärin tehtävissä toimiva lääketieteen kandidaatti.",
    notes: [
      "Kela yleensä edellyttää läsnävastaanotolla tehtyä tutkimusta; ei yksinomaan etävastaanottoa.",
      "Kuvaa myös vahvuudet ja jäljellä oleva työkyky; kuntoutustukeen tarvitaan ajantasainen hoito- tai kuntoutussuunnitelma.",
    ],
    sections: [
      { heading: "Lausunnon tarkoitus", categories: [], items: [] },
      common.diagnoses,
      { heading: "Esitiedot ja sairaushistoria", categories: ["perustieto", "potilaan_kertoma"], items: [{ id: "tulokset", label: "Miten hoito ja kuntoutus on edennyt ja millaisia tuloksia saatu", detect: /hoito\p{L}*|kuntoutu\p{L}*/iu }] },
      common.clinicalDate,
      { heading: "Nykytila", categories: ["havainto"], items: [{ id: "status", label: "Toimintakyvyn kannalta keskeiset tutkimuslöydökset ja tapa (läsnä)", detect: /status|vastaanotolla|tutkittaessa/i }] },
      { heading: "Tutkimukset ja mittaukset", categories: ["tutkimustulos"], items: [] },
      { heading: "Yhteenveto sairaustiedoista ja ennusteesta", categories: [], doctorOnly: true, items: [{ id: "ennuste", label: "Miten diagnoosiin on päädytty ja ennuste", needsDoctor: true }] },
      { heading: "Toimintakyky", categories: [], match: FUNCTION_RE, items: [{ id: "toimintakyky", label: "Havaintoihin perustuva kokonaisarvio toimintakyvystä, vahvuudet ja ennuste", detect: FUNCTION_RE }] },
      {
        heading: "Työ- ja opiskelukyky",
        categories: [],
        match: WORK_RE,
        items: [
          { id: "ammatti", label: "Nykyinen ammatti, työnantaja, koulutus- ja työhistoria", detect: /ammatti\p{L}*|työnantaj\p{L}*|koulutu\p{L}*|työhistori\p{L}*|työskentelee/iu },
          { id: "jaljella", label: "Jäljellä oleva työkyky ja mitä tehtäviä potilas voi tehdä", detect: /jäljellä|pystyy|kykenee|kevennet\p{L}*|osa-aikai\p{L}*/iu },
        ],
      },
      { heading: "Tutkimus- ja hoitosuunnitelma", categories: ["suunnitelma"], items: [{ id: "hoitosuunnitelma", label: "Ajantasainen hoito- tai kuntoutussuunnitelma aikatauluineen", detect: /suunnitel\p{L}*|kuntoutu\p{L}*|kontrolli\p{L}*/iu }] },
      { heading: "Arvio kuntoutustarpeesta ja kuntoutussuunnitelma", categories: [], match: /kuntoutu\p{L}*/iu, items: [] },
      common.conclusion,
      common.remote,
    ],
  },
  {
    id: "muu",
    label: "Muu yksilöity tarkoitus (esim. lääkekorvaus) – yleisrakenne",
    detect: /lääkekorvau\p{L}*|erityiskorvat\p{L}*|vammaistu\p{L}*|harkinnanvarai\p{L}*/iu,
    url: KELA_BC_URL,
    verified: false,
    author: "Tarkista käyttötarkoituksen laatijavaatimus Kelan sivulta.",
    notes: [
      "Tämän käyttötarkoituksen omaa Kelan ohjetta ei ole vielä tarkistettu sovellukseen; käytössä on BC-lausunnon yleisrakenne.",
      "Kela: täytä vain ne tiedot, jotka Kela tarvitsee etuushakemuksen ratkaisemiseksi.",
    ],
    sections: [
      { heading: "Lausunnon tarkoitus", categories: [], items: [] },
      common.diagnoses,
      { heading: "Sairaustiedot", categories: ["perustieto", "potilaan_kertoma", "havainto", "tutkimustulos"], items: [] },
      { heading: "Toimintakyky", categories: [], match: FUNCTION_RE, items: [{ id: "toimintakyky", label: "Toimintakyky, jos käyttötarkoitus sitä edellyttää", detect: FUNCTION_RE }] },
      { heading: "Tutkimus- ja hoitosuunnitelma", categories: ["suunnitelma"], items: [] },
      common.conclusion,
    ],
  },
];

/**
 * @param {string} text
 * @returns {BcPurpose | undefined}
 */
export function detectPurpose(text) {
  // Järjestys: tarkimmat ensin ("kuntoutuspsykoterapia" ennen "ammatillinen").
  return BC_PURPOSES.find((p) => p.detect.test(text));
}

/** @param {string} id */
export function purposeById(id) {
  return BC_PURPOSES.find((p) => p.id === id);
}
