/* =====================================================================
   GUARDIÁN DE LA PARTIDA: detecta si alguien edita a mano la partida guardada
   (monedas, tickets, jugadores, mejoras...) desde las herramientas del navegador.
   - Cada vez que el juego guarda algo, se firma todo lo guardado.
   - Al abrir el juego se comprueba la firma: si no cuadra, se recupera la última
     copia buena (también firmada); si tampoco cuadra, la partida empieza de cero.
   - Se carga ANTES que el juego, para que nunca lea datos manipulados.
   ===================================================================== */
const GUARD = (() => {
  const P = Storage.prototype, rawSet = P.setItem, rawGet = P.getItem, rawDel = P.removeItem;
  const LS = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const K_SIG = 'is_sg', K_BK = 'is_bk', K_BKS = 'is_bs', SKIP = new Set(['ss_gfx']);
  const S1 = [105, 122, 117, 45, 103, 117, 97, 114, 100, 45, 55, 51].map(c => String.fromCharCode(c)).join('');
  const S2 = S1.split('').reverse().join('') + '#bk';
  function hash(str, seed){                         // cyrb53 (rápido, 53 bits)
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++){ const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const protectedKey = k => typeof k === 'string' && k.startsWith('ss_') && !SKIP.has(k);
  function snapshot(){
    const keys = [];
    for (let i = 0; i < LS.length; i++){ const k = LS.key(i); if (protectedKey(k)) keys.push(k); }
    keys.sort();
    return JSON.stringify(keys.map(k => [k, rawGet.call(LS, k)]));
  }
  const sigOf = snap => hash(S1 + snap, 7) + '.' + hash(snap + S1, 13);
  const bkSigOf = snap => hash(S2 + snap, 29);
  const enc = s => { try { return btoa(unescape(encodeURIComponent(s))).split('').reverse().join(''); } catch (e) { return ''; } };
  const dec = s => { try { return decodeURIComponent(escape(atob(String(s).split('').reverse().join('')))); } catch (e) { return null; } };
  let bkTimer = null, suspended = false;
  function writeBackup(){ bkTimer = null; try { const snap = snapshot(); rawSet.call(LS, K_BK, enc(snap)); rawSet.call(LS, K_BKS, bkSigOf(snap)); } catch (e) {} }
  function sign(){
    if (!LS || suspended) return;
    try { rawSet.call(LS, K_SIG, sigOf(snapshot())); } catch (e) {}
    if (!bkTimer) bkTimer = setTimeout(writeBackup, 1500);       // la copia de seguridad, un poco después
  }
  function cookieMark(on){ try { document.cookie = on ? 'isg=1; max-age=315360000; path=/; SameSite=Lax' : 'isg=; max-age=0; path=/'; } catch (e) {} }
  const hasCookie = () => { try { return /(?:^|;\s*)isg=1/.test(document.cookie); } catch (e) { return false; } };
  function wipeProtected(){ const del = []; for (let i = 0; i < LS.length; i++){ const k = LS.key(i); if (protectedKey(k)) del.push(k); } del.forEach(k => rawDel.call(LS, k)); }
  function restore(snapStr){ wipeProtected(); try { for (const [k, v] of JSON.parse(snapStr)) if (protectedKey(k) && typeof v === 'string') rawSet.call(LS, k, v); } catch (e) {} }

  let result = 'ok';
  if (LS){
    // comprobación al abrir el juego
    const sig = rawGet.call(LS, K_SIG), snap = snapshot();
    const bkSnap = dec(rawGet.call(LS, K_BK)), bkOk = bkSnap !== null && bkSigOf(bkSnap) === rawGet.call(LS, K_BKS);
    const hasData = snap !== '[]';
    if (!sig){
      if (hasData && (bkOk || hasCookie())){            // la firma ha desaparecido pero el guardián ya estuvo aquí: manipulación
        if (bkOk){ restore(bkSnap); result = 'restored'; } else { wipeProtected(); result = 'reset'; }
      }                                                 // (si nunca hubo guardián: partida antigua, se da por buena)
    } else if (sig !== sigOf(snap)){
      if (bkOk && sig === sigOf(bkSnap)){ restore(bkSnap); result = 'restored'; }
      else if (bkOk){ restore(bkSnap); result = 'restored'; }
      else { wipeProtected(); result = 'reset'; }
    }
    try { rawSet.call(LS, K_SIG, sigOf(snapshot())); } catch (e) {}
    writeBackup(); cookieMark(true);
    // cada vez que el juego guarda (o borra) algo de la partida, se vuelve a firmar
    P.setItem = function(k, v){ const r = rawSet.call(this, k, v); if (this === LS && protectedKey(k)) sign(); return r; };
    P.removeItem = function(k){ const r = rawDel.call(this, k); if (this === LS && protectedKey(k)) sign(); return r; };
    window.addEventListener('storage', e => {           // otra pestaña del juego guardó: su firma ya es la buena
      if (e.key && protectedKey(e.key) && !bkTimer) bkTimer = setTimeout(writeBackup, 1500);
    });
  }
  return {
    result,                                            // 'ok' · 'restored' · 'reset'
    resetAll(){ suspended = true; try { [K_SIG, K_BK, K_BKS].forEach(k => rawDel.call(LS, k)); } catch (e) {} cookieMark(false); },
    resume(){ suspended = false; sign(); },
  };
})();
