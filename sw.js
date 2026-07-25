/* ============================================================
   Ventaglio — service worker
   Versione: v1.0.1   Build: 2026-07-26 17:15 CEST
   Autore  : Dr. Maurizio Monaco

   Da mettere ACCANTO al file HTML quando si pubblica (stessa cartella).
   Non serve se apri il file dal disco: da file:// i service worker
   non sono ammessi dal browser.

   Strategia: il guscio dell'app va in cache e funziona offline;
   le previsioni si prendono sempre dalla rete, perché un meteo
   servito dalla cache è un meteo sbagliato. Se la rete manca,
   si mostra l'ultima risposta ricevuta, che è meglio del vuoto.
   ============================================================ */

const CACHE = "ventaglio-v1";
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
  // guscio e font: prima la cache, aggiornando in sottofondo
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
