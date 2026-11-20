// Syötteen jäsennys rakenteiseksi välitulokseksi. Jokainen väite säilyttää
// lähdekohdan (merkkiväli), luokan ja alkuperän.

import { segment, sides, regions, isNegated, isUncertain, numbers } from "./text.js";

/**
 * @typedef {"komento"|"perustieto"|"potilaan_kertoma"|"havainto"|"tutkimustulos"|"suunnitelma"} Category
 * @typedef {"kayttaja"|"lahdeasiakirja"|"fraasi"|"ehdotus"} Origin
 * @typedef {{
 *   id: string, text: string, start: number, end: number,
 *   category: Category, origin: Origin,
 *   negated: boolean, uncertain: boolean,
 *   sides: ("oikea"|"vasen"|"molemmat")[], regions: string[], numbers: string[],
 *   header?: string, headerLabel?: string, findingKey?: string,
 *   lineNo?: number, sentenceEnd?: boolean
 * }} Fact
 */

export const CATEGORY_LABEL = /** @type {Record<Category, string>} */ ({
  komento: "Käyttäjän ohje",
  perustieto: "Perustieto",
  potilaan_kertoma: "Potilaan kertoma",
  havainto: "Lääkärin havainto",
  tutkimustulos: "Tutkimustulos",
  suunnitelma: "Suunniteltu toimi",
});

export const ORIGIN_LABEL = /** @type {Record<Origin, string>} */ ({
  kayttaja: "käyttäjän antama tieto",
  lahdeasiakirja: "lähdeasiakirjasta poimittu",
  fraasi: "vahvistettu fraasi",
  ehdotus: "ehdotus (tarkistettava)",
});

/** Otsikot, joilla käyttäjä voi itse merkitä osiot. */
const HEADERS = /** @type {{ re: RegExp, category: Category, origin: Origin, name: string }[]} */ ([
  { re: /^(?:esitiedot|anamneesi|anam|tulosyy|taustat?)\s*(?::|-(?=\s|$))/i, category: "potilaan_kertoma", origin: "kayttaja", name: "Esitiedot" },
  { re: /^(?:nykytila|nyk)\s*(?::|-(?=\s|$))/i, category: "potilaan_kertoma", origin: "kayttaja", name: "Nykytila" },
  { re: /^(?:status|st|statuksessa|kliininen tutkimus|tutkittaessa)\s*\.?\s*(?::|-(?=\s|$))/i, category: "havainto", origin: "kayttaja", name: "Status" },
  { re: /^(?:\p{L}+n\s+){0,3}(?:radiologin lausunto|lausunto|kuvantami\p{L}*|kuvantamislöydös|rtg\p{L}*|röntgen\p{L}*|natiivikuva\p{L}*|magneetti\p{L}*|mri|mk|tt|ct|uä|ultraää\p{L}*|kaikukuva\p{L}*|lab\p{L}*|laboratorio\p{L}*|tutkimukset|tutkimustulokset|ekg)(?:\s+[\p{L}\d.,/-]+){0,4}\s*(?::|-(?=\s|$))/iu, category: "tutkimustulos", origin: "lahdeasiakirja", name: "Tutkimukset" },
  { re: /^(?:aiempi hoito|aiemmat hoidot|hoidot|hoito|hoitohistoria|lääkitys)\s*(?::|-(?=\s|$))/i, category: "potilaan_kertoma", origin: "kayttaja", name: "Esitiedot" },
  { re: /^(?:suunnitelma|jatko|jatkosuunnitelma|hoitosuunnitelma|plan|toimenpiteet)\s*(?::|-(?=\s|$))/i, category: "suunnitelma", origin: "kayttaja", name: "Suunnitelma" },
]);

const COMMAND_RE = /^(?:tee|teen|kirjoita|laadi|muodosta|selitä|tiivistä|korjaa|kirjaa|valmistele|tarvitsen|pyydän|haluan)(?![\p{L}])|^tässä(?![\p{L}])|:$/iu;
const QUESTION_RE = /^(?:kysymy\p{L}*|kysymyksenasettelu|pyydän|pyydetään|toivon|toivotaan|lähettämisen (?:syy|peruste)|lähetteen (?:syy|peruste)|tarkoitus|käyttötarkoitus)(?![\p{L}])/iu;
const PLAN_RE = /(suunnitel\p{L}*|jatkossa|jatketaan|aloitetaan|aloitettu|kontrolli\p{L}*|seuranta\p{L}*|lähetetään|lähete tehty|ohjataan|ohjattu|ohjeistettu|ohjeistan|ohjeistet\p{L}*|tilataan|tilattu|varataan|varattu|resepti\p{L}*|sairausloma\p{L}*|(?<![\p{L}])sl(?![\p{L}])|fysioterap\p{L}*\s+(?:ohjau\p{L}*|lähete)|uusi aika|soitto\p{L}*|tarvittaessa|harkitaan|otetaan|sovittu|sovitaan|jatkohoi\p{L}*|kotihoito-ohje\p{L}*)/iu;
const RESULT_RE = /((?<![\p{L}])rtg(?![\p{L}])|röntgen\p{L}*|natiivikuva\p{L}*|magneetti\p{L}*|(?<![\p{L}])(?:mri|mk|tt|ct|uä|ekg|crp|hb|pvk|leuk\p{L}*|trombo\p{L}*|krea|alat|tsh|t4v|gluk\p{L}*|hba1c|ldl|lab)(?![\p{L}])|ultraää\p{L}*|kaikukuva\p{L}*|laboratorio\p{L}*|radiologi\p{L}*|kuvassa|kuvauksessa|kuvantami\p{L}*|lausunno(?:ssa|n mukaan)|tendinoosi|bursiitti|ruptuura|repeämä|osteofyyt\p{L}*|effuusio|nestekerty\p{L}*|skleroosi|artroosi|kalkkeutu\p{L}*|murtuma\p{L}*)/iu;
const FINDING_RE = /(statu\p{L}*|(?<![\p{L}])st\.|palp\p{L}*|aristaa|arista|(?<![\p{L}])arka(?![\p{L}])|kivulia\p{L}*|liikelaaju\p{L}*|liikkuvuu\p{L}*|abdukt\p{L}*|fleksio|ekstensio|rotaatio|(?<![\p{L}])(?:jobe|hawkins|neer|lasegue|lachman|mcmurray|rr|cor|pulm|p)(?![\p{L}])|turvotu\p{L}*|punoitu\p{L}*|sydä\p{L}*\s+(?:kuuntel|ääne)|keuhko\p{L}*\s+(?:kuuntel|ääne)|auskult\p{L}*|kuunnellen|lämpö\p{L}*\s*\d|tutkittaessa|tutkien|havaitaan|todetaan\s+kliinisesti|refleks\p{L}*|lihasvoim\p{L}*|(?<![\p{L}])voima(?:t)?(?![\p{L}])|tunto|inspekt\p{L}*|atrofi\p{L}*|kävely\p{L}*\s+(?:ontu|norm|sujuu))/iu;
const BASIC_RE = /^(?:\d{1,3}\s?(?:v|vuotias|-vuotias)(?![\p{L}])|(?:mies|nainen|poika|tyttö)(?![\p{L}])|ammatti\p{L}*|työskentelee|työ:|opiskelija)/iu;

/** Statuslöydösten avaimet normaali/poikkeava-vertailuun. */
export const FINDING_KEYS = /** @type {const} */ ([
  ["abduktio", /abdukt/i],
  ["liikelaajuus", /liikelaaju|liikkuvuu|liikerajoit|fleksio|ekstensio|rotaatio|ojennus|koukistus/i],
  ["palpaatioarkuus", /palp|aristaa|arista|(?<![\p{L}])arka(?![\p{L}])|arkuu/iu],
  ["turvotus", /turvo(?:t|ks|nn)|neste(?:ttä|kerty)|effuusio/i],
  ["punoitus", /punoit/i],
  ["lihasvoima", /voima/i],
  ["tunto", /tunto/i],
  ["jobe", /jobe/i],
  ["hawkins", /hawkins/i],
  ["neer", /neer/i],
  ["lasegue", /lasegue/i],
  ["refleksit", /refleks/i],
  ["sydän", /sydä|(?<![\p{L}])cor(?![\p{L}])/iu],
  ["keuhkot", /keuhk|(?<![\p{L}])pulm/iu],
  ["inspektio", /inspekt|atrofi/i],
]);

/** @param {string} s */
export function findingKey(s) {
  return FINDING_KEYS.find(([, re]) => re.test(s))?.[0];
}

const NORMAL_RE = /(normaal\p{L}*|siisti\p{L}*|täysi|täydet|täydellinen|symmetri\p{L}*|rajoittumat\p{L}*|kivuton|kivuttomat|kivuttomasti|(?<![\p{L}])ok(?![\p{L}])|vapaa|vapaat|tavanomai\p{L}*|ei poikkea\p{L}*|negatiivi\p{L}*|(?<![\p{L}])neg(?![\p{L}])|puhdas|puhtaat|tasainen|säännöllinen)/iu;
const ABNORMAL_RE = /(rajoittu\p{L}*|kivulia\p{L}*|kipeä|kipua|(?<![\p{L}])arka(?![\p{L}])|aristaa|arkuutta|heikent\p{L}*|heikko|alentu\p{L}*|lisäänty\p{L}*|positiivi\p{L}*|(?<![\p{L}])pos(?![\p{L}])|turvotusta|turvoksissa|punoitusta|punoittaa|poikkea\p{L}*|vajaa|puuttuu|sivuääni|rahina|vinkuna|atrofi\p{L}*|\+)/iu;

/**
 * Löydöksen suunta: "normaali" | "poikkeava" | undefined.
 * Kielto kääntää oirelöydökset (ei turvotusta = normaali), mutta "ei täysi" = poikkeava.
 * @param {string} s
 * @returns {"normaali"|"poikkeava"|undefined}
 */
export function findingPolarity(s) {
  const neg = isNegated(s) && !/ei poikkea/i.test(s);
  const abn = ABNORMAL_RE.test(s);
  const norm = NORMAL_RE.test(s);
  if (neg && abn) return "normaali";
  if (neg && norm && !/negatiivi|(?<![\p{L}])neg(?![\p{L}])/iu.test(s)) return "poikkeava";
  if (abn && !norm) return "poikkeava";
  if (norm && !abn) return "normaali";
  if (neg) return "normaali";
  return undefined;
}

/**
 * @param {string} s
 * @param {Category | undefined} context
 * @returns {Category}
 */
function classify(s, context) {
  if (COMMAND_RE.test(s.trim()) || QUESTION_RE.test(s.trim())) return "komento";
  if (!context && /\?$/.test(s.trim()) && /(arvio|tarve|tarpee|leikkau|hoido|jatko|kannanot)/i.test(s)) return "komento";
  if (context) {
    // Otsikon alla oleva suunnitelmaverbi ei muuta tutkimustulosta suunnitelmaksi, paitsi selvissä tilaus-tapauksissa.
    if (context === "tutkimustulos" && /(tilataan|varataan|otetaan|lähetetään)/i.test(s)) return "suunnitelma";
    return context;
  }
  if (BASIC_RE.test(s.trim())) return "perustieto";
  if (PLAN_RE.test(s)) return "suunnitelma";
  if (RESULT_RE.test(s)) return "tutkimustulos";
  if (FINDING_RE.test(s)) return "havainto";
  return "potilaan_kertoma";
}

/**
 * @param {string} input
 * @returns {Fact[]}
 */
export function extractFacts(input) {
  /** @type {Fact[]} */
  const facts = [];
  /** @type {{ category: Category, origin: Origin, name: string, label: string } | undefined} */
  let ctx;
  let lastLineStart = -1;
  let lineNo = 0;
  /** Otsikko, jolla oli sisältöä samalla rivillä: konteksti päättyy rivin loppuun. */
  let inlineHeader = false;
  for (const seg of segment(input)) {
    let text = seg.text;
    let start = seg.start;
    // Uusi rivi ilman otsikkoa päättää otsikkokontekstin vain, jos edellinen rivi oli tyhjä.
    const lineStart = input.lastIndexOf("\n", seg.start - 1) + 1;
    if (lineStart !== lastLineStart) {
      const blankBefore = /\n\s*\n\s*$/.test(input.slice(0, lineStart));
      if (blankBefore || inlineHeader) ctx = undefined;
      inlineHeader = false;
      lastLineStart = lineStart;
      lineNo++;
    }
    const header = HEADERS.find((h) => h.re.test(text));
    // Lyhyt alaotsikko otsikon alla ("Status: polvi: ...") toimii nimiönä seuraaville.
    if (!header && ctx && /:$/.test(text) && text.length < 40 && !/^(?:tee|kirjoita|laadi|tässä)(?![\p{L}])/iu.test(text)) {
      ctx = { ...ctx, label: text.replace(/:$/, "").trim() };
      continue;
    }
    if (header) {
      const m = text.match(header.re);
      ctx = { category: header.category, origin: header.origin, name: header.name, label: (m?.[0] ?? "").replace(/[:\-]\s*$/, "").trim() };
      const cut = m ? m[0].length : 0;
      const rest = text.slice(cut);
      const lead = rest.length - rest.trimStart().length;
      start = start + cut + lead;
      text = rest.trim();
      if (!text) continue;
      inlineHeader = true;
    }
    let category = classify(text, ctx?.category);
    let origin = ctx?.origin ?? "kayttaja";
    if (category === "komento") origin = "kayttaja";
    // Lause, joka viittaa kuvantamiseen ilman otsikkoa, on silti lähdeasiakirjan tieto.
    if (category === "tutkimustulos" && !ctx) origin = /lausun|radiologi|kuvassa|kuvauksessa/i.test(text) ? "lahdeasiakirja" : "kayttaja";
    facts.push({
      id: `f${facts.length + 1}`,
      text,
      start,
      end: start + text.length,
      category,
      origin,
      negated: isNegated(text),
      uncertain: isUncertain(text),
      sides: mergeUnique(sides(text), ctx?.label ? sides(ctx.label) : []),
      regions: mergeUnique(regions(text), ctx?.label ? regions(ctx.label) : []),
      numbers: numbers(text),
      ...(ctx ? { header: ctx.name, headerLabel: ctx.label } : {}),
      lineNo,
      sentenceEnd: /[.!?]$/.test(input.slice(seg.start, seg.end)),
      ...(category === "havainto" ? withKey(text) : {}),
    });
  }
  inheritContext(facts);
  return facts;
}

/** @template T @param {T[]} a @param {T[]} b @returns {T[]} */
function mergeUnique(a, b) {
  return [...new Set([...a, ...b])];
}

const GENERIC_LABEL = /^(?:esitiedot|anamneesi|anam|tulosyy|taustat?|nykytila|nyk|status|st|statuksessa|kliininen tutkimus|tutkittaessa|suunnitelma|jatko|jatkosuunnitelma|hoito|hoitosuunnitelma|plan|toimenpiteet|tutkimukset|tutkimustulokset|lausunto|radiologin lausunto|kuvantamislöydös|kuvantaminen)$/i;

/**
 * Lähteen nimiö, joka kuuluu näkyä luonnoksessa (esim. "MRI vas polvi 3.10.2026"), vai undefined geneerisille otsikoille.
 * @param {Fact} f
 */
export function visibleLabel(f) {
  return f.headerLabel && !GENERIC_LABEL.test(f.headerLabel) ? f.headerLabel : undefined;
}

/** @param {string} text */
function withKey(text) {
  const k = findingKey(text);
  return k ? { findingKey: k } : {};
}

/**
 * Muistiinpanoissa alue ja puoli mainitaan usein vain kerran ("oik olkapää 3 vk, yöllä kipua").
 * Peritään alue seuraaville saman luokan fragmenteille vertailua varten (ei tekstiin).
 * @param {Fact[]} facts
 */
function inheritContext(facts) {
  /** @type {string[]} */
  let lastRegions = [];
  for (const f of facts) {
    if (f.category === "komento") continue;
    if (f.regions.length > 0) lastRegions = f.regions;
    else if (lastRegions.length > 0) f.regions = [...lastRegions];
  }
}

/**
 * Lähetteen kohde käskystä ("Tee lähete ortopedille").
 * @param {string} input
 */
export function referralTarget(input) {
  const m = input.match(/lähete\p{L}*\s+(?:\p{L}+\s+)?(\p{L}+(?:lle|lääkärille|poliklinikalle|yksikköön|klinikalle))(?![\p{L}])/iu)
    ?? input.match(/(?<![\p{L}])(\p{L}{4,}(?:lle))\s+lähete/iu);
  return m?.[1];
}

/**
 * Kysymyksenasettelu: vain jos lähde sisältää sen.
 * @param {Fact[]} facts
 */
export function referralQuestion(facts) {
  return facts.filter(
    (f) => !/^(?:tee|kirjoita|laadi|muodosta)(?![\p{L}])/iu.test(f.text) && /(kysymy\p{L}*|pyydä\p{L}*|pyydetään|toivo\p{L}*|arvio\p{L}*\s+(?:leikkau|hoido|tarpee|jatko)|leikkaushoido\p{L}*|harkintaan|konsultaatio\p{L}*|\?$)/iu.test(f.text),
  );
}
