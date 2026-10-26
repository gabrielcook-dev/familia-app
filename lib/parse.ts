// Reads a spoken note ("12 at the market and 5 for coffee, yesterday Steph paid 40 for the doctor")
// into Familia entries. Runs on the phone: no AI and no cost. It finds amounts, dates and who paid,
// and picks the category from built-in keywords plus the words in the family's own past entries.

type Categories = { expense: string[]; income: string[] };
type Tok = { raw: string; norm: string; num?: number; kind?: "amount" | "date" | "skip" };

export type Parsed = { type: string; amount: number; category: string; description: string; date: string; who: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const stem = (w: string) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

const SMALL: Record<string, number> = {
  zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  cero: 0, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const ONE = new Set(["one", "a", "un", "una", "uno"]);
const ES_HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
const CURRENCY = new Set(["dollar", "dollars", "dolar", "dolares", "buck", "bucks", "usd", "pesos"]);
const CENTS = new Set(["cent", "cents", "centavo", "centavos", "centimos"]);
const NOT_MONEY = new Set([
  "week", "weeks", "semana", "semanas", "day", "days", "dia", "dias", "hour", "hours", "hora", "horas", "month", "months",
  "mes", "meses", "year", "years", "ano", "anos", "kilo", "kilos", "kg", "libra", "libras", "pound", "pounds", "lb",
  "liter", "liters", "litro", "litros", "time", "times", "vez", "veces", "people", "personas", "piece", "pieces", "pm", "am",
  "percent", "minutes", "minutos",
]);
const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};
const CONNECTORS = new Set(["and", "y", "e", "plus", "also", "then", "mas", "tambien", "luego", "despues"]);
const INCOME_WORDS = ["received", "receive", "got paid", "paid me", "pay me", "payment from", "income", "earned", "deposit", "deposited",
  "sold", "recibi", "recibimos", "me pagaron", "me pago", "nos pagaron", "nos pago", "cobre", "cobramos", "ingreso", "deposito", "gane", "vendi"];
const PEOPLE: Record<string, string> = { steph: "steph", stephanie: "steph", stef: "steph", stefi: "steph", estefania: "steph", gabriel: "gabriel", gabe: "gabriel", gabo: "gabriel" };
const FILLER = new Set([
  "i", "we", "me", "my", "our", "it", "spent", "spend", "paid", "pay", "bought", "buy", "got", "get", "gave", "give", "cost", "costs",
  "was", "were", "is", "today", "yesterday", "last", "the", "a", "an", "at", "on", "in", "for", "of", "to", "from", "with", "some",
  "about", "around", "like", "just", "also", "then", "and", "plus", "this", "that", "morning", "afternoon", "night", "tonight",
  "yo", "nosotros", "gaste", "gasto", "gastamos", "pague", "pago", "pagamos", "pagaron", "compre", "compro", "compramos", "costo",
  "hoy", "ayer", "anteayer", "antier", "pasado", "el", "la", "los", "las", "en", "por", "para", "de", "del", "al", "con", "un", "una",
  "unos", "unas", "y", "e", "mas", "tambien", "luego", "despues", "esta", "manana", "tarde", "noche", "que", "lo", "le", "se", "mi", "mis",
  "received", "receive", "recibi", "earned", "cobre", "me", "nos", "dollar", "dollars", "dolar", "dolares", "bucks", "cents", "centavos", "son", "fue", "fueron",
]);
const VERBS = new Set(["spent", "spend", "paid", "pay", "bought", "buy", "got", "get", "gave", "give", "cost", "costs", "was", "were", "is",
  "received", "receive", "earned", "sold", "sent", "send", "envie", "enviamos", "mande", "gaste", "gasto", "gastamos", "gastaron", "pague", "pago", "pagamos", "pagaron", "compre", "compro",
  "compramos", "compraron", "costo", "recibi", "recibimos", "cobre", "cobramos", "gane", "vendi", "fue", "fueron", "son", "es"]);
const TIME_WORDS = new Set(["today", "yesterday", "hoy", "ayer", "anteayer", "antier", "last", "pasado", "before", "day"]);
const PRONOUNS = new Set(["i", "we", "me", "my", "our", "yo", "nosotros", "nos", "mi"]);
const FIRST_PERSON = new Set(["i", "yo", "pague", "gaste", "compre", "recibi", "cobre", "gane", "vendi"]);
const EDGE = new Set(["for", "at", "on", "in", "of", "to", "from", "with", "the", "a", "an", "and", "en", "por", "para", "de", "del", "al", "con", "el", "la", "los", "las", "un", "una", "y", "e"]);

// Built-in hints, so a new word still lands somewhere sensible. Past entries add to these.
const KEYWORDS: Record<string, string[]> = {
  "Food & Groceries": ["market", "mercado", "supermarket", "supermercado", "super", "groceries", "grocery", "compras", "vegetables", "verduras", "fruit", "fruta", "frutas", "water", "agua", "bread", "pan", "milk", "leche", "eggs", "huevos", "meat", "carne", "chicken", "pollo", "cheese", "queso", "tienda", "panaderia", "bakery", "food", "comida"],
  "Eating Out": ["coffee", "cafe", "lunch", "almuerzo", "dinner", "cena", "breakfast", "desayuno", "restaurant", "restaurante", "pizza", "ice cream", "helado", "snack", "brunch", "takeaway", "delivery"],
  "Rent": ["rent", "arriendo", "alquiler", "renta"],
  "Utilities": ["electricity", "luz", "internet", "wifi", "water bill", "phone bill", "plan", "electric"],
  "Car": ["car", "carro", "auto", "tire", "tires", "llanta", "llantas", "oil", "aceite", "mechanic", "mecanico", "car wash", "lavado", "parking", "parqueadero", "parqueo"],
  "Gas": ["gas", "gasoline", "gasolina", "fuel", "diesel", "gasolinera"],
  "Taxi": ["taxi", "uber", "bus", "ride", "cab", "buseta"],
  "Motorbike": ["moto", "motorbike", "motorcycle", "motocicleta"],
  "Kids": ["toy", "toys", "juguete", "juguetes", "kids", "ninos", "nino", "playground", "kids place"],
  "Medical": ["doctor", "medico", "dentist", "dentista", "pharmacy", "farmacia", "medicine", "medicina", "medicinas", "therapy", "terapia", "hospital", "clinic", "clinica", "pills", "pastillas", "invisalign", "lab", "laboratorio"],
  "Clothing": ["clothes", "ropa", "shoes", "zapatos", "shirt", "camisa", "dress", "vestido", "jeans", "earrings", "aretes"],
  "Cleaning/Nanny": ["nanny", "ninera", "cleaning", "limpieza", "cleaner", "babysitter"],
  "Education": ["school", "escuela", "colegio", "book", "books", "libro", "libros", "course", "curso", "tuition", "class fee", "pension"],
  "Leisure & Travel": ["trip", "viaje", "flight", "vuelo", "plane", "avion", "hotel", "airbnb", "ticket", "movie", "cine", "beach", "playa", "vacation", "vacaciones", "tour"],
  "Personal Care": ["haircut", "corte", "peluqueria", "barber", "massage", "masaje", "cosmetics", "nails", "unas", "shampoo"],
  "Special Events": ["gift", "regalo", "birthday", "cumpleanos", "party", "fiesta", "wedding", "boda", "present"],
  "Gym": ["gym", "gimnasio", "yoga", "pilates", "crossfit"],
  "Business/SS": ["office", "oficina", "taxes", "tax", "impuestos", "sri", "accountant", "contadora", "contador", "software", "subscription", "suscripcion", "business", "negocio", "sacred seed"],
  "Teshna": ["teshna", "tesna", "tena"],
  "Coaching / Consulting": ["coaching", "coach", "session", "sesion", "consulting", "consultoria", "consultation", "mentoring"],
  "Marketing Agency Work": ["agency", "agencia", "marketing", "client", "cliente", "video", "editing", "edicion", "content", "contenido"],
  "Sound Journey": ["sound journey", "sound", "sonido"],
  "Vibraçao": ["vibracao", "dance", "baile", "ecstatic"],
};

function readDigits(raw: string): number | null {
  let s = raw.replace(/^\$/, "");
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("").replace(",", ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    s = parts.length > 2 || tail.length === 3 ? parts.join("") : parts.slice(0, -1).join("") + "." + tail;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /\$?\d+(?:[.,]\d+)*(?:st|nd|rd|th)?|[\p{L}']+|[.!?;,]/gu;
  for (const m of text.matchAll(re)) out.push({ raw: m[0], norm: fold(m[0]).replace(/'/g, "") });
  return out;
}

// Turns runs of number words ("twenty five", "treinta y cinco", "two hundred") into one number token.
function mergeNumberWords(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const isNumWord = (t?: Tok) => !!t && (t.norm in SMALL || t.norm in ES_HUNDREDS || ["hundred", "thousand", "mil"].includes(t.norm));
  while (i < toks.length) {
    const t = toks[i];
    const next = toks[i + 1];
    const startsWithOne = ONE.has(t.norm) && !!next && (CURRENCY.has(next.norm) || ["hundred", "thousand", "mil"].includes(next.norm));
    if (!isNumWord(t) && !startsWithOne) { out.push(t); i++; continue; }
    let total = 0, current = 0, j = i, used: Tok[] = [];
    while (j < toks.length) {
      const w = toks[j].norm;
      if (j === i && startsWithOne) { current = 1; used.push(toks[j]); j++; continue; }
      if (w in SMALL) {
        const v = SMALL[w];
        if (current === 0 || current % 100 === 0) current += v;
        else if (current % 10 === 0 && current % 100 >= 20 && v < 10) current += v;
        else if (current < 100 && v >= 10 && v < 100 && total === 0) { current += v / 100; used.push(toks[j]); j++; break; } // "twelve fifty" = 12.50
        else break;
      } else if (w in ES_HUNDREDS) {
        if (current !== 0) break;
        current = ES_HUNDREDS[w];
      } else if (w === "hundred") current = (current || 1) * 100;
      else if (w === "thousand" || w === "mil") { total += (current || 1) * 1000; current = 0; }
      else if ((w === "and" || w === "y") && isNumWord(toks[j + 1]) && !(toks[j + 1].norm in ES_HUNDREDS)) {
        const v = SMALL[toks[j + 1].norm];
        const joins = w === "y" ? current % 10 === 0 && current >= 30 && current < 100 && v !== undefined && v < 10 : current >= 100 && current % 100 === 0;
        if (!joins) break;
      } else break;
      used.push(toks[j]);
      j++;
    }
    if (!used.length) { out.push(t); i++; continue; }
    out.push({ raw: used.map(u => u.raw).join(" "), norm: used.map(u => u.norm).join(" "), num: total + current });
    i = j;
  }
  for (const t of out) if (t.num === undefined && /^\$?\d/.test(t.raw) && !/(st|nd|rd|th)$/i.test(t.raw)) {
    const n = readDigits(t.raw);
    if (n !== null) t.num = n;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localToday = () => iso(new Date());

// Marks numbers that are dates or quantities, and returns the date the words point to (or null).
function readDate(toks: Tok[], todayIso: string): string | null {
  const [y, m, d] = todayIso.split("-").map(Number);
  const today = new Date(y, m - 1, d);
  const shift = (days: number) => { const x = new Date(today); x.setDate(x.getDate() + days); return iso(x); };
  let found: string | null = null;
  const words = toks.map(t => t.norm);
  for (let i = 0; i < toks.length; i++) {
    const w = words[i];
    if (w === "today" || w === "hoy") found = found ?? shift(0);
    else if (w === "anteayer" || w === "antier" || (w === "yesterday" && words[i - 1] === "before")) found = shift(-2);
    else if (w === "yesterday" || w === "ayer") found = found ?? shift(-1);
    else if (w in WEEKDAYS) {
      let back = (today.getDay() - WEEKDAYS[w] + 7) % 7;
      if (back === 0 && (words[i - 1] === "last" || words[i + 1] === "pasado")) back = 7;
      found = shift(-back);
    } else if (w in MONTHS) {
      const dayTok = toks[i + 1]?.num !== undefined ? toks[i + 1] : /^\d+(st|nd|rd|th)$/.test(words[i + 1] || "") ? toks[i + 1]
        : words[i - 1] === "de" && toks[i - 2]?.num !== undefined ? toks[i - 2] : null;
      const day = dayTok ? parseInt(dayTok.norm) || dayTok.num : null;
      if (day && day >= 1 && day <= 31) {
        dayTok!.kind = "date";
        let when = new Date(today.getFullYear(), MONTHS[w] - 1, day);
        if (when > today) when = new Date(today.getFullYear() - 1, MONTHS[w] - 1, day);
        found = iso(when);
      }
    } else if (/^\d+(st|nd|rd|th)$/.test(w)) {
      const day = parseInt(w);
      if (day >= 1 && day <= 31 && !(words[i - 1] in MONTHS) && !(words[i + 1] in MONTHS)) {
        let when = new Date(today.getFullYear(), today.getMonth(), day);
        if (when > today) when = new Date(today.getFullYear(), today.getMonth() - 1, day);
        found = iso(when);
      }
    }
  }
  return found;
}

function markAmounts(toks: Tok[]) {
  toks.forEach((t, i) => {
    if (t.num === undefined || t.kind) return;
    const next = toks[i + 1]?.norm || "";
    const prev = toks[i - 1]?.norm || "";
    t.kind = NOT_MONEY.has(next) || prev === "las" ? "skip" : "amount";
  });
  // "12 dollars and 50 cents" → one amount of 12.50
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].kind === "amount" && CENTS.has(toks[i + 1]?.norm || "")) {
      const prevAmt = [...toks.slice(0, i)].reverse().find(t => t.kind === "amount");
      const between = toks.slice(toks.indexOf(prevAmt as Tok) + 1, i).map(t => t.norm);
      if (prevAmt && between.every(w => CURRENCY.has(w) || w === "and" || w === "y" || w === "con")) {
        prevAmt.num = (prevAmt.num || 0) + (toks[i].num || 0) / 100;
        toks[i].kind = "skip";
      } else toks[i].num = (toks[i].num || 0) / 100;
    }
  }
}

function buildModel(history: any[]) {
  const counts: Record<string, Record<string, number>> = {};
  for (const t of history) {
    const words = new Set(tokenize(t.description || "").map(x => stem(x.norm)).filter(w => w.length >= 3 && !FILLER.has(w) && !/^\d/.test(w)));
    for (const w of words) {
      counts[w] = counts[w] || {};
      counts[w][t.category] = (counts[w][t.category] || 0) + 1;
    }
  }
  return counts;
}

function scoreCategories(words: string[], text: string, model: Record<string, Record<string, number>>) {
  const score: Record<string, number> = {};
  const add = (c: string, v: number) => { score[c] = (score[c] || 0) + v; };
  const padded = ` ${text} `;
  const stems = words.map(stem);
  for (const [cat, keys] of Object.entries(KEYWORDS))
    for (const k of keys) if (padded.includes(` ${k} `) || (k.length > 3 && stems.includes(stem(k)))) add(cat, k.includes(" ") ? 1.5 : 1);
  for (const w of words) {
    const c = model[stem(w)];
    if (!c) continue;
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const trust = Math.min(1, total / 2);
    for (const [cat, n] of Object.entries(c)) add(cat, 1.2 * trust * (n / total));
  }
  return score;
}

function describe(toks: Tok[]) {
  const kept = toks.filter(t => t.num === undefined && t.kind !== "date" && !/^[.!?;,]$/.test(t.raw) && !CURRENCY.has(t.norm) && !CENTS.has(t.norm)
    && !(t.norm in PEOPLE) && !(t.norm in WEEKDAYS) && !(t.norm in MONTHS) && !/^\d+(st|nd|rd|th)$/.test(t.norm)
    && !VERBS.has(t.norm) && !TIME_WORDS.has(t.norm) && !PRONOUNS.has(t.norm));
  while (kept.length && EDGE.has(kept[0].norm)) kept.shift();
  while (kept.length && EDGE.has(kept[kept.length - 1].norm)) kept.pop();
  const s = kept.map(t => t.raw).join(" ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function parseSpoken(text: string, opts: { speaker: string; today: string; history: any[]; categories: Categories }) {
  const { speaker, today, history, categories } = opts;
  const model = buildModel(history);
  const all = mergeNumberWords(tokenize(text));
  const entries: Parsed[] = [];
  const skipped: string[] = [];

  // Sentences, then pieces split at "and", "y", commas; a piece without an amount joins the next one.
  const sentences: Tok[][] = [[]];
  for (const t of all) { if (/^[.!?;]$/.test(t.raw)) sentences.push([]); else sentences[sentences.length - 1].push(t); }
  let carryDate: string | null = null, carryWho: string | null = null;

  for (const sentence of sentences.filter(s => s.length)) {
    const sDate = readDate(sentence, today);
    markAmounts(sentence);
    const sWho = sentence.map(t => PEOPLE[t.norm]).find(Boolean) || null;
    const amountCount = sentence.filter(t => t.kind === "amount").length;
    if (!amountCount) { carryDate = sDate ?? carryDate; carryWho = sWho ?? carryWho; continue; }

    const pieces: Tok[][] = [[]];
    for (const t of sentence) {
      if (t.raw === "," || (CONNECTORS.has(t.norm) && t.num === undefined)) pieces.push([]);
      else pieces[pieces.length - 1].push(t);
    }
    const merged: Tok[][] = [];
    let pending: Tok[] = [];
    for (const p of pieces) {
      if (!p.length) continue;
      if (!p.some(t => t.kind === "amount")) { pending = pending.concat(p); continue; }
      merged.push(pending.concat(p)); pending = [];
    }
    if (pending.length && merged.length) merged[merged.length - 1] = merged[merged.length - 1].concat(pending);

    // A piece with two amounts ("12 market 5 coffee") splits at each amount.
    const items: Tok[][] = [];
    for (const p of merged) {
      const idx = p.map((t, i) => t.kind === "amount" ? i : -1).filter(i => i >= 0);
      if (idx.length === 1) { items.push(p); continue; }
      idx.forEach((start, k) => items.push(p.slice(k === 0 ? 0 : start, k + 1 < idx.length ? idx[k + 1] : p.length)));
    }

    for (const item of items) {
      const amt = item.find(t => t.kind === "amount");
      if (!amt || !amt.num || amt.num <= 0) continue;
      const itemText = ` ${item.map(t => t.norm).join(" ")} `;
      const words = item.filter(t => t.num === undefined).map(t => t.norm).filter(w => w.length >= 3 && !FILLER.has(w));
      const score = scoreCategories(words, itemText.trim(), model);
      const saysIncome = INCOME_WORDS.some(k => itemText.includes(` ${k} `));
      const bestOf = (list: string[]) => list.reduce((best, c) => (score[c] || 0) > (score[best] || 0) ? c : best, list[list.length - 1]);
      const bestIncome = bestOf(categories.income), bestExpense = bestOf(categories.expense);
      const type = saysIncome || (score[bestIncome] || 0) > Math.max(1, score[bestExpense] || 0) ? "income" : "expense";
      const best = type === "income" ? bestIncome : bestExpense;
      const iWho = item.map(t => PEOPLE[t.norm]).find(Boolean) || (item.some(t => FIRST_PERSON.has(t.norm)) ? speaker : null);
      entries.push({
        type, amount: Math.round(amt.num * 100) / 100, category: best,
        description: describe(item),
        date: readDate(item, today) ?? sDate ?? carryDate ?? today,
        who: iWho || sWho || carryWho || speaker,
      });
    }
    carryDate = null; carryWho = null;
  }

  for (const s of sentences) {
    const words = s.filter(t => t.num === undefined && !FILLER.has(t.norm) && t.raw.length > 2);
    if (words.length && !s.some(t => t.kind === "amount") && !readDate(s, today) && !s.some(t => PEOPLE[t.norm])) skipped.push(s.map(t => t.raw).join(" "));
  }
  return { entries, skipped };
}
