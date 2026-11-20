// Vaihdettava kielimallirajapinta. Oletuksena mallia EI ole: sovellus kertoo
// avoimesti, mitkä toiminnot ovat sääntöpohjaisia. Tähän ei ole kytketty yhtään
// ulkoista palvelua; potilasteksti ei lähde selaimesta.

/**
 * Mallisovittimen sopimus. Toteutuksen on palautettava ehdotukset erillään
 * lähdepohjaisesta luonnoksesta, ja sen tuottama teksti ajetaan samojen
 * lähdevertailujen läpi (checks.fidelityIssues) ennen näyttämistä.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   available: boolean,
 *   sendsDataOutside: boolean,
 *   rewrite?: (req: { task: string, draftText: string, facts: { id: string, text: string, category: string }[] }) => Promise<{ text: string, suggestions: string[] }>
 * }} ModelAdapter
 */

/** @type {ModelAdapter} */
export const NO_MODEL = { id: "none", label: "Ei kielimallia", available: false, sendsDataOutside: false };

/**
 * @param {ModelAdapter} adapter
 * @returns {{ feature: string, mode: string }[]}
 */
export function capabilities(adapter) {
  const rule = "sääntöpohjainen";
  const off = adapter.available ? "kielimalli" : "ei käytössä (vaatii kielimallin)";
  return [
    { feature: "Tehtävän tunnistus", mode: rule },
    { feature: "Tietojen poiminta ja luokittelu", mode: rule },
    { feature: "Asiakirjapohjat ja täydennyskohdat", mode: rule },
    { feature: "Ristiriitojen ja lähde-erojen tarkistus", mode: rule },
    { feature: "Termien avaus potilaalle", mode: `${rule} (sanasto)` },
    { feature: "Sujuva uudelleenmuotoilu ja tiivistys", mode: off },
    { feature: "Laaja kieliasun korjaus", mode: off },
    { feature: "Kliiniset ehdotukset (erillään luonnoksesta)", mode: off },
  ];
}
