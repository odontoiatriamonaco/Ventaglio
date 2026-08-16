#!/usr/bin/env node
/* ============================================================
   VENTAGLIO — collaudo automatico
   File    : verifica.js
   Versione: v1.7.0
   Build   : 2026-08-13 CEST

   v1.7.0 — una regola sulla PROSA, non sui numeri. La scheda mostrava
   quattro trattini per dire "il movimento non si misura" e sotto prometteva
   "non arriva nulla", che dal movimento discende. Nessuno dei controlli
   guardava le frasi: verificavano che i valori tacessero, non che il testo
   accanto tacesse con loro.

   v1.6.0 — una regola sulla portata utile del radar. Il testo la conosceva
   e la mappa no, quindi la scheda dichiarava "niente nel raggio utile" e
   accanto disegnava un riquadro costruito attorno all'eco che si era
   appena rifiutata di nominare. Stessa famiglia di sempre: due pezzi che
   decidono la stessa cosa con criteri diversi.

   v1.5.0 — due regole sul radar, dopo la terza velocita' impossibile
   stampata come misura. Le prime due volte la correzione era stata locale,
   nel ramo dove il numero era comparso; la causa stava a monte, nella
   finestra di ricerca. Qui si vincola la causa, non il sintomo.

   v1.4.0 — un controllo sulla COERENZA fra pezzi lontani: che la massima
   del giorno non venga riassunta con la media in un punto e con la mediana
   in un altro. E' il difetto che l'app aveva davvero, ed era invisibile a
   tutti gli altri controlli perche' le due righe, prese una alla volta,
   sono entrambe giuste. Quando la stessa grandezza si puo' calcolare in due
   modi, il collaudo deve guardare i modi, non le righe.

   v1.3.0 — quattro controlli mirati alla classe di errore ricorrente:
   pezzi che non si parlano. Valori calcolati e mai usati, chiavi di stato
   scritte con un nome e lette con un altro, caselle toccabili senza il
   loro testo, glifi richiamati e inesistenti. Nessuno di questi produce
   un errore visibile: l'app continua a girare mostrando meno di quanto
   dovrebbe.

   v1.2.0 — aggiunto il controllo su const e let letti prima della loro
   dichiarazione. E' la seconda volta in due giorni che l'app si rompe
   cosi': sintassi valida, ReferenceError a ogni caricamento.

   v1.1.0 — aggiunto il controllo dei nomi chiamati e mai definiti. Mancava,
   e l'app ha girato mezza giornata con una chiamata a una funzione rimossa:
   sintassi valida, ReferenceError a ogni caricamento, verdetto fermo sul
   messaggio d'attesa. Nessuno degli altri trentatre' controlli poteva
   vederlo.

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

/* v1.5.0 — terza volta che esce una velocita' impossibile: 328 km/h in
   v3.72.0, 209 in v3.78.1. Le prime due volte ho spento il sintomo nel
   ramo dove l'avevo visto; la causa era la finestra di ricerca, larga
   abbastanza da contenere spostamenti che nessuna nube compie. */
regola("radar: il raggio di ricerca nasce da una velocita' massima",
  "Math.ceil(KMH_MAX * (dt / 60) / passoKm)",
  "a raggio fisso la finestra ammette spostamenti impossibili: a zoom 5 arrivava a 1300 km/h");

regola("radar: una velocita' inverosimile spegne cio' che ne discende",
  "const inverosimile = kmh > KMH_MAX",
  "senza, direzione, minuti d'arrivo e durata restano stampati come misure");

/* v1.6.0 — il testo e la mappa devono usare la stessa portata utile. Finche'
   solo il testo la conosceva, la scheda diceva "niente nel raggio utile" e
   accanto disegnava settecento chilometri di vuoto, inquadrati attorno a un
   eco che si era appena rifiutata di nominare. */
regola("radar: la mappa rispetta la stessa portata utile del testo",
  "const mappaUtile = dentroPortata",
  "la mappa si costruiva attorno a echi oltre i 200 km, che il testo dichiara inaffidabili");

regola("il giorno in corso conta solo le ore che restano", "function psumFinestra",
  "sommare le 24 ore fa annunciare a mezzogiorno la pioggia caduta di notte");

regola("anche le raffiche seguono la finestra oraria", "function raffFinestra",
  "il massimo di giornata alle 23 e' un picco del pomeriggio, non una previsione");

regola("la norma stagionale richiede un campione minimo", "dentro.length < 30",
  "sotto i trenta giorni il confronto con la media di periodo e' rumore");

regola("gli accumuli passano sempre dagli stessi membri", "for (const m of memDelGiorno(d))",
  "restituire g.psum per i giorni interi cambiava popolazione fra oggi e domani");

prova("nessun nome chiamato e mai definito", () => {
  /* v1.1.0 — il controllo che mancava. La v3.42.0 dell'app chiamava
     mediaPesata(), funzione di un'architettura precedente rimossa da
     tempo: sintassi valida, ReferenceError a ogni caricamento, e nessuno
     dei controlli esistenti se ne accorgeva. Scritto un nome a memoria,
     l'unico modo di beccarlo e' confrontarlo con quelli che esistono. */
  /* v1.1.1 — vanno tolte anche le stringhe, non solo i commenti: dentro ci
     sono funzioni CSS (translateY, rgba, var) e un'icona in base64 che
     sembrano chiamate a codice. Dei letterali con backtick si conserva
     pero' il contenuto di ${...}, che e' codice vero. */
  const senzaCommenti = js
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
    .replace(/`(?:[^`\\]|\\.)*`/g, (t) => (t.match(/\$\{[^}]*\}/g) || []).join(" "))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  const definiti = new Set([
    ...senzaCommenti.matchAll(/function\s+([A-Za-z_$][\w$]*)/g),
    ...senzaCommenti.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g),
    ...senzaCommenti.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function|\()/g),
  ].map(m => m[1]));
  // v1.1.1 — anche le frecce a parametro singolo senza parentesi, tipo
  // "new Promise(ris => ...)": erano finite fra i falsi allarmi
  for (const m of senzaCommenti.matchAll(/(?:^|[(,=\s])([A-Za-z_$][\w$]*)\s*=>/g))
    definiti.add(m[1]);
  // parametri di funzione e destrutturazioni
  for (const m of senzaCommenti.matchAll(/\(([^)]{0,200})\)\s*(?:=>|\{)/g))
    m[1].split(",").forEach(x => {
      const n = x.trim().split(/[\s=:{}\[\]]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(n)) definiti.add(n);
    });
  const noti = new Set(("if for while switch catch return function typeof await async new "
    + "Math Number String Array Object JSON Date Set Map Image Promise Error RegExp "
    + "parseInt parseFloat isNaN isFinite console fetch setTimeout setInterval clearTimeout "
    + "requestAnimationFrame matchMedia encodeURIComponent decodeURIComponent alert eval "
    + "Uint8Array Float32Array Blob navigator document window localStorage caches self "
    + "String Boolean Symbol structuredClone queueMicrotask").split(" "));
  const chiamati = new Set([...senzaCommenti.matchAll(/(?<![.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)]
    .map(m => m[1]));
  const fantasmi = [...chiamati].filter(n =>
    // sopra i 40 caratteri non e' un nome: e' un dato incollato nel codice
    !definiti.has(n) && !noti.has(n) && n.length > 2 && n.length < 40 &&
    !/^(then|catch|filter|map|forEach|push|slice|join|split|replace|toFixed|sort|reduce|some|every|find|includes|indexOf|padStart|toISOString|charAt|toUpperCase|toLowerCase|trim|abs|max|min|round|floor|ceil|sqrt|exp|pow|sin|cos|atan2|hypot|random|from|keys|values|entries|stringify|parse|test|match|matchAll|animate|scrollIntoView|getBoundingClientRect|preventDefault|json|arrayBuffer|register|open|addAll|waitUntil|skipWaiting|of|assign|repeat|startsWith|endsWith|bind|call|apply|concat|reverse|fill|setProperty|remove|contains|blur|focus|hasAttribute|removeAttribute|setAttribute|getAttribute|querySelector|querySelectorAll|createElement|appendChild|addEventListener|getContext|getImageData|drawImage|toLocaleDateString|toLocaleTimeString|toLocaleString|getHours|getUTCHours|getTime|clear|delete|has|get|set|add|toggle|arc|beginPath|stroke|resize|save|item)$/.test(n));
  return fantasmi.length ? "mai definiti: " + fantasmi.join(", ") : true;
});

prova("nessun const o let letto prima di essere dichiarato", () => {
  /* v1.2.0 — due volte in due giorni la stessa rovina: un "let" costruito
     piu' in basso di dove viene usato. A differenza delle funzioni, const e
     let non vengono sollevati: la sintassi resta valida e l'app si spacca a
     ogni caricamento. Qui si guarda dentro ogni funzione, ma solo al livello
     principale del suo corpo: le letture annidate dentro un'altra funzione
     avvengono piu' tardi e sarebbero falsi allarmi. */
  const testo = js
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
    .replace(/`(?:[^`\\]|\\.)*`/g, (t) => (t.match(/\$\{[^}]*\}/g) || []).join(" "))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

  const guai = [];
  for (const m of testo.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    // il corpo della funzione, fino alla graffa che la chiude
    let d = 1, i = m.index + m[0].length;
    const inizio = i;
    while (i < testo.length && d > 0) {
      if (testo[i] === "{") d++;
      else if (testo[i] === "}") d--;
      i++;
    }
    const corpo = testo.slice(inizio, i - 1);

    // profondita' di graffe carattere per carattere: 0 = livello principale
    const liv = new Array(corpo.length);
    let p = 0;
    for (let k = 0; k < corpo.length; k++) {
      if (corpo[k] === "}") p--;
      liv[k] = p;
      if (corpo[k] === "{") p++;
    }
    for (const dec of corpo.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
      if (liv[dec.index] !== 0) continue;              // dichiarato in un blocco interno
      /* v1.2.1 — i contatori dei cicli non contano: "for (let h = 0 ...)"
         sta a livello zero perche' le parentesi tonde non sono graffe, e
         un h di un ciclo precedente lo faceva risultare letto in anticipo. */
      if (/for\s*\(\s*$/.test(corpo.slice(Math.max(0, dec.index - 8), dec.index))) continue;
      const nome = dec[1];
      const re = new RegExp("(?<![.\\w$])" + nome + "(?![\\w$])", "g");
      for (const uso of corpo.matchAll(re)) {
        if (uso.index >= dec.index) break;
        if (liv[uso.index] !== 0) continue;            // letto dentro una funzione annidata
        guai.push(m[1] + "(): " + nome);
        break;
      }
    }
  }
  return guai.length ? guai.join(" \u00B7 ") : true;
});

/* ------------------------------------------------------------
   v1.3.0 — quattro controlli mirati alla classe di errore che si
   ripresenta: pezzi che non si parlano fra loro. Un valore calcolato e
   mai usato, una chiave scritta da una parte e letta con un altro nome,
   un pannello agganciato a un testo che non esiste.
   ------------------------------------------------------------ */
const nudo = js
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'])\/\/.*$/gm, "$1");

prova("nessun valore calcolato e mai usato", () => {
  /* un const che nessuno legge di solito e' un collegamento dimenticato:
     e' cosi' che era nato bloccoMassima, costruito e mai inserito. */
  const guai = [];
  for (const m of nudo.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    let d = 1, i = m.index + m[0].length; const inizio = i;
    while (i < nudo.length && d > 0) { if (nudo[i] === "{") d++; else if (nudo[i] === "}") d--; i++; }
    const corpo = nudo.slice(inizio, i - 1);
    for (const dec of corpo.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
      const nome = dec[1];
      if (nome.length < 3) continue;
      if (/for\s*\(\s*$/.test(corpo.slice(Math.max(0, dec.index - 8), dec.index))) continue;
      const usi = (corpo.match(new RegExp("(?<![.\\w$])" + nome + "(?![\\w$])", "g")) || []).length;
      if (usi <= 1) guai.push(m[1] + "(): " + nome);
    }
  }
  return guai.length ? guai.join(" \u00B7 ") : true;
});

prova("le chiavi di S vengono scritte e lette con lo stesso nome", () => {
  /* un "S.norma" scritto e un "S.normaDati" letto non danno nessun errore:
     restituiscono undefined e il pezzo smette di funzionare in silenzio. */
  /* v1.3.1 — l'espressione precedente usava una negazione in coda al nome,
     e per soddisfarla accorciava il nome stesso: "S.loc" diventava "S.lo".
     Ora il nome si cattura per intero e solo dopo si guarda che cosa segue. */
  const scritte = new Set(), lette = new Set();
  for (const m of nudo.matchAll(/(?<![.\w$])S\.([A-Za-z_$][\w$]*)/g)) {
    const dopo = nudo.slice(m.index + m[0].length);
    (/^\s*=[^=]/.test(dopo) ? scritte : lette).add(m[1]);
  }
  [...nudo.matchAll(/S\s*=\s*\{([\s\S]*?)\};/g)].forEach(m =>
    [...m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].forEach(x => scritte.add(x[1])));
  const orfane = [...lette].filter(k => !scritte.has(k));
  return orfane.length ? "lette ma mai scritte: " + orfane.join(", ") : true;
});

prova("ogni valore toccabile ha la sua spiegazione", () => {
  /* se una casella porta data-sp="pressione" ma nessun testo la produce,
     toccarla non fa niente e sembra che l'app sia rotta. */
  const usate = new Set([...js.matchAll(/data-sp="(\w+)"/g)].map(m => m[1]));
  const prodotte = new Set([...nudo.matchAll(/\bt\.(\w+)\s*=\s*\{/g)].map(m => m[1]));
  const senza = [...usate].filter(k => !prodotte.has(k));
  const inutili = [...prodotte].filter(k => !usate.has(k));
  if (senza.length) return "caselle senza testo: " + senza.join(", ");
  return inutili.length ? { avviso: "testi mai raggiungibili: " + inutili.join(", ") } : true;
});

prova("la massima del giorno si calcola in un modo solo", () => {
  /* v1.4.0 — il numero grande del verdetto usava media(g.tmax); i riquadri
     dei giorni, la scena e il widget quantile(g.tmax,.5). Stesso dato, due
     valori sulla stessa schermata, e lo scarto si apre proprio quando i
     membri divergono. Nessuno dei quaranta controlli poteva vederlo, perche'
     entrambe le righe sono corrette prese da sole: e' la classe di difetto
     piu' ostinata di questo progetto — due pezzi che non si parlano — e qui
     si chiude almeno per una grandezza. */
  const modi = new Set();
  for (const m of nudo.matchAll(/(media|quantile)\s*\(\s*(?:g|G\(\))\.tmax/g)) modi.add(m[1]);
  return modi.size > 1
    ? "g.tmax letta sia con media() sia con quantile(): due numeri per lo stesso dato"
    : true;
});

prova("radar: nessuna promessa sul futuro dove i numeri tacciono", () => {
  /* v1.7.0 — la scheda mostrava quattro trattini, cioe' "il movimento non si
     misura", e sotto prometteva "nelle prossime due ore non arriva nulla",
     che dal movimento discende. La frase era agganciata a "scarto", una
     condizione piu' stretta di "senzaMoto" che governa i trattini. E' la
     seconda volta che il testo e i numeri si scollano sulla stessa scheda:
     la prima fu la v3.73.1, corretta allora sui soli numeri.
     Qui si vieta la forma, non l'occorrenza: una frase in coda a
     "scarto ? ..." parla del movimento con la guardia sbagliata. */
  const m = nudo.match(/scarto\s*\?\s*""\s*:[^;]{0,120}/);
  return m ? "frase agganciata a 'scarto' invece che a senzaMoto: " + m[0].slice(0, 70)
           : true;
});

prova("ogni glifo richiamato esiste", () => {
  const bloc = nudo.match(/const GLIFI\s*=\s*\{[\s\S]*?\n\};/);
  if (!bloc) return "dizionario GLIFI non trovato";
  const definiti = new Set([...bloc[0].matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]));
  const usati = new Set([...nudo.matchAll(/GLIFI\.(\w+)/g)].map(m => m[1]));
  const mancanti = [...usati].filter(g => !definiti.has(g));
  return mancanti.length ? "richiamati ma inesistenti: " + mancanti.join(", ") : true;
});

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
