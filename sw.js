/* ============================================================
   Ventaglio — service worker
   Versione: v1.1.0   Build: 2026-07-27 16:10 CEST

   CHANGELOG v1.1.0
   - La chiave della cache era fissa a "ventaglio-v1": il blocco di
     activate cancella le cache diverse dalla corrente, ma non essendo
     mai cambiata non ripuliva nulla.
   - Il guscio era servito prima dalla cache e aggiornato in sottofondo:
     dopo un deploy si vedeva la versione nuova solo al lancio SUCCESSIVO.
     Ora per le navigazioni si prova prima la rete, con la cache come
     rete di salvataggio quando si e' offline.
   Autore  : Dr. Maurizio Monaco

   Da mettere ACCANTO al file HTML quando si pubblica (stessa cartella).
   Non serve se apri il file dal disco: da file:// i service worker
   non sono ammessi dal browser.

   Strategia: il guscio dell'app va in cache e funziona offline;
   le previsioni si prendono sempre dalla rete, perché un meteo
   servito dalla cache è un meteo sbagliato. Se la rete manca,
   si mostra l'ultima risposta ricevuta, che è meglio del vuoto.
   ============================================================ */

/* v1.1.0 — va cambiata a ogni pubblicazione: e' cio' che fa ripulire
   le vecchie copie all'attivazione. */
const CACHE = "ventaglio-2026-07-27-a";
const GUSCIO = ["./", "./index.html"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(GUSCIO)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys()
    .then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  const daRete = /open-meteo\.com$/.test(url.hostname) || url.hostname.endsWith("open-meteo.com");

  if(daRete){
    // previsioni: prima la rete, la cache solo come rete di salvataggio
    e.respondWith(
      fetch(req).then(r=>{
        const copia=r.clone();
        caches.open(CACHE).then(c=>c.put(req,copia));
        return r;
      }).catch(()=>caches.match(req))
    );
    return;
  }
  // v1.1.0 — pagina: prima la rete, cosi' un deploy si vede subito.
  // Offline si ripiega sulla copia salvata.
  if(req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html")){
    e.respondWith(
      fetch(req).then(r=>{
        if(r && r.status===200){ const c=r.clone(); caches.open(CACHE).then(x=>x.put(req,c)); }
        return r;
      }).catch(()=>caches.match(req).then(hit=>hit || caches.match("./index.html")))
    );
    return;
  }

  // font e risorse statiche: prima la cache, aggiornando in sottofondo
  e.respondWith(
    caches.match(req).then(hit=>{
      const rete = fetch(req).then(r=>{
        if(r && r.status===200){ const c2=r.clone(); caches.open(CACHE).then(c=>c.put(req,c2)); }
        return r;
      }).catch(()=>hit);
      return hit || rete;
    })
  );
});
