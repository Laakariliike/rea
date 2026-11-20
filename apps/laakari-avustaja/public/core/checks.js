// Turvatarkistukset: usean potilaan aineisto, ristiriidat ja luonnoksen
// vertailu lähteeseen. Tulokset ovat "Tarkista nämä" -listan rivejä.

import { findingPolarity } from "./extract.js";
import { numericValues, sides, isNegated, isUncertain, claimsCertainty, overlap, segment } from "./text.js";

/**
 * @typedef {import("./extract.js").Fact} Fact
 * @typedef {{
 *   id: string,
 *   kind: "pysäytys" | "ristiriita" | "puuttuu" | "epävarma" | "ero" | "huomio",
 *   message: string,
 *   factIds: string[],
 *   blocking: boolean
 * }} Issue
 */

const AGE_RE = /(?<![\p{L}\p{N}])(\d{1,3})\s?(?:v|vuotias|-vuotias|vuotiaa\p{L}*|-v)(?![\p{L}])/giu;
const HETU_RE = /(?<![\p{N}])(\d{6}[-+A-FYXWVU]\d{3}[0-9A-FHJ-NPR-Y])(?![\p{L}\p{N}])/gu;

/**
 * Usean potilaan tai epäselvän identiteetin tunnistus. Palauttaa pysäyttävän havainnon.
 * @param {string} input
 * @returns {Issue[]}
 */
export function identityIssues(input) {
  /** @type {Issue[]} */
  const issues = [];
  const ages = new Set([...input.matchAll(AGE_RE)].map((m) => m[1]));
  const hetus = new Set([...input.matchAll(HETU_RE)].map((m) => m[1]));
  const explicit = /potilas\s*(?:2|b|ii)(?![\p{L}\p{N}])|toinen potilas|seuraava potilas|toisen potilaan|eri potilaa\p{L}*/iu.test(input);
  const sexes = new Set((input.match(/(?<![\p{L}])(mies|nainen|poika|tyttö)(?![\p{L}])/giu) ?? []).map((s) => (/mies|poika/i.test(s) ? "m" : "n")));
  /** @type {string[]} */
  const reasons = [];
  if (ages.size > 1) reasons.push(`useita ikiä (${[...ages].join(" v, ")} v)`);
  if (hetus.size > 1) reasons.push("useita henkilötunnuksen muotoisia tunnisteita");
  if (explicit) reasons.push("maininta toisesta potilaasta");
  if (sexes.size > 1) reasons.push("ristiriitainen sukupuoli");
  if (reasons.length > 0) {
    issues.push({
      id: "identiteetti",
      kind: "pysäytys",
      message: `Syöte näyttää sisältävän usean potilaan tietoja tai identiteetti on epäselvä: ${reasons.join(", ")}. Erota aineistot ennen luonnoksen muodostamista.`,
      factIds: [],
      blocking: true,
    });
  }
  if (hetus.size > 0) {
    issues.push({
      id: "hetu",
      kind: "huomio",
      message: "Syötteessä on henkilötunnuksen muotoinen merkkijono. Prototyypissä käytetään vain keksittyä aineistoa; tunnistetta ei kopioida luonnokseen.",
      factIds: [],
      blocking: false,
    });
  }
  return issues;
}

const MEASURES = /** @type {const} */ ([
  ["RR", /(?<![\p{L}])rr\s*:?\s*(\d{2,3}\s*\/\s*\d{2,3})/giu],
  ["pulssi", /(?<![\p{L}])(?:p|pulssi|syke)\s*:?\s*(\d{2,3})(?![\d/])/giu],
  ["CRP", /(?<![\p{L}])crp\s*:?\s*(\d+(?:[,.]\d+)?)/giu],
  ["Hb", /(?<![\p{L}])hb\s*:?\s*(\d+(?:[,.]\d+)?)/giu],
  ["lämpö", /(?<![\p{L}])(?:lämpö|tempp?\p{L}*|t)\s*:?\s*(3\d(?:[,.]\d)?)/giu],
  ["paino", /(?<![\p{L}])paino\s*:?\s*(\d+(?:[,.]\d+)?)/giu],
  ["NRS/VAS", /(?<![\p{L}])(?:nrs|vas-?asteikk\p{L}*|vas)\s*:?\s*(\d{1,3})(?![\p{L}])/giu],
]);

const TIME_MARKER = /(aiemmin|aikaisemmin|edellisellä|kontrolli\p{L}*|uusinta|nyt|tänään|alussa|lopussa|\d{1,2}\.\d{1,2}\.)/iu;

/**
 * @param {Fact[]} facts
 * @returns {Issue[]}
 */
export function conflictIssues(facts) {
  /** @type {Issue[]} */
  const issues = [];
  const content = facts.filter((f) => f.category !== "komento");

  // 1) Puolisuus: sama alue sekä oikealla että vasemmalla ilman "molemmat".
  /** @type {Map<string, Map<string, Fact[]>>} */
  const byRegion = new Map();
  for (const f of content) {
    const explicitSides = sides(f.text).filter((s) => s !== "molemmat");
    if (explicitSides.length === 0) continue;
    for (const r of f.regions.length > 0 ? f.regions : ["(alue ei mainittu)"]) {
      const m = byRegion.get(r) ?? new Map();
      for (const s of explicitSides) m.set(s, [...(m.get(s) ?? []), f]);
      byRegion.set(r, m);
    }
  }
  const anyBoth = content.some((f) => f.sides.includes("molemmat"));
  for (const [region, m] of byRegion) {
    if (m.has("oikea") && m.has("vasen") && !anyBoth) {
      const ids = [...(m.get("oikea") ?? []), ...(m.get("vasen") ?? [])].map((f) => f.id);
      issues.push({
        id: `puoli-${region}`,
        kind: "ristiriita",
        message: `Puolisuus ristiriidassa (${region}): syötteessä mainitaan sekä oikea että vasen. Vahvista oikea puoli ennen hyväksyntää.`,
        factIds: [...new Set(ids)],
        blocking: true,
      });
    }
  }

  // 2) Normaali vs. poikkeava sama löydös (samalla puolella tai puolta ei eritelty).
  /** @type {Map<string, { normaali: Fact[], poikkeava: Fact[] }>} */
  const byKey = new Map();
  for (const f of content) {
    if (!f.findingKey) continue;
    const pol = findingPolarity(f.text);
    if (!pol) continue;
    const side = f.sides.filter((s) => s !== "molemmat")[0] ?? "*";
    const key = `${f.findingKey}|${f.regions[0] ?? "*"}|${side}`;
    const e = byKey.get(key) ?? { normaali: [], poikkeava: [] };
    e[pol].push(f);
    byKey.set(key, e);
  }
  // Puolettomat ja puolelliset vertaillaan keskenään.
  const keys = [...byKey.keys()];
  for (const k of keys) {
    const [fk, reg, side] = k.split("|");
    const e = byKey.get(k);
    if (!e) continue;
    let normals = [...e.normaali];
    let abnormals = [...e.poikkeava];
    if (side === "*") {
      for (const k2 of keys) {
        const [fk2, reg2] = k2.split("|");
        if (k2 !== k && fk2 === fk && reg2 === reg) {
          normals = normals.concat(byKey.get(k2)?.normaali ?? []);
          abnormals = abnormals.concat(byKey.get(k2)?.poikkeava ?? []);
        }
      }
    }
    if (normals.length > 0 && abnormals.length > 0) {
      const id = `löydös-${fk}-${reg}`;
      if (issues.some((i) => i.id === id)) continue;
      issues.push({
        id,
        kind: "ristiriita",
        message: `Normaali ja poikkeava löydös samasta kohteesta (${fk}): ”${normals[0]?.text}” vs. ”${abnormals[0]?.text}”. Poista tai korjaa ristiriitainen osa.`,
        factIds: [...new Set([...normals, ...abnormals].map((f) => f.id))],
        blocking: true,
      });
    }
  }

  // 3) Ristiriitaiset mittausarvot.
  for (const [name, re] of MEASURES) {
    /** @type {{ value: string, fact: Fact }[]} */
    const vals = [];
    for (const f of content) for (const m of f.text.matchAll(re)) vals.push({ value: (m[1] ?? "").replace(/\s+/g, "").replace(".", ","), fact: f });
    const distinct = new Set(vals.map((v) => v.value));
    if (distinct.size > 1) {
      const timed = vals.some((v) => TIME_MARKER.test(v.fact.text));
      issues.push({
        id: `arvo-${name}`,
        kind: "ristiriita",
        message: timed
          ? `${name}: useita arvoja (${[...distinct].join(", ")}). Tarkista, että ajankohdat on kirjattu oikein.`
          : `${name}: ristiriitaiset arvot (${[...distinct].join(", ")}) ilman ajankohtaa. Vahvista oikea arvo.`,
        factIds: vals.map((v) => v.fact.id),
        blocking: !timed,
      });
    }
  }

  // 4) Saman lääkkeen eri annokset.
  /** @type {Map<string, Set<string>>} */
  const doses = new Map();
  /** @type {Map<string, string[]>} */
  const doseFacts = new Map();
  for (const f of content) {
    for (const m of f.text.matchAll(/(\p{Lu}?\p{L}{3,})\s+(\d+(?:[,.]\d+)?)\s?(mg|g|µg|mcg)(?![\p{L}])/gu)) {
      const drug = (m[1] ?? "").toLowerCase();
      if (/^(annos|noin|yhteensä|päivässä|kerran)$/.test(drug)) continue;
      doses.set(drug, (doses.get(drug) ?? new Set()).add(`${m[2]} ${m[3]}`));
      doseFacts.set(drug, [...(doseFacts.get(drug) ?? []), f.id]);
    }
  }
  for (const [drug, set] of doses) {
    if (set.size > 1) {
      issues.push({
        id: `annos-${drug}`,
        kind: "ristiriita",
        message: `Lääke ”${drug}”: useita annoksia (${[...set].join(", ")}). Tarkista, onko kyse annosmuutoksesta vai virheestä.`,
        factIds: doseFacts.get(drug) ?? [],
        blocking: false,
      });
    }
  }
  return issues;
}

/**
 * Luonnoksen vertailu lähteeseen. Lähde = syöte + vahvistetut fraasit.
 * @param {string} draftText luonnoksen koko teksti
 * @param {Fact[]} facts lähteen väitteet (sis. fraasit)
 * @returns {Issue[]}
 */
export function fidelityIssues(draftText, facts) {
  /** @type {Issue[]} */
  const issues = [];
  const content = facts.filter((f) => f.category !== "komento");
  const src = (/** @type {Fact} */ f) => `${f.headerLabel ?? ""} ${f.text}`;
  const sourceText = content.map(src).join("\n");
  const body = stripPlaceholders(draftText);

  // Luvut: uudet ja puuttuvat (yksiköt pois, jotta "3 vk" = "3 viikkoa").
  const srcNums = new Set(content.flatMap((f) => numericValues(src(f))));
  const outNums = numericValues(body);
  const newNums = [...new Set(outNums.filter((n) => !srcNums.has(n)))];
  if (newNums.length > 0) {
    issues.push({ id: "luku-uusi", kind: "ero", message: `Luonnoksessa on lukuja, joita lähteessä ei ole: ${newNums.join(", ")}.`, factIds: [], blocking: true });
  }
  const outSet = new Set(outNums);
  const missing = content.filter((f) => numericValues(f.text).some((n) => !outSet.has(n)));
  if (missing.length > 0) {
    const vals = [...new Set(missing.flatMap((f) => numericValues(f.text).filter((n) => !outSet.has(n))))];
    issues.push({ id: "luku-puuttuu", kind: "ero", message: `Lähteen luvut puuttuvat luonnoksesta: ${vals.join(", ")}.`, factIds: missing.map((f) => f.id), blocking: false });
  }

  // Puolisuus.
  const srcSides = new Set(content.flatMap((f) => sides(src(f))));
  const outSides = new Set(segment(body).flatMap((s) => sides(s.text)));
  for (const s of outSides) {
    if (!srcSides.has(s)) issues.push({ id: `puoli-uusi-${s}`, kind: "ero", message: `Luonnoksessa mainitaan puoli ”${s}”, jota lähteessä ei ole.`, factIds: [], blocking: true });
  }
  for (const s of srcSides) {
    if (!outSides.has(s)) {
      const ids = content.filter((f) => sides(src(f)).includes(s)).map((f) => f.id);
      issues.push({ id: `puoli-puuttuu-${s}`, kind: "ero", message: `Lähteen puolisuus ”${s}” puuttuu luonnoksesta.`, factIds: ids, blocking: false });
    }
  }

  // Kiellot ja epävarmuus: verrataan parhaiten vastaavaan luonnoksen lauseeseen.
  const outSentences = segment(body).map((s) => s.text);
  for (const f of content) {
    if (!f.negated && !f.uncertain) continue;
    let best = "";
    let score = 0;
    for (const o of outSentences) {
      const sc = overlap(f.text, o);
      if (sc > score) {
        score = sc;
        best = o;
      }
    }
    if (score < 0.25) continue; // ei vastinetta: puuttuminen raportoidaan lukujen/puolien kautta tai ei ole olennainen
    if (f.negated && !isNegated(best)) {
      issues.push({ id: `kielto-${f.id}`, kind: "ero", message: `Kielto saattoi kadota: lähde ”${f.text}” → luonnos ”${best}”.`, factIds: [f.id], blocking: true });
    }
    if (f.uncertain && !isUncertain(best)) {
      issues.push({ id: `epävarma-${f.id}`, kind: "ero", message: `Epävarmuus saattoi kadota: lähde ”${f.text}” → luonnos ”${best}”.`, factIds: [f.id], blocking: true });
    }
  }
  if (claimsCertainty(body) && !claimsCertainty(sourceText)) {
    issues.push({ id: "varmuus", kind: "ero", message: "Luonnoksessa on varmuutta ilmaiseva sana (todettu/diagnosoitu), jota lähteessä ei ole.", factIds: [], blocking: true });
  }
  return issues;
}

/** @param {string} s */
export function stripPlaceholders(s) {
  return s.replace(/\[[^\]]*\]/g, " ");
}
