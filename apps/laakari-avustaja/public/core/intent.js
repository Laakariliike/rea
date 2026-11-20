// Asiakirjatyypin tunnistus. Sääntöpohjainen ja läpinäkyvä: jokainen ehdotus
// kertoo, mikä syötteen kohta sen laukaisi.

/** @typedef {"kertomus"|"lahete"|"bc"|"todistus"|"tutkimustiivistelma"|"potilasselitys"|"konsultaatio"|"hoitosuunnitelma"|"kieliasu"} TaskId */

/** @type {{ id: TaskId, label: string, short: string }[]} */
export const TASKS = [
  { id: "kertomus", label: "Potilaskertomusmerkintä", short: "Merkintä" },
  { id: "lahete", label: "Läheteluonnos", short: "Lähete" },
  { id: "bc", label: "B-/BC-lausunnon luonnos", short: "B/BC-lausunto" },
  { id: "todistus", label: "A-todistuksen tai muun todistuksen valmistelu", short: "Todistus" },
  { id: "tutkimustiivistelma", label: "Tutkimustuloksen tiivistelmä", short: "Tutkimustiivistelmä" },
  { id: "potilasselitys", label: "Selitys potilaalle", short: "Potilaalle" },
  { id: "konsultaatio", label: "Konsultaatiopyyntö", short: "Konsultaatio" },
  { id: "hoitosuunnitelma", label: "Hoito- tai seurantasuunnitelma", short: "Hoitosuunnitelma" },
  { id: "kieliasu", label: "Vain kieliasun korjaus", short: "Kieliasu" },
];

/** @type {{ task: TaskId, re: RegExp, score: number }[]} */
const RULES = [
  { task: "kieliasu", re: /korjaa\s+(?:vain\s+|pelkkä\s+|pelkästään\s+)?(?:kieliasu|kieli|kielioppi|kirjoitusvirhe\p{L}*|oikeinkirjoitu\p{L}*|lyöntivirhe\p{L}*)|vain kieliasu|pelkkä kieliasu|oikolue/iu, score: 12 },
  { task: "bc", re: /(?<![\p{L}])(?:b|bc|c)[- ]?lausun\p{L}*|lääkärinlausunto\s+(?:b|bc|c)(?![\p{L}])|kela(?:n|lle)?\s+(?:varten\s+)?lausun\p{L}*/iu, score: 12 },
  { task: "todistus", re: /(?<![\p{L}])a[- ]?todistu\p{L}*|lääkärintodistu\p{L}*|(?<![\p{L}])todistu(?:s|ksen|sta|kseen|kset)(?![\p{L}])/iu, score: 10 },
  { task: "konsultaatio", re: /konsult\p{L}*/iu, score: 10 },
  { task: "lahete", re: /lähete\p{L}*|lähett\p{L}*|lähetä|remissi\p{L}*/iu, score: 10 },
  { task: "potilasselitys", re: /selitä|selittä\p{L}*|potilaalle\s+ymmärrettäv\p{L}*|ymmärrettäväst\p{L}*|selkokiel\p{L}*|maallikolle|kerro\s+potilaalle|potilasohje\p{L}*/iu, score: 10 },
  { task: "tutkimustiivistelma", re: /tiivistä|tiivistel\p{L}*|tiivistetysti|yhteenveto\s+(?:tutkimu\p{L}*|tulok\p{L}*|lausunno\p{L}*)/iu, score: 9 },
  { task: "hoitosuunnitelma", re: /hoitosuunnitelm\p{L}*|seurantasuunnitelm\p{L}*|seurantateksti\p{L}*|seurantamerkin\p{L}*|seurantakäyn\p{L}*/iu, score: 10 },
  { task: "kertomus", re: /tee\s+merkintä|merkinnä\p{L}*|merkintä|puhtaaksi|potilaskertomu\p{L}*|kirjaa(?![\p{L}])|kirjaus|sanelu\p{L}*|käyntimerkin\p{L}*/iu, score: 9 },
];

/** Heikot vihjeet, kun käskyä ei ole. */
const HINTS = /** @type {{ task: TaskId, re: RegExp, score: number }[]} */ ([
  { task: "tutkimustiivistelma", re: /(?:radiologi\p{L}*|lausunto:|magneetti\p{L}*|\bmri\b|röntgen\p{L}*|\brtg\b|ultraää\p{L}*|\buä\b|\btt\b|laboratorio\p{L}*)/iu, score: 3 },
  { task: "kertomus", re: /(?<![\p{L}\p{N}])\d{1,3}\s?(?:v|vuotias|-vuotias)(?![\p{L}])|kipu|kipua|oire\p{L}*|status/iu, score: 3 },
  { task: "lahete", re: /(?:ortopedi|kirurgi|neurologi|kardiologi|gastro\p{L}*|psykiatri|reumatologi|keuhkolääkäri|erikoissairaanhoi\p{L}*)\p{L}*lle/iu, score: 4 },
]);

/**
 * @typedef {{ task: TaskId, score: number, reason: string }} Candidate
 * @typedef {{ status: "selvä" | "epäselvä" | "tyhjä", candidates: Candidate[] }} IntentResult
 */

/**
 * @param {string} text
 * @returns {IntentResult}
 */
export function detectIntent(text) {
  const t = text.trim();
  if (t.length === 0) return { status: "tyhjä", candidates: [] };
  /** @type {Map<TaskId, Candidate>} */
  const best = new Map();
  const consider = (/** @type {{ task: TaskId, re: RegExp, score: number }} */ r) => {
    const m = t.match(r.re);
    if (!m) return;
    const prev = best.get(r.task);
    const score = r.score + (prev ? 1 : 0);
    if (!prev || score > prev.score) best.set(r.task, { task: r.task, score, reason: `”${m[0].trim()}”` });
  };
  for (const r of RULES) consider(r);
  // Selitä tämä lausunto potilaalle: "lausunto" ei tarkoita B-lausuntoa.
  if (best.has("potilasselitys") && best.has("bc") && !/(?<![\p{L}])(?:b|bc)[- ]?lausun/iu.test(t)) best.delete("bc");
  // Kieliasupyyntö ohittaa muut, kun se on nimenomainen.
  const strong = [...best.values()].filter((c) => c.score >= 9);
  if (strong.length === 0) for (const h of HINTS) consider(h);
  const candidates = [...best.values()].sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const second = candidates[1];
  if (!top) return { status: "epäselvä", candidates: defaultCandidates() };
  const clear = top.score >= 9 && (!second || top.score - second.score >= 2 || top.task === "kieliasu");
  return { status: clear ? "selvä" : "epäselvä", candidates: candidates.slice(0, 3) };
}

/** @returns {Candidate[]} */
function defaultCandidates() {
  return [
    { task: "kertomus", score: 1, reason: "yleisin tehtävä" },
    { task: "tutkimustiivistelma", score: 1, reason: "vaihtoehto" },
    { task: "lahete", score: 1, reason: "vaihtoehto" },
  ];
}

/** @param {TaskId} id */
export function taskLabel(id) {
  return TASKS.find((t) => t.id === id)?.label ?? id;
}
