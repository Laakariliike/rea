// Tekstin perusapuvälineet: lauseiksi pilkkominen lähdekohtineen, luvut,
// puolisuus, kiellot ja epävarmuus. Ei riippuvuuksia, toimii selaimessa ja Nodessa.

/**
 * @typedef {{ text: string, start: number, end: number }} Segment
 */

const ABBREVIATIONS = new Set([
  "st", "oik", "vas", "esim", "mm", "ns", "tms", "yms", "klo", "tarv", "n", "ca", "noin", "pot", "dg", "ad", "kl", "ks", "vrt", "lab", "tri", "dr", "s", "p", "rr",
]);

/**
 * Pilkkoo tekstin lauseiksi ja pilkuilla erotetuiksi muistiinpanofragmenteiksi.
 * Desimaalipilkku (3,5) ei katkaise. Jokainen pala säilyttää alkuperäisen
 * merkkivälinsä, jotta valmis lause voidaan jäljittää syötteeseen.
 * @param {string} text
 * @returns {Segment[]}
 */
export function segment(text) {
  /** @type {Segment[]} */
  const out = [];
  let start = 0;
  const push = (/** @type {number} */ s, /** @type {number} */ e) => {
    let a = s;
    let b = e;
    while (a < b && /[\s,;:]/.test(text[a] ?? "")) a++;
    while (b > a && /[\s,;]/.test(text[b - 1] ?? "")) b--;
    if (b > a) out.push({ text: text.slice(a, b), start: a, end: b });
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1] ?? "";
    const next = text[i + 1] ?? "";
    let cut = false;
    if (ch === "\n" || ch === ";" || ch === "!" || ch === "?") cut = true;
    else if (ch === ".") {
      // Ei katkaista desimaaleissa (1.5), päivämäärissä (3.4.2026) eikä tunnetuissa lyhenteissä (st., oik., esim.).
      const decimalOrDate = /\d/.test(prev) && /\d/.test(next);
      const word = (text.slice(Math.max(0, i - 8), i).match(/[\p{L}]+$/u)?.[0] ?? "").toLowerCase();
      const abbrev = ABBREVIATIONS.has(word) || (next !== "" && /\S/.test(next));
      cut = !decimalOrDate && !abbrev;
    } else if (ch === "," || ch === ":") {
      cut = !(/\d/.test(prev) && /\d/.test(next));
    }
    if (cut) {
      const end = ch === "." || ch === "?" || ch === "!" || ch === ":" ? i + 1 : i;
      push(start, end);
      start = i + 1;
    }
  }
  push(start, text.length);
  return out.map((s) => ({ ...s, text: s.text.replace(/[.]$/, "").trim() || s.text }));
}

export const SIDE = /** @type {const} */ ({ RIGHT: "oikea", LEFT: "vasen", BOTH: "molemmat" });

const RIGHT_RE = /(?<![\p{L}])(oik(?:ea|ean|eassa|eaan|easta|eanpuoleinen|ealla|ealle|eat|\.)?|dx|dex(?:ter|tra)?)(?![\p{L}])/iu;
const LEFT_RE = /(?<![\p{L}])(vas(?:en|emma(?:n|ssa|lla|lle|sta|an|t)|empi|\.)?|sin(?:ister|istra)?)(?![\p{L}])/iu;
const BOTH_RE = /(?<![\p{L}])(molemm\p{L}*|bilat\p{L}*|kummankin|kummallakin)(?![\p{L}])/iu;

/**
 * @param {string} s
 * @returns {("oikea"|"vasen"|"molemmat")[]}
 */
export function sides(s) {
  /** @type {("oikea"|"vasen"|"molemmat")[]} */
  const r = [];
  if (BOTH_RE.test(s)) r.push(SIDE.BOTH);
  if (RIGHT_RE.test(s)) r.push(SIDE.RIGHT);
  if (LEFT_RE.test(s)) r.push(SIDE.LEFT);
  return r;
}

/** Anatomiset alueet tunnistusta ja puolisuuden vertailua varten. */
export const REGIONS = /** @type {const} */ ([
  ["olkapää", /olka(?:pää|päässä|pään|päähän|päästä|nivel)|hartia|olkavar|supraspin|infraspin|rotator|kiertäjäkalvos|subakrom|akromio|ac-nivel/i],
  ["polvi", /polv|menisk|patell|eturistisid|takaristisid/i],
  ["lonkka", /lonk|reisiluun kaul/i],
  ["nilkka", /nilk|akillesjän|kantapä/i],
  ["ranne", /rante|ranne|karpaal|kämmen/i],
  ["kyynärpää", /kyynär|epikondyl/i],
  ["selkä", /selkä|selän|lanne|lumbaal|iskias|lasegue/i],
  ["niska", /niska|kaula(?:ranka)?|cervikaal|servikaal/i],
  ["käsi", /(?<!\p{L})käsi|käden|sormi|sormen|peukalo/iu],
  ["jalka", /(?<!\p{L})jalka|jalan|jalkaterä|varvas/iu],
  ["silmä", /silmä|silmän/i],
  ["korva", /korva|korvan/i],
  ["munuainen", /munuai/i],
  ["rinta", /(?<!\p{L})rinta|rinnan|mamma/iu],
]);

/**
 * @param {string} s
 * @returns {string[]}
 */
export function regions(s) {
  return REGIONS.filter(([, re]) => re.test(s)).map(([name]) => name);
}

const NEG_RE = /(?<![\p{L}])(ei|eikä|en|eivät|eivat|emme|negatiivi\p{L}*|neg|ilman|puuttu\p{L}*|poissuljettu|kiist\p{L}*)(?![\p{L}])/iu;
const UNCERTAIN_RE = /(epäil\p{L}*|mahdollis\p{L}*|todennäköi\p{L}*|viittaa\p{L}*|viitannee|sopi(?:i|va|vat|en|sivat)\b|sopii|ei voida sulkea|ei voi sulkea|erotusdiagnost\p{L}*|\bdd\b|ehkä|kenties|vaikuttaa|vaikuttaisi|lienee|saattaa|voi olla|\?|epäselv\p{L}*|harkin\p{L}*|differentiaali\p{L}*|tulkinnanvarai\p{L}*)/iu;
const CERTAIN_CLAIM_RE = /(todettu|todetaan|todettiin|diagnosoitu|varmistettu|varmistui|on todettu)/i;

/** @param {string} s */
export const isNegated = (s) => NEG_RE.test(s);
/** @param {string} s */
export const isUncertain = (s) => UNCERTAIN_RE.test(s);
/** @param {string} s */
export const claimsCertainty = (s) => CERTAIN_CLAIM_RE.test(s);

/**
 * Poimii luvut yksiköineen vertailukelpoiseen muotoon ("400mg" ja "400 mg" -> "400 mg").
 * @param {string} s
 * @returns {string[]}
 */
export function numbers(s) {
  const re = /(\d+(?:[,.]\d+)?(?:\s*[-–/]\s*\d+(?:[,.]\d+)?)?)\s*(mg\/l|mmol\/l|µmol\/l|umol\/l|g\/l|mg|µg|mcg|ug|ml|g|kg|cm|mm|vk|kk|pv|vrk|v(?![\p{L}])|h(?![\p{L}])|x\s?\d|krt|°|astetta|%|\/min|bpm)?/giu;
  /** @type {string[]} */
  const out = [];
  for (const m of s.matchAll(re)) {
    const value = (m[1] ?? "").replace(/\s+/g, "").replace(/–/g, "-").replace(".", ",");
    const unit = (m[2] ?? "").replace(/\s+/g, "").toLowerCase();
    out.push(unit ? `${value} ${unit}` : value);
  }
  return out;
}

/**
 * Pelkät numeroarvot (yksiköt pois), jotta lyhenteen avaus "3 vk" -> "3 viikkoa" ei näy muutoksena.
 * @param {string} s
 */
export function numericValues(s) {
  return numbers(s).map((n) => n.split(" ")[0] ?? n);
}

/**
 * Sanatason vertailu (LCS). Välimerkit ovat omia tokeneitaan.
 * @param {string} a
 * @param {string} b
 * @returns {{ op: "=" | "-" | "+", token: string }[]}
 */
export function wordDiff(a, b) {
  const tok = (/** @type {string} */ x) => x.match(/[\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu) ?? [];
  const A = tok(a);
  const B = tok(b);
  const n = A.length;
  const m = B.length;
  if (n * m > 4_000_000) return [{ op: "-", token: a }, { op: "+", token: b }];
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = /** @type {Uint16Array} */ (L[i]);
    const below = /** @type {Uint16Array} */ (L[i + 1]);
    for (let j = m - 1; j >= 0; j--) {
      row[j] = A[i] === B[j] ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  /** @type {{ op: "=" | "-" | "+", token: string }[]} */
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ op: "=", token: /** @type {string} */ (A[i]) });
      i++;
      j++;
    } else if ((L[i + 1]?.[j] ?? 0) >= (L[i]?.[j + 1] ?? 0)) out.push({ op: "-", token: /** @type {string} */ (A[i++]) });
    else out.push({ op: "+", token: /** @type {string} */ (B[j++]) });
  }
  while (i < n) out.push({ op: "-", token: /** @type {string} */ (A[i++]) });
  while (j < m) out.push({ op: "+", token: /** @type {string} */ (B[j++]) });
  return out;
}

/**
 * Sanojen päällekkäisyys (Jaccard) lauseiden kohdistamiseen.
 * @param {string} a
 * @param {string} b
 */
export function overlap(a, b) {
  const w = (/** @type {string} */ x) =>
    new Set((x.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).map((t) => t.slice(0, 6)));
  const A = w(a);
  const B = w(b);
  if (A.size === 0 || B.size === 0) return 0;
  let k = 0;
  for (const t of A) if (B.has(t)) k++;
  return k / (A.size + B.size - k);
}

/** @param {string} s */
export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Varovainen lyhenteiden avaus: vain yksiselitteiset ja merkityksen säilyttävät.
 * @param {string} s
 */
export function expandSafeAbbreviations(s) {
  return s
    .replace(/^(\d{1,3})\s?v(?![\p{L}])\.?/u, "$1-vuotias")
    .replace(/(\d)\s?vk(?![\p{L}])\.?/gu, "$1 viikkoa")
    .replace(/(\d)\s?kk(?![\p{L}])\.?/gu, "$1 kuukautta")
    .replace(/(\d)\s?pv(?![\p{L}])\.?/gu, "$1 päivää")
    .replace(/(\d)\s?vrk(?![\p{L}])\.?/gu, "$1 vuorokautta")
    .replace(/(?<![\p{L}])pot\.?(?![\p{L}])/giu, "potilas")
    .replace(/(?<![\p{L}])(oik|vas)(?=\s)/giu, "$1.")
    .replace(/(\d)(mg|ml|kg|cm|mm)(?![\p{L}])/gu, "$1 $2");
}

/**
 * Siistii fragmentin lauseeksi muuttamatta sanastoa.
 * @param {string} s
 */
export function toSentence(s) {
  const t = s.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  if (!t) return t;
  const c = capitalize(t);
  return /[.!?:]$/.test(c) ? c : `${c}.`;
}
