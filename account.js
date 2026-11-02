/* =====================================================================
   CUENTAS, PARTIDA EN LA NUBE Y RANKING GLOBAL (Supabase, plan gratis)
   - Sin librerías: se habla con Supabase por su API (fetch).
   - Cuentas con usuario + contraseña (email interno, sin confirmación) o con Google.
   - La partida (claves ss_* del navegador) se sube sola unos segundos después de cada cambio.
   - Récords: al acabar un partido se envía tiempo, eliminaciones y bosses; el servidor los comprueba.
   - Versión de pruebas: guarda en un hueco aparte ('test') y NO sube récords.
   ===================================================================== */
const SB = { url: 'https://gzzhbnfzmuxdfihpiqyo.supabase.co', key: 'sb_publishable_KG2PMCA2BM3a8pFGKYUJiw_K8W-B0SO' };
const ACC_KEY = 'is_auth';                      // sesión guardada (no empieza por ss_: no viaja en la partida)
/* email interno de las cuentas de usuario y contraseña: Supabase solo acepta dominios reales, así que se usa una
   subdirección del Gmail del proyecto (nunca se envía nada: la confirmación por email está desactivada) */
const accMail = u => `migueldelatorreprz+is_${u.toLowerCase()}@gmail.com`;
const ACC_VERSION = 'v89';
const ACC_DEV = (typeof DEV_ULTS !== 'undefined' && DEV_ULTS) || (typeof DEV_INFINITE !== 'undefined' && DEV_INFINITE) || (typeof DEV_UNLOCK !== 'undefined' && DEV_UNLOCK);
const ACC_SLOT = ACC_DEV ? 'test' : 'main';     // hueco de la partida en la nube
const ACC_SKIP = new Set(['ss_gfx']);           // ajustes que dependen del ordenador
const ACC = { session: null, profile: null, cloud: null, dirty: false, timer: null, busy: false, lastSync: 0, status: '' };

/* ---------- peticiones ---------- */
async function sbFetch(path, { method = 'GET', body, auth = true, prefer, keepalive } = {}){
  const h = { apikey: SB.key, 'Content-Type': 'application/json' };
  if (auth && ACC.session) h.Authorization = 'Bearer ' + ACC.session.access_token;
  if (prefer) h.Prefer = prefer;
  const r = await fetch(SB.url + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), keepalive });
  const txt = await r.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!r.ok){ const msg = (data && (data.msg || data.message || data.error_description || data.error)) || ('Error ' + r.status); const err = new Error(msg); err.status = r.status; err.data = data; throw err; }
  return data;
}
const sbRpc = (fn, args, auth = true) => sbFetch('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {}, auth });

/* ---------- sesión ---------- */
function accStore(s){
  ACC.session = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600)), user: s.user || (ACC.session && ACC.session.user) } : null;
  try { if (ACC.session) localStorage.setItem(ACC_KEY, JSON.stringify(ACC.session)); else localStorage.removeItem(ACC_KEY); } catch (e) {}
}
async function accRefresh(){
  if (!ACC.session || !ACC.session.refresh_token) return false;
  try { const s = await sbFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: ACC.session.refresh_token }, auth: false }); accStore(s); return true; }
  catch (e){ if (e.status === 400 || e.status === 401) accStore(null); return false; }
}
async function accEnsure(){                       // renueva el token si caduca en menos de 2 minutos
  if (!ACC.session) return false;
  if (ACC.session.expires_at - Date.now() / 1000 < 120) return accRefresh();
  return true;
}
const accName = u => String(u || '').trim();
const accValidName = u => /^[A-Za-z0-9_]{3,16}$/.test(u);
async function accSignUp(user, pass){
  user = accName(user);
  if (!accValidName(user)) throw new Error('El nombre debe tener de 3 a 16 letras, números o _');
  if (String(pass).length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  const free = await sbRpc('username_available', { p_name: user }, false);
  if (!free) throw new Error('Ese nombre ya está cogido');
  const s = await sbFetch('/auth/v1/signup', { method: 'POST', auth: false, body: { email: accMail(user), password: pass, data: { username: user } } });
  if (!s || !s.access_token) throw new Error('Cuenta creada, pero falta desactivar "Confirm email" en Supabase');
  accStore(s); await accAfterLogin(true);
}
async function accSignIn(user, pass){
  user = accName(user);
  if (!user || !pass) throw new Error('Escribe tu usuario y tu contraseña');
  try {
    const s = await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: accMail(user), password: pass } });
    accStore(s);
  } catch (e){ if (e.status === 400) throw new Error('Usuario o contraseña incorrectos'); throw e; }
  await accAfterLogin(false);
}
function accGoogle(){
  if (location.protocol === 'file:'){ accMsg('El acceso con Google solo funciona en la web publicada del juego.', true); return; }
  const back = location.origin + location.pathname;
  location.href = `${SB.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}
async function accSignOut(){
  await accFlush();
  try { if (ACC.session) await sbFetch('/auth/v1/logout', { method: 'POST' }); } catch (e) {}
  accStore(null); ACC.profile = null; ACC.cloud = null; accRender(); accBadge();
}
async function accDelete(){
  if (!confirm('¿Seguro que quieres BORRAR tu cuenta?\n\nSe borra TODO: tu nombre, tu partida en la nube, tus récords del ranking y también la partida de este navegador (jugadores, monedas, tickets, mejoras y misiones). Empezarás desde cero. No se puede deshacer.')) return;
  await accEnsure(); await sbRpc('delete_me');
  clearTimeout(ACC.timer); ACC.dirty = false; ACC.applying = true; accStore(null); ACC.profile = null; ACC.cloud = null;
  try { Object.keys(localStorage).filter(k => k.startsWith('ss_') || k.startsWith('is_')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  alert('Cuenta borrada. El juego empieza de nuevo desde cero.');
  location.reload();
}
async function accLoadProfile(){
  const uid = ACC.session && ACC.session.user && ACC.session.user.id; if (!uid) return;
  const r = await sbFetch(`/rest/v1/profiles?id=eq.${uid}&select=username`);
  ACC.profile = r && r[0] ? r[0] : { username: '?' };
}

/* ---------- partida en la nube ---------- */
function accLocalSnapshot(){
  const keys = {};
  for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && k.startsWith('ss_') && !ACC_SKIP.has(k)) keys[k] = localStorage.getItem(k); }
  return keys;
}
function accSummary(keys){
  const num = k => Number(keys && keys[k]) || 0; let players = 0;
  try { players = JSON.parse((keys && keys.ss_unlocked) || '[]').length; } catch (e) {}
  return { coins: num('ss_coins'), tY: num('ss_tickets'), tP: num('ss_tickets_epic'), players };
}
const accSumTxt = s => `${s.players} jugadores · ${s.coins} monedas · ${s.tY} tickets amarillos · ${s.tP} morados`;
function accHasProgress(keys){ const s = accSummary(keys); return s.players > 0 || s.coins > 0 || s.tY > 0 || s.tP > 0; }
async function accPull(){
  const uid = ACC.session.user.id;
  const r = await sbFetch(`/rest/v1/saves?user_id=eq.${uid}&select=data,updated_at`);
  ACC.cloud = r && r[0] ? (r[0].data || {}) : {};
  return ACC.cloud[ACC_SLOT] || null;
}
async function accPush(keepalive = false){
  if (!ACC.session || ACC.busy || ACC.cloud === null) return;   // hasta leer la nube no se sube nada
  ACC.busy = true;
  try {
    if (!(await accEnsure())) return;
    const local = accLocalSnapshot(), prev = ACC.cloud && ACC.cloud[ACC_SLOT];
    if (!accHasProgress(local) && prev && accHasProgress(prev.keys)) return;   // nunca se pisa una partida con progreso por una vacía (p. ej. al borrar la del navegador)
    const data = Object.assign({}, ACC.cloud || {}); data[ACC_SLOT] = { at: Date.now(), v: ACC_VERSION, keys: local };
    await sbFetch('/rest/v1/saves?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', keepalive,
      body: { user_id: ACC.session.user.id, data, updated_at: new Date().toISOString() } });
    ACC.cloud = data; ACC.dirty = false; ACC.lastSync = Date.now(); ACC.status = ''; try { localStorage.setItem('is_sync_at', String(data[ACC_SLOT].at)); } catch (e) {}
  } catch (e){ ACC.status = 'No se pudo guardar en la nube: ' + e.message; }
  finally { ACC.busy = false; accRender(true); }
}
function accApply(slot){                          // sustituye la partida del navegador por la de la nube y recarga
  const keep = new Set([...ACC_SKIP, 'ss_welcome']);
  const del = []; for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && k.startsWith('ss_') && !keep.has(k)) del.push(k); }
  ACC.applying = true;
  try { localStorage.setItem('is_sync_at', String(slot.at || Date.now())); } catch (e) {}
  del.forEach(k => localStorage.removeItem(k));
  for (const [k, v] of Object.entries(slot.keys || {})) localStorage.setItem(k, v);
  location.reload();
}
function accChoose(cloudSlot){                    // hay partida en los dos sitios: el jugador elige
  return new Promise(res => {
    const ov = document.getElementById('account-overlay'); if (!ov) return res('local');
    const L = accSummary(accLocalSnapshot()), C = accSummary(cloudSlot.keys);
    document.getElementById('acc-body').innerHTML = `
      <section class="sp-box"><h4 class="sp-title">¿Qué partida quieres usar?</h4>
        <p class="acc-p">Tu cuenta ya tiene una partida guardada y este navegador tiene otra.</p>
        <button class="acc-pick" data-v="cloud"><b>La de mi cuenta (nube)</b><small>${accSumTxt(C)}</small></button>
        <button class="acc-pick" data-v="local"><b>La de este navegador</b><small>${accSumTxt(L)} · sustituye a la de la nube</small></button>
      </section>`;
    ov.classList.remove('hidden');
    ov.querySelectorAll('.acc-pick').forEach(b => b.onclick = () => res(b.dataset.v));
  });
}
async function accAfterLogin(isNew){
  await accLoadProfile();
  const cloud = await accPull();
  const local = accLocalSnapshot();
  if (cloud && accHasProgress(cloud.keys)){
    if (!accHasProgress(local)){ accApply(cloud); return; }
    if (JSON.stringify(cloud.keys) !== JSON.stringify(local)){
      const pick = await accChoose(cloud);
      if (pick === 'cloud'){ accApply(cloud); return; }
    }
  }
  await accPush();                                 // sube la de este navegador (cuenta nueva o elegida)
  accBadge(); accRender();
  accMsg(isNew ? `¡Cuenta creada! Bienvenido, ${ACC.profile.username}.` : `Hola, ${ACC.profile.username}. Tu partida está sincronizada.`);
}
/* guardado automático: cualquier cambio en las claves ss_* programa una subida */
function accMarkDirty(){
  if (!ACC.session || ACC.applying) return;
  ACC.dirty = true; clearTimeout(ACC.timer);
  const wait = Math.max(6000, 20000 - (Date.now() - ACC.lastSync));
  ACC.timer = setTimeout(() => accPush(), wait);
}
async function accFlush(){ if (ACC.dirty){ clearTimeout(ACC.timer); await accPush(); } }
(function hookStorage(){
  const P = Storage.prototype, si = P.setItem, ri = P.removeItem;
  P.setItem = function(k, v){ si.call(this, k, v); if (this === window.localStorage && typeof k === 'string' && k.startsWith('ss_') && !ACC_SKIP.has(k)) accMarkDirty(); };
  P.removeItem = function(k){ ri.call(this, k); if (this === window.localStorage && typeof k === 'string' && k.startsWith('ss_') && !ACC_SKIP.has(k)) accMarkDirty(); };
})();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && ACC.dirty) accPush(true); });

/* ---------- ranking ---------- */
async function accSubmitRun(){
  if (!match || match.rlSetup || ACC_DEV) return null;
  if (!ACC.session) return null;
  if (matchClock() < 10) return null;                  // partidos de menos de 10 s no cuentan
  await accEnsure();
  const res = await sbRpc('submit_run', { p_mode: match.rl ? 'rl' : 'normal', p_time: Math.max(0, Math.floor(matchClock())), p_kills: match.kills || 0,
    p_bosses: match.bossesBeaten || 0, p_char: match.charDef ? match.charDef.id : null, p_version: ACC_VERSION });
  const rank = await sbRpc('my_rank', { p_mode: match.rl ? 'rl' : 'normal', p_metric: 'time' }).catch(() => null);
  return { res, rank };
}
if (typeof endMatch === 'function'){
  const _endMatchAcc = endMatch;
  endMatch = function(...a){
    const wasOver = match && match.over;
    const r = _endMatchAcc.apply(this, a);
    if (wasOver || !match || match.revivable) return r;
    const box = document.getElementById('gameover-stats'); if (!box) return r;
    const line = document.createElement('div'); line.className = 'acc-run';
    if (ACC_DEV) line.innerHTML = '<small>Versión de pruebas: este partido no sube al ranking</small>';
    else if (!ACC.session) line.innerHTML = '<button class="acc-run-btn" type="button">Inicia sesión para subir tus récords al ranking</button>';
    else { line.innerHTML = '<small>Subiendo al ranking…</small>';
      accSubmitRun().then(x => { if (!x) return line.remove();
        const r0 = x.res || {};
        line.innerHTML = (r0.improved ? '<b class="new-record">¡Nueva marca en el ranking global!</b>' : '<small>Récord enviado al ranking</small>') + (x.rank ? ` <small>· Puesto #${x.rank} en tiempo</small>` : '');
      }).catch(e => { line.innerHTML = `<small>No se pudo subir al ranking (${e.message})</small>`; }); }
    box.appendChild(line);
    const b = line.querySelector('.acc-run-btn'); if (b) b.onclick = () => accOpen();
    return r;
  };
}
const RK = { mode: 'normal', metric: 'time' };
const accFmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
async function rankOpen(){
  const ov = document.getElementById('ranking-overlay'); if (!ov) return;
  ov.classList.remove('hidden'); rankRender();
}
async function rankRender(){
  const list = document.getElementById('rk-list'), me = document.getElementById('rk-me');
  document.querySelectorAll('#ranking-overlay [data-rk-mode]').forEach(b => b.classList.toggle('on', b.dataset.rkMode === RK.mode));
  document.querySelectorAll('#ranking-overlay [data-rk-metric]').forEach(b => b.classList.toggle('on', b.dataset.rkMetric === RK.metric));
  list.innerHTML = '<p class="acc-p">Cargando…</p>'; me.textContent = '';
  try {
    const rows = await sbRpc('get_leaderboard', { p_mode: RK.mode, p_metric: RK.metric, p_limit: 100 }, false);
    if (!rows || !rows.length){ list.innerHTML = '<p class="acc-p">Todavía no hay récords. ¡Sé el primero!</p>'; }
    else list.innerHTML = `<table class="rk-table"><thead><tr><th>#</th><th>Jugador</th><th>Con</th><th>${RK.metric === 'kills' ? 'Eliminaciones' : 'Tiempo'}</th><th>Bosses</th></tr></thead><tbody>` +
      rows.map(r => { const c = CHARACTERS.find(x => x.id === r.char_id); const mine = ACC.profile && r.username === ACC.profile.username;
        return `<tr class="${mine ? 'me' : ''} ${r.rank <= 3 ? 'top' + r.rank : ''}"><td>${r.rank}</td><td>${String(r.username).replace(/[<>&]/g, '')}</td>
          <td class="rk-char">${c ? charFace(c, 28) + `<span>${c.nick || c.name}</span>` : '—'}</td>
          <td><b>${RK.metric === 'kills' ? r.value : accFmtTime(r.value)}</b></td><td>${r.bosses}</td></tr>`; }).join('') + '</tbody></table>';
    if (ACC.session){ await accEnsure(); const p = await sbRpc('my_rank', { p_mode: RK.mode, p_metric: RK.metric }).catch(() => null);
      me.textContent = p ? `Tu puesto: #${p}` : 'Aún no tienes marca en este ranking'; }
    else me.textContent = 'Inicia sesión para aparecer en el ranking';
  } catch (e){ list.innerHTML = `<p class="acc-p">No se pudo cargar el ranking (${e.message}).</p>`; }
}

/* ---------- interfaz ---------- */
function accMsg(t, err){ const m = document.getElementById('acc-msg'); if (m){ m.textContent = t || ''; m.classList.toggle('err', !!err); } }
function accBadge(){
  const b = document.getElementById('btn-account'); if (!b) return;
  b.title = ACC.session ? `Cuenta: ${ACC.profile ? ACC.profile.username : ''}` : 'Cuenta (iniciar sesión)';
  b.classList.toggle('logged', !!ACC.session);
  const pill = document.getElementById('acc-name-pill');
  if (pill){ const n = ACC.session && ACC.profile ? ACC.profile.username : '';
    pill.textContent = n; pill.classList.toggle('hidden', !n); }
}
let accTab = 'in';
function accRender(soft){
  const body = document.getElementById('acc-body'); if (!body) return;
  if (soft && !ACC.session) return;
  if (soft){ const st = document.getElementById('acc-sync'); if (st) st.textContent = accSyncTxt(); return; }
  const devNote = ACC_DEV ? '<p class="acc-note">Versión de pruebas: se guarda aparte de tu partida real y no sube récords al ranking.</p>' : '';
  if (ACC.session){
    body.innerHTML = `<section class="sp-box"><h4 class="sp-title">Tu cuenta</h4>
      <p class="acc-p">Conectado como <b class="acc-user">${ACC.profile ? ACC.profile.username : '…'}</b></p>
      <p class="acc-p" id="acc-sync">${accSyncTxt()}</p>${devNote}
      <div class="acc-row"><button class="acc-btn" id="acc-save">Guardar ahora</button><button class="acc-btn" id="acc-rank">Ver ranking</button></div>
      <div class="acc-row"><input id="acc-newname" class="acc-in" maxlength="16" placeholder="Nuevo nombre de usuario"><button class="acc-btn" id="acc-rename">Cambiar nombre</button></div>
      <div class="acc-row"><button class="acc-btn ghost" id="acc-out">Cerrar sesión</button><button class="acc-btn danger" id="acc-del">Borrar cuenta</button></div>
      <p id="acc-msg" class="acc-msg"></p></section>`;
    document.getElementById('acc-save').onclick = async () => { await accPush(); accMsg(ACC.status || 'Partida guardada en la nube.', !!ACC.status); };
    document.getElementById('acc-rank').onclick = () => { accClose(); rankOpen(); };
    document.getElementById('acc-out').onclick = () => accSignOut();
    document.getElementById('acc-del').onclick = () => accDelete().catch(e => accMsg(e.message, true));
    document.getElementById('acc-rename').onclick = async () => {
      const n = accName(document.getElementById('acc-newname').value);
      if (!accValidName(n)) return accMsg('El nombre debe tener de 3 a 16 letras, números o _', true);
      try { await accEnsure(); await sbRpc('set_username', { p_name: n }); ACC.profile.username = n; accRender(); accBadge(); accMsg('Nombre cambiado.'); }
      catch (e){ accMsg(/ocupado/.test(e.message) ? 'Ese nombre ya está cogido' : e.message, true); }
    };
  } else {
    body.innerHTML = `<section class="sp-box"><h4 class="sp-title">${accTab === 'in' ? 'Iniciar sesión' : 'Crear cuenta'}</h4>
      <div class="acc-tabs"><button class="acc-tab ${accTab === 'in' ? 'on' : ''}" data-t="in">Entrar</button><button class="acc-tab ${accTab === 'up' ? 'on' : ''}" data-t="up">Registrarse</button></div>
      <form id="acc-form" class="acc-form" autocomplete="on">
        <input id="acc-user" class="acc-in" maxlength="16" placeholder="Nombre de usuario" autocomplete="username">
        <input id="acc-pass" class="acc-in" type="password" placeholder="Contraseña${accTab === 'up' ? ' (mínimo 6)' : ''}" autocomplete="${accTab === 'up' ? 'new-password' : 'current-password'}">
        ${accTab === 'up' ? '<input id="acc-pass2" class="acc-in" type="password" placeholder="Repite la contraseña" autocomplete="new-password">' : ''}
        <button class="acc-btn main" type="submit">${accTab === 'in' ? 'Entrar' : 'Crear cuenta'}</button>
      </form>
      <div class="acc-or"><span>o</span></div>
      <button class="acc-btn google" id="acc-google"><i class="g-ico">G</i> Entrar con Google</button>
      <p class="acc-note">Con una cuenta tu partida se guarda en la nube (la recuperas en cualquier ordenador) y tus récords salen en el ranking global. Sin cuenta puedes seguir jugando igual.</p>${devNote}
      <p id="acc-msg" class="acc-msg"></p></section>`;
    body.querySelectorAll('.acc-tab').forEach(b => b.onclick = () => { accTab = b.dataset.t; accRender(); });
    document.getElementById('acc-google').onclick = accGoogle;
    document.getElementById('acc-form').onsubmit = async ev => {
      ev.preventDefault();
      const u = document.getElementById('acc-user').value, p = document.getElementById('acc-pass').value;
      const p2 = document.getElementById('acc-pass2');
      if (p2 && p2.value !== p) return accMsg('Las contraseñas no coinciden', true);
      accMsg('Un momento…');
      try { if (accTab === 'in') await accSignIn(u, p); else await accSignUp(u, p); }
      catch (e){ accMsg(/already registered|already exists/i.test(e.message) ? 'Ese nombre ya está cogido' : e.message, true); }
    };
  }
}
function accSyncTxt(){
  if (ACC.status) return ACC.status;
  if (ACC.busy) return 'Guardando en la nube…';
  if (!ACC.lastSync) return 'Partida en la nube activada';
  const s = Math.round((Date.now() - ACC.lastSync) / 1000);
  return `Guardado en la nube hace ${s < 60 ? s + ' s' : Math.round(s / 60) + ' min'}`;
}
function accOpen(){ const ov = document.getElementById('account-overlay'); if (!ov) return; accRender(); ov.classList.remove('hidden'); }
function accClose(){ const ov = document.getElementById('account-overlay'); if (ov) ov.classList.add('hidden'); }

/* ---------- arranque ---------- */
(async function accInit(){
  const b = document.getElementById('btn-account'); if (b){ b.disabled = false; b.onclick = accOpen; }
  const np = document.getElementById('acc-name-pill'); if (np) np.onclick = accOpen;
  const rb = document.getElementById('btn-ranking'); if (rb) rb.onclick = rankOpen;
  const c1 = document.getElementById('btn-account-close'); if (c1) c1.onclick = accClose;
  const c2 = document.getElementById('btn-ranking-close'); if (c2) c2.onclick = () => document.getElementById('ranking-overlay').classList.add('hidden');
  document.querySelectorAll('#ranking-overlay [data-rk-mode]').forEach(x => x.onclick = () => { RK.mode = x.dataset.rkMode; rankRender(); });
  document.querySelectorAll('#ranking-overlay [data-rk-metric]').forEach(x => x.onclick = () => { RK.metric = x.dataset.rkMetric; rankRender(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape'){ const a = document.getElementById('account-overlay'), r = document.getElementById('ranking-overlay');
    if (a && !a.classList.contains('hidden')){ e.stopImmediatePropagation(); accClose(); } else if (r && !r.classList.contains('hidden')){ e.stopImmediatePropagation(); r.classList.add('hidden'); } } }, true);
  setInterval(() => { if (ACC.session) accRender(true); }, 15000);
  // vuelta del acceso con Google: los tokens llegan en la dirección (#access_token=...)
  if (location.hash.includes('access_token=')){
    const q = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    accStore({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: Number(q.get('expires_in')) || 3600 });
    try { ACC.session.user = await sbFetch('/auth/v1/user'); accStore(ACC.session); accOpen(); await accAfterLogin(false); }
    catch (e){ accStore(null); accOpen(); accMsg('No se pudo entrar con Google: ' + e.message, true); }
    return;
  }
  if (location.hash.includes('error_description=')){ const q = new URLSearchParams(location.hash.slice(1)); history.replaceState(null, '', location.pathname + location.search); accOpen(); accMsg('Google: ' + q.get('error_description'), true); }
  try { ACC.session = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); } catch (e) { ACC.session = null; }
  if (ACC.session){
    if (await accEnsure()){
      try {
        await accLoadProfile(); const slot = await accPull();
        const syncAt = Number(localStorage.getItem('is_sync_at')) || 0;
        if (slot && accHasProgress(slot.keys) && slot.at > syncAt + 1000 && JSON.stringify(slot.keys) !== JSON.stringify(accLocalSnapshot())){   // se jugó en otro sitio
          if (!accHasProgress(accLocalSnapshot())) return accApply(slot);
          const pick = await accChoose(slot); if (pick === 'cloud') return accApply(slot);
          accClose(); await accPush();
        }
      } catch (e) {}
    }
    else accStore(null);
  }
  accBadge();
})();
