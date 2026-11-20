// Henkilökohtainen fraasikirjasto: puhtaat funktiot (tallennus erikseen UI:ssa).
// Statusfraasi koostuu yksittäisistä löydöksistä, jotka lääkäri vahvistaa yksitellen.

import { findingKey, findingPolarity } from "./extract.js";
import { sides, regions, isNegated, isUncertain, numbers } from "./text.js";

export const PHRASE_SCHEMA = "laakari-avustaja.fraasit";
export const PHRASE_SCHEMA_VERSION = 1;
export const PURPOSES = ["status", "esitiedot", "suunnitelma", "potilasohje", "lähete", "lausunto", "muu"];
export const PHRASE_REGIONS = ["yleinen", "olkapää", "polvi", "lonkka", "nilkka", "selkä", "niska", "kyynärpää", "ranne", "psyyke", "sydän ja keuhkot"];

/**
 * @typedef {{ id: string, text: string }} PhraseFinding
 * @typedef {{
 *   id: string, title: string, purpose: string, region: string, text: string,
 *   findings: PhraseFinding[], verified: boolean, updated: string
 * }} Phrase
 */

/** Esimerkkifraasit: EI vahvistettuja – lääkärin on tarkistettava ja vahvistettava ennen käyttöä. */
export const EXAMPLE_PHRASES = /** @type {Phrase[]} */ ([
  {
    id: "esim-olkapaa-status",
    title: "Olkapään perusstatus (esimerkki)",
    purpose: "status",
    region: "olkapää",
    text: "",
    findings: [
      { id: "i1", text: "Inspektiossa ei atrofioita" },
      { id: "i2", text: "Abduktio täysi ja kivuton" },
      { id: "i3", text: "Ei palpaatioarkuutta" },
      { id: "i4", text: "Jobe negatiivinen" },
      { id: "i5", text: "Hawkins negatiivinen" },
    ],
    verified: false,
    updated: "2026-11-20",
  },
  {
    id: "esim-polvi-status",
    title: "Polven perusstatus (esimerkki)",
    purpose: "status",
    region: "polvi",
    text: "",
    findings: [
      { id: "p1", text: "Ei turvotusta" },
      { id: "p2", text: "Ei palpaatioarkuutta nivelraoissa" },
      { id: "p3", text: "Liikelaajuudet täydet" },
      { id: "p4", text: "Lachman negatiivinen" },
    ],
    verified: false,
    updated: "2026-11-20",
  },
  {
    id: "esim-kontrolli",
    title: "Kontrolli tarvittaessa (esimerkki)",
    purpose: "suunnitelma",
    region: "yleinen",
    text: "Uusi yhteydenotto, jos oireet pahenevat tai eivät helpota.",
    findings: [],
    verified: false,
    updated: "2026-11-20",
  },
]);

/** @returns {string} */
export function newId() {
  return `fr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * @param {Phrase[]} list
 * @param {{ query?: string, purpose?: string, region?: string }} q
 */
export function searchPhrases(list, q) {
  const words = (q.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => {
    if (q.purpose && p.purpose !== q.purpose) return false;
    if (q.region && p.region !== q.region) return false;
    const hay = `${p.title} ${p.text} ${p.findings.map((f) => f.text).join(" ")} ${p.purpose} ${p.region}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * @param {Phrase[]} list
 * @param {Phrase} phrase
 */
export function upsertPhrase(list, phrase) {
  const p = validatePhrase(phrase);
  if (!p.ok) throw new Error(p.error);
  const i = list.findIndex((x) => x.id === p.value.id);
  return i >= 0 ? list.map((x, j) => (j === i ? p.value : x)) : [...list, p.value];
}

/** @param {Phrase[]} list @param {string} id */
export function deletePhrase(list, id) {
  return list.filter((p) => p.id !== id);
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: Phrase } | { ok: false, error: string }}
 */
export function validatePhrase(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Fraasi ei ole objekti" };
  const r = /** @type {Record<string, unknown>} */ (raw);
  const str = (/** @type {unknown} */ v, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
  const title = str(r.title, 200).trim();
  if (!title) return { ok: false, error: "Fraasilta puuttuu nimi" };
  const findings = Array.isArray(r.findings)
    ? r.findings
        .slice(0, 50)
        .map((f, i) => ({ id: str(/** @type {any} */ (f)?.id, 40) || `l${i + 1}`, text: str(/** @type {any} */ (f)?.text, 500).trim() }))
        .filter((f) => f.text)
    : [];
  const text = str(r.text).trim();
  if (!text && findings.length === 0) return { ok: false, error: `Fraasi ”${title}” on tyhjä` };
  return {
    ok: true,
    value: {
      id: str(r.id, 60) || newId(),
      title,
      purpose: PURPOSES.includes(str(r.purpose)) ? str(r.purpose) : "muu",
      region: str(r.region, 60) || "yleinen",
      text,
      findings,
      verified: r.verified === true,
      updated: str(r.updated, 30) || new Date().toISOString().slice(0, 10),
    },
  };
}

/** @param {Phrase[]} list */
export function exportPhrases(list) {
  return JSON.stringify({ schema: PHRASE_SCHEMA, version: PHRASE_SCHEMA_VERSION, exported: new Date().toISOString(), phrases: list }, null, 2);
}

/**
 * Tuonti yhdistää id:n perusteella. Vahvistukset säilyvät vain pyydettäessä
 * (oma kirjasto toiselta laitteelta); muuten tuodut fraasit on vahvistettava uudelleen.
 * @param {Phrase[]} list
 * @param {string} json
 * @param {{ keepVerification: boolean }} opts
 * @returns {{ list: Phrase[], added: number, updated: number, errors: string[] }}
 */
export function importPhrases(list, json, opts) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return { list, added: 0, updated: 0, errors: ["Tiedosto ei ole kelvollista JSONia"] };
  }
  const d = /** @type {Record<string, unknown>} */ (data ?? {});
  const arr = Array.isArray(data) ? data : d.schema === PHRASE_SCHEMA && Array.isArray(d.phrases) ? d.phrases : null;
  if (!arr) return { list, added: 0, updated: 0, errors: ["Tiedosto ei ole tämän sovelluksen fraasivienti"] };
  let out = [...list];
  let added = 0;
  let updated = 0;
  /** @type {string[]} */
  const errors = [];
  for (const raw of arr.slice(0, 2000)) {
    const v = validatePhrase(raw);
    if (!v.ok) {
      errors.push(v.error);
      continue;
    }
    const p = { ...v.value, verified: opts.keepVerification ? v.value.verified : false };
    const i = out.findIndex((x) => x.id === p.id);
    if (i >= 0) {
      out[i] = p;
      updated++;
    } else {
      out.push(p);
      added++;
    }
  }
  return { list: out, added, updated, errors };
}

/**
 * Lähteeseen sopivat vahvistetut fraasit (alue ja käyttötarkoitus).
 * @param {Phrase[]} list
 * @param {string} input
 */
export function suggestPhrases(list, input) {
  const regs = new Set(regions(input));
  return list.filter((p) => p.verified && (p.region === "yleinen" || regs.has(p.region)));
}

/**
 * Statusfraasin yksittäisten löydösten soveltaminen: vain lääkärin vahvistamat
 * löydökset, ja lähteen poikkeava löydös korvaa ristiriitaisen normaalilöydöksen.
 * @param {Phrase} phrase
 * @param {string[]} confirmedIds
 * @param {"oikea"|"vasen"|""} side
 * @param {import("./extract.js").Fact[]} sourceFacts
 * @returns {{ facts: import("./extract.js").Fact[], notes: { kind: "korvattu"|"puoli"|"vahvistamaton", message: string }[] }}
 */
export function applyStatusPhrase(phrase, confirmedIds, side, sourceFacts) {
  /** @type {import("./extract.js").Fact[]} */
  const facts = [];
  /** @type {{ kind: "korvattu"|"puoli"|"vahvistamaton", message: string }[]} */
  const notes = [];
  if (!phrase.verified) notes.push({ kind: "vahvistamaton", message: `Fraasi ”${phrase.title}” ei ole vahvistettu – tarkista sanamuoto ennen hyväksyntää.` });
  const regionSides = new Set(
    sourceFacts.filter((f) => f.category !== "komento" && (phrase.region === "yleinen" || f.regions.includes(phrase.region))).flatMap((f) => f.sides.filter((s) => s !== "molemmat")),
  );
  if (side && regionSides.size > 0 && !regionSides.has(side)) {
    notes.push({ kind: "puoli", message: `Valittu puoli (${side}) ei vastaa syötteen puolta (${[...regionSides].join(", ")}) – fraasia ei lisätty.` });
    return { facts, notes };
  }
  const prefix = side ? `${side === "oikea" ? "Oikea" : "Vasen"} ${phrase.region}: ` : "";
  let n = 0;
  for (const fnd of phrase.findings) {
    if (!confirmedIds.includes(fnd.id)) continue;
    const key = findingKey(fnd.text);
    const conflicting = key
      ? sourceFacts.find(
          (f) => f.category !== "komento" && findingKey(f.text) === key && findingPolarity(f.text) === "poikkeava" && findingPolarity(fnd.text) === "normaali" &&
            (!side || f.sides.length === 0 || f.sides.includes(side)),
        )
      : undefined;
    if (conflicting) {
      notes.push({ kind: "korvattu", message: `Fraasin löydös ”${fnd.text}” jätettiin pois, koska syötteessä on poikkeava löydös ”${conflicting.text}”.` });
      continue;
    }
    const text = `${n === 0 ? prefix : ""}${fnd.text}`;
    n++;
    facts.push({
      id: `fr-${phrase.id}-${fnd.id}`,
      text,
      start: -1,
      end: -1,
      category: "havainto",
      origin: "fraasi",
      negated: isNegated(text),
      uncertain: isUncertain(text),
      sides: side ? [side] : sides(text),
      regions: phrase.region === "yleinen" ? regions(text) : [phrase.region],
      numbers: numbers(text),
      ...(key ? { findingKey: key } : {}),
    });
  }
  return { facts, notes };
}
