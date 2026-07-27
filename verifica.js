#!/usr/bin/env node
/* ============================================================
   VENTAGLIO — collaudo automatico
   File    : verifica.js
   Versione: v1.0.1
   Build   : 2026-07-28 00:20 CEST

   v1.0.1 — quattro difetti del collaudo stesso, trovati al primo giro:
     · le ridichiarazioni venivano cercate anche dentro le funzioni,
       dove un "const c" e' del tutto legittimo;
     · gli accenti venivano cercati anche nei commenti, dove l'ASCII
       e' voluto;
     · una prova riuscita restituiva un oggetto vuoto e veniva letta
       come fallita;
     · lo schema per estrarre "sd" non reggeva una arrow su due righe.
   Autore  : Dr. Maurizio Monaco

   Uso:  node verifica.js            (nella cartella del progetto)
         node verifica.js /percorso/cartella

   Nessuna dipendenza: solo Node. Esce con codice 1 se qualcosa non va,
   cosi' si puo' agganciare a un hook di pre-commit:
       echo 'node verifica.js || exit 1' > .git/hooks/pre-commit
       chmod +x .git/hooks/pre-commit

   Perche' esiste: index.html supera i 200 KB e viene modificato con
   patch chirurgiche, senza poterlo eseguire. I difetti che sono
   costati piu' tempo — una costante ridichiarata che impediva
   l'avvio, una sezione mai chiusa, variabili accoppiate in una
   richiesta, una soglia statistica troppo blanda — erano tutti
   rilevabili in modo meccanico. Questo file li rileva.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const DIR = process.argv[2] || ".";
const F = n => path.join(DIR, n);

let ok = 0, ko = 0, avvisi = 0;
const esiti = [];

function prova(nome, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) { ok++; esiti.push(["ok", nome, ""]); }
    else if (r && r.avviso) { avvisi++; esiti.push(["avv", nome, r.avviso]); }
    else { ko++; esiti.push(["ko", nome, String(r)]); }
  } catch (e) {
    ko++; esiti.push(["ko", nome, e.message]);
  }
}

/* ---------- lettura ---------- */
let html, js, css, sw;
try {
  html = fs.readFileSync(F("index.html"), "utf8");
  js   = html.split("<script>")[1].split("</script>")[0];
  css  = html.split("<style>")[1].split("</style>")[0];
} catch (e) {
  console.error("Impossibile leggere index.html in", path.resolve(DIR));
  process.exit(1);
}
try { sw = fs.readFileSync(F("sw.js"), "utf8"); } catch (e) { sw = null; }

/* ============================================================
   1. STRUTTURA
   ============================================================ */

prova("sintassi JavaScript valida", () => {
  new (require("vm").Script)(js, { filename: "index.html:script" });
});

prova("sintassi del service worker", () => {
  if (!sw) return { avviso: "sw.js assente" };
  new (require("vm").Script)(sw, { filename: "sw.js" });
});

prova("nessuna costante o funzione ridichiarata", () => {
  // il difetto piu' grave possibile: SyntaxError, l'app non parte
  // solo il livello superiore: senza indentazione. Dentro una funzione
  // un "const c" e' legittimo e non collide con niente.
  const nomi = [
    ...js.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm),
    ...js.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm),
  ].map(m => m[1]);
  const conta = {};
  nomi.forEach(n => conta[n] = (conta[n] || 0) + 1);
  const dup = Object.entries(conta).filter(([, v]) => v > 1);
  return dup.length ? "ridichiarati: " + dup.map(([k, v]) => `${k} (${v}×)`).join(", ") : true;
});

prova("tag bilanciati nel corpo", () => {
  const body = html.split("<body>")[1].split("</body>")[0];
  const guai = [];
  for (const t of ["section", "div", "button", "svg"]) {
    const a = (body.match(new RegExp("<" + t + "[\\s>]", "g")) || []).length;
    const c = (body.match(new RegExp("</" + t + ">", "g")) || []).length;
    if (a !== c) guai.push(`${t}: ${a} aperti / ${c} chiusi`);
  }
  return guai.length ? guai.join(" · ") : true;
});

prova("parentesi graffe del CSS", () =>
  css.split("{").length === css.split("}").length ? true
    : `${(css.match(/{/g) || []).length} aperte, ${(css.match(/}/g) || []).length} chiuse`);

prova("ogni id usato dal JS esiste nell'HTML", () => {
  const definiti = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  // gli id creati a runtime vanno dichiarati qui
  ["numBtn", "calNumeri"].forEach(x => definiti.add(x));
  const usati = new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map(m => m[1]));
  const mancanti = [...usati].filter(x => !definiti.has(x));
  return mancanti.length ? "mancanti: " + mancanti.join(", ") : true;
});

prova("ogni animazione CSS ha i suoi keyframes", () => {
  const kf = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
  const usate = new Set([...css.matchAll(/animation:\s*([\w-]+)/g)].map(m => m[1]));
  usate.delete("none");
  const orfane = [...usate].filter(x => !kf.has(x));
  const inutili = [...kf].filter(x => !usate.has(x));
  if (orfane.length) return "senza definizione: " + orfane.join(", ");
  return inutili.length ? { avviso: "keyframes mai usati: " + inutili.join(", ") } : true;
});

/* ============================================================
   2. VERSIONI E PUBBLICAZIONE
   ============================================================ */

prova("versione allineata fra intestazione e pie' di pagina", () => {
  const a = (html.match(/VENTAGLIO (v[\d.]+)/) || [])[1];
  const b = (html.match(/(v[\d.]+) &middot; build/) || [])[1];
  if (!a || !b) return "versione non trovata";
  return a === b ? true : `intestazione ${a}, pie' di pagina ${b}`;
});

prova("la chiave della cache cambia a ogni pubblicazione", () => {
  if (!sw) return { avviso: "sw.js assente" };
  const c = (sw.match(/const CACHE\s*=\s*"([^"]+)"/) || [])[1];
  if (!c) return "chiave CACHE non trovata in sw.js";
  if (/^ventaglio-v1$/.test(c)) return "chiave fissa: le vecchie copie non verranno mai ripulite";
  const oggi = new Date().toISOString().slice(0, 10);
  return c.includes(oggi.slice(0, 7)) ? true
    : { avviso: `chiave "${c}": ricordati di cambiarla quando pubblichi` };
});

prova("la pagina viene chiesta prima alla rete", () => {
  if (!sw) return { avviso: "sw.js assente" };
  return /req\.mode\s*===\s*"navigate"/.test(sw) ? true
    : "guscio servito dalla cache: un deploy si vedrebbe solo al lancio successivo";
});

/* ============================================================
   3. TESTO VISIBILE
   ============================================================ */

prova("accenti scritti come entita', non con l'apostrofo", () => {
  // nei commenti l'ASCII e' voluto: si controlla solo il codice
  const senzaCommenti = js
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const guasti = [];
  for (const m of senzaCommenti.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const s = m[1];
    if (s.length > 15 && /\b(e|perche|cio|piu|gia|puo|sara|cosi|verra|potra)'/.test(s))
      guasti.push(s.slice(0, 50));
  }
  return guasti.length ? guasti.length + " stringhe: " + guasti[0] + "…" : true;
});

prova("anteprima nelle chat: meta presenti e immagine assoluta", () => {
  const guai = [];
  for (const k of ["og:title", "og:description", "og:image", "og:url"])
    if (!html.includes(`property="${k}"`)) guai.push("manca " + k);
  const img = (html.match(/property="og:image" content="([^"]+)"/) || [])[1];
  if (img && !/^https:\/\//.test(img)) guai.push("og:image non assoluto");
  return guai.length ? guai.join(" · ") : true;
});

prova("titolo e descrizione reggono il taglio del telefono", () => {
  // WhatsApp compatto taglia intorno ai 26 caratteri: li' deve esserci
  // gia' un pensiero compiuto, non una parola spezzata
  const guai = [];
  for (const k of ["og:title", "og:description"]) {
    const v = (html.match(new RegExp(`property="${k}" content="([^"]+)"`)) || [])[1] || "";
    const t = v.slice(0, 26);
    const chiude = /[.;:]$/.test(t.trim()) || v[26] === " " || v.length <= 26;
    if (!chiude) guai.push(`${k} si spezza a metà parola: "${t}"`);
  }
  return guai.length ? guai.join(" · ") : true;
});

prova("immagine di anteprima presente e di peso ragionevole", () => {
  let st; try { st = fs.statSync(F("og.png")); } catch (e) { return "og.png assente"; }
  const kb = st.size / 1024;
  if (kb > 300) return `og.png pesa ${kb.toFixed(0)} KB: sopra i 300 alcune app scartano l'anteprima`;
  const buf = fs.readFileSync(F("og.png"));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w < 600 || h < 315) return `og.png ${w}×${h}: troppo piccola per l'anteprima grande`;
  return true;
});

/* ============================================================
   4. SOGLIE E REGOLE STATISTICHE
   Non verificano il risultato ma che le regole non vengano
   allentate per distrazione.
   ============================================================ */

const regola = (nome, frammento, spiega) =>
  prova(nome, () => js.includes(frammento) ? true : "regola cambiata o rimossa — " + spiega);

regola("pendenza dispersione→errore mai negativa", "if(!(reg.b > 0))",
  "una pendenza negativa direbbe che i modelli sbagliano meno quando divergono");

regola("membri oltre l'orizzonte esclusi, non contati come 0 mm",
  "pp.filter(v=>v!==null).length<12",
  "senza questo controllo si inventano simulazioni asciutte a lunga scadenza");

regola("soglia del fattore pioggia", "nP>=45 && nWet>=15 && sPo>=40 && sP>=20",
  "sotto una quindicina di giornate piovose il rapporto è rumore");

regola("intervallo calibrato solo entro il terzo giorno", "ORIZZONTE_CAL = 2",
  "oltre, il fattore k stimato su D+1 darebbe una precisione falsa");

regola("una sola scala di colore per la pioggia", "const SOGLIE_PIOGGIA",
  "tre scale diverse rendevano incoerenti barre, striscia e traccia");

regola("percentuali orarie da un'unica fonte", "function oraStat",
  "letture da popolazioni diverse mostravano due numeri per la stessa ora");

regola("la pagella annota il fattore pioggia in vigore", "kp:+kp.toFixed(3)",
  "senza, mescolerebbe previsioni corrette e non corrette credendole omogenee");

regola("il rapporto pioggia si conserva anche se non applicato", "fPgrezzo",
  "serve come termine di paragone alla taratura successiva");

regola("radar: l'offset si applica a B, non ad A", "B[(y + dy) * n + (x + dx)]",
  "applicarlo ad A restituisce l'inverso del movimento, cioe' direzioni opposte");

regola("radar: lo zoom si sceglie, non si fissa", "for (const z of [8, 7, 6, 5])",
  "a zoom fisso si finisce a leggere riquadri vuoti credendoli dati");

regola("radar: il punto si legge a piena risoluzione", "const SOG = 60",
  "sulla griglia ridotta un pixel copre 5 km e 'piove qui' perde significato");

regola("il giorno in corso conta solo le ore che restano", "function psumFinestra",
  "sommare le 24 ore fa annunciare a mezzogiorno la pioggia caduta di notte");

regola("gli accumuli passano sempre dagli stessi membri", "for (const m of memDelGiorno(d))",
  "restituire g.psum per i giorni interi cambiava popolazione fra oggi e domani");

/* ============================================================
   5. FUNZIONI DI CALCOLO
   ============================================================ */

function estrai(re, nome) {
  const m = js.match(re);
  if (!m) throw new Error(`${nome}: non trovata nel sorgente`);
  return m[0];
}

prova("statistica di base: media, deviazione, quantile", () => {
  const src = [
    estrai(/const media\s*=[^;]+;/, "media"),
    estrai(/const sd = a =>[\s\S]*?\n\s*return Math\.sqrt[^;]+;\s*\};/, "sd"),
    estrai(/function quantile\([\s\S]*?\n\}/, "quantile"),
  ].join("\n");
  const { media, sd, quantile } = new Function(src + "; return {media,sd,quantile};")();
  const a = [1, 2, 3, 4, 5];
  if (media(a) !== 3) return "media errata";
  if (Math.abs(sd(a) - 1.5811) > 1e-3) return "deviazione errata";
  if (quantile(a, 0.5) !== 3) return "mediana errata";
  if (quantile(a, 0) !== 1 || quantile(a, 1) !== 5) return "estremi errati";
  if (Math.abs(quantile([1, 2], 0.5) - 1.5) > 1e-9) return "interpolazione errata";
  if (quantile([], 0.5) !== null) return "lista vuota non gestita";
  return true;
});

prova("regressione lineare", () => {
  const src = estrai(/const media\s*=[^;]+;/, "media") + "\n"
            + estrai(/function regress\([\s\S]*?\n\}/, "regress");
  const { regress } = new Function(src + "; return {regress};")();
  const x = [], y = [];
  for (let i = 0; i < 20; i++) { x.push(i); y.push(3 + 2 * i); }
  const r = regress(x, y);
  if (Math.abs(r.b - 2) > 1e-6 || Math.abs(r.a - 3) > 1e-6) return "coefficienti errati";
  if (regress([1, 2], [1, 2]) !== null) return "campione minimo non rifiutato";
  const piatta = regress([1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 3, 4, 2, 3, 4, 2, 3, 4]);
  if (piatta.b !== 0) return "varianza nulla non gestita";
  return true;
});

prova("scala di colore della pioggia monotona", () => {
  const src = estrai(/const SOGLIE_PIOGGIA[\s\S]*?\n\}/, "colorePioggia");
  const { colorePioggia } = new Function(src + "; return {colorePioggia};")();
  const scala = [0, 13, 14, 31, 32, 54, 55, 100].map(colorePioggia);
  if (scala[0] === scala[7]) return "asciutto e diluvio hanno lo stesso colore";
  if (colorePioggia(13) === colorePioggia(14)) return "soglia 14 senza effetto";
  if (colorePioggia(54) === colorePioggia(55)) return "soglia 55 senza effetto";
  return true;
});

prova("giudizio sulla copertura dell'intervallo", () => {
  const src = estrai(/function votaCopertura\([\s\S]*?\n\}/, "votaCopertura");
  const { votaCopertura } = new Function(src + "; return {votaCopertura};")();
  if (votaCopertura(80)[0] !== "buono") return "80% dovrebbe essere buono";
  if (votaCopertura(40)[0] !== "brutto") return "40% dovrebbe essere brutto";
  if (votaCopertura(99)[0] !== "brutto") return "99% dovrebbe essere brutto (troppo largo)";
  if (!/stretto/.test(votaCopertura(40)[1])) return "verso dello scarto sbagliato";
  return true;
});

prova("nomi dei giorni oltre dopodomani", () => {
  const src = estrai(/function nomeGiorno\([\s\S]*?\n\}/, "nomeGiorno");
  const { nomeGiorno } = new Function(src + "; return {nomeGiorno};")();
  if (nomeGiorno(0, "2026-07-27") !== "Oggi") return "giorno 0";
  if (nomeGiorno(1, "2026-07-28") !== "Domani") return "giorno 1";
  const g = nomeGiorno(4, "2026-07-31");
  if (!/^[A-Z]/.test(g)) return "nome del giorno senza maiuscola: " + g;
  return true;
});

prova("guardie del fattore pioggia", () => {
  const passa = (nP, nWet, sPo, sP) => nP >= 45 && nWet >= 15 && sPo >= 40 && sP >= 20;
  if (passa(88, 3, 12, 22))  return "un trimestre secco supera la soglia";
  if (passa(88, 4, 9, 17))   return "il vecchio caso (8 mm) supera ancora";
  if (!passa(88, 22, 97, 180)) return "una primavera normale viene rifiutata";
  if (passa(30, 20, 90, 150))  return "pochi giorni utili non vengono rifiutati";
  return true;
});

/* ============================================================
   esito
   ============================================================ */
const S = { ok: "\x1b[32m  ok \x1b[0m", ko: "\x1b[31m FAIL\x1b[0m", avv: "\x1b[33m avv \x1b[0m" };
console.log("\n  VENTAGLIO — collaudo   " + path.resolve(DIR) + "\n");
for (const [s, nome, nota] of esiti)
  console.log(` ${S[s]}  ${nome}${nota ? "\n         " + nota : ""}`);
console.log(`\n  ${ok} superati · ${avvisi} avvisi · ${ko} falliti\n`);
process.exit(ko ? 1 : 0);
