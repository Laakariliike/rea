// Potilaalle ymmärrettävä kieli: lähteen lause säilyy sellaisenaan ja vaikeat
// termit selitetään sulkeissa sanastosta. Ei uusia väitteitä eikä taivutusmuunnoksia.

import { toSentence, expandSafeAbbreviations } from "./text.js";

/** [tunnistus, perusmuoto, selitys] */
const GLOSSARY = /** @type {[RegExp, string, string][]} */ ([
  [/supraspinatu\p{L}*/iu, "supraspinatusjänne", "ylemmän lapalihaksen jänne olkapäässä"],
  [/infraspinatu\p{L}*/iu, "infraspinatusjänne", "alemman lapalihaksen jänne olkapäässä"],
  [/kiertäjäkalvosin\p{L}*/iu, "kiertäjäkalvosin", "olkapään kiertäjälihasten jänteet"],
  [/tendinoo?si\p{L}*/iu, "tendinoosi", "jänteen rappeuma- tai rasitusmuutos"],
  [/tendiniit\p{L}*/iu, "tendiniitti", "jännetulehdus"],
  [/bursiit\p{L}*/iu, "bursiitti", "limapussin tulehdus"],
  [/subakromiaali\p{L}*/iu, "subakromiaalinen", "olkalisäkkeen alla oleva"],
  [/impingement\p{L}*(?:-oireyhtymä\p{L}*)?/iu, "impingement-oireyhtymä", "jänteen pinnetila olkapäässä"],
  [/ruptuur\p{L}*/iu, "ruptuura", "repeämä"],
  [/täyspaksui\p{L}*/iu, "täyspaksuinen", "koko jänteen läpi ulottuva"],
  [/degeneratiivi\p{L}*/iu, "degeneratiivinen", "kulumaan liittyvä"],
  [/artroo?si\p{L}*/iu, "artroosi", "nivelrikko"],
  [/osteofyyt\p{L}*/iu, "osteofyytti", "luun reunan kulumamuutos (luupiikki)"],
  [/effuusio\p{L}*/iu, "effuusio", "nestekertymä"],
  [/skleroo?si\p{L}*/iu, "skleroosi", "luun tiivistymä"],
  [/kalsifikaati\p{L}*|kalkkeum\p{L}*|kalkkeutum\p{L}*/iu, "kalkkeuma", "kalkkikertymä"],
  [/(?<![\p{L}])ac-nivel\p{L}*/iu, "AC-nivel", "solisluun ja lapaluun välinen nivel"],
  [/menisk\p{L}*/iu, "meniski", "polven nivelkierukka"],
  [/lateraali\p{L}*/iu, "lateraalinen", "ulkosyrjän puoleinen"],
  [/mediaali\p{L}*/iu, "mediaalinen", "sisäsyrjän puoleinen"],
  [/fraktuur\p{L}*/iu, "fraktuura", "murtuma"],
  [/dislokaati\p{L}*|dislokoitu\p{L}*/iu, "dislokaatio", "luunpäiden siirtymä"],
  [/stenoo?si\p{L}*/iu, "stenoosi", "ahtauma"],
  [/protruusio\p{L}*/iu, "protruusio", "välilevyn pullistuma"],
  [/ödeem\p{L}*|edeem\p{L}*/iu, "ödeema", "turvotus"],
]);

/**
 * @param {string} s
 * @returns {string[]} selitykset muodossa "termi = selitys"
 */
export function glossaryFor(s) {
  return GLOSSARY.filter(([re]) => re.test(s)).map(([, term, plain]) => `${term} = ${plain}`);
}

/** @param {string} s */
function withGlossary(s) {
  const base = toSentence(expandSafeAbbreviations(s));
  const g = glossaryFor(s);
  return g.length ? `${base} (${g.join("; ")})` : base;
}

/** Varma löydös: lähteen sanamuoto ja kielto säilyvät. @param {string} s */
export function plainFinding(s) {
  return withGlossary(s);
}

/** Tulkinta merkitään aina mahdollisuudeksi, ei varmaksi tiedoksi. @param {string} s */
export function plainInterpretation(s) {
  return `Tutkimuksen tekijän tulkinta: ${withGlossary(s)} Tämä on mahdollinen selitys, ei varma tieto; lääkäri arvioi merkityksen yhdessä oireidesi kanssa.`;
}

/** @param {string} s */
export function plainPlan(s) {
  return withGlossary(s);
}
