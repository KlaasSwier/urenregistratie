/********************
 *  Urenregistratie – app.js (fixed: admin-filter op UID + namen)
 ********************/

/* ===== Helpers ===== */
const $  = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const byMonth = (isoDate) => (isoDate || '').slice(0, 7);
const parseTime = (t = '') => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};

function calcInterval(start, end, nightShift = false) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm / 60, e = eh + em / 60, diff = e - s;
  if (diff < 0) {
    if (nightShift) diff += 24;
    else throw new Error('Eindtijd ligt voor starttijd. Vink "nachtelijke shift" aan indien van toepassing.');
  }
return Math.round(diff * 100) / 100;
}

function calcHours(start, end, pauzeDur, wachtDur, rustDur, nightShift = false) {
  const diff = calcInterval(start, end, nightShift);
  return Math.max(0,
    diff
    - (parseFloat(pauzeDur) || 0)
    - (parseFloat(wachtDur) || 0)
    - (parseFloat(rustDur)  || 0)
  );
}
if (typeof module !== 'undefined') module.exports = { calcHours, calcInterval };

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('nl-NL'); }
  catch { return d; }
}

/* Firebase wrappers (compat) */
const auth = () => window.auth || firebase.auth();
const db   = () => window.db   || firebase.firestore();

/* DOM refs */
const authView = $('#auth-view');
const registerCard = $('#register-card'); // blijft verborgen in jouw workflow
const appView  = $('#app-view');

/* ===== Login / Forgot / Logout ===== */
$('#to-register')?.addEventListener('click', (e) => { e.preventDefault(); registerCard?.classList.remove('hidden'); });
$('#to-login')?.addEventListener('click', (e) => { e.preventDefault(); registerCard?.classList.add('hidden'); });

$('#forgot')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = prompt('Vul je e-mailadres in voor de reset-link:');
  if (!email) return;
  try { await auth().sendPasswordResetEmail(email); alert('Reset e-mail verstuurd.'); }
  catch (err) { alert(err.message); }
});

$('#login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass  = $('#login-pass').value;
  try { await auth().signInWithEmailAndPassword(email, pass); }
  catch (err) { alert(err.message); }
});

$('#logout')?.addEventListener('click', () => {
  safeUnsubscribe();   // luisteraar eerst stoppen
  removeActivityListeners();
  auth().signOut();
});

/* ===== Globale staat ===== */
let currentUser = null;
let isAdmin     = false;
let allRows     = [];          // records voor de tabel
let userMap     = {};          // uid -> { email, naam, role, ... }
let inactivityTimer = null;    // timer voor automatische logout
const activityEvents = ['mousemove','keydown','click','touchstart'];

// Realtime listener netjes opruimen
let unsubscribe = null;
function safeUnsubscribe() {
  if (unsubscribe) { try { unsubscribe(); } catch (e) {} }
  unsubscribe = null;
}

function startInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (confirm('Ingelogd blijven?')) {
      startInactivityTimer();
    } else {
      safeUnsubscribe();
      auth().signOut();
    }
  }, 5 * 60 * 1000);
}

function addActivityListeners() {
  activityEvents.forEach(ev => document.addEventListener(ev, startInactivityTimer));
}

function removeActivityListeners() {
  activityEvents.forEach(ev => document.removeEventListener(ev, startInactivityTimer));
  clearTimeout(inactivityTimer);
  inactivityTimer = null;
}

// Display name helper
function getDisplayName(uid, fallbackEmail) {
  if (userMap[uid]?.naam) return userMap[uid].naam;
  return userMap[uid]?.email || fallbackEmail || uid;
}

/* ===== Profielen laden ===== */
// Admin: laad ALLE /users (zodat namen bekend zijn)
// Niet-admin: laad alleen eigen profiel (optioneel)
async function loadUserProfiles() {
  try {
    if (isAdmin) {
      const snap = await db().collection('users').get();
      userMap = {};
      snap.forEach(d => userMap[d.id] = d.data() || {});
    } else if (currentUser?.uid) {
      const d = await db().collection('users').doc(currentUser.uid).get();
      userMap = { [currentUser.uid]: d.exists ? (d.data() || {}) : { email: currentUser.email } };
    }
  } catch (e) {
    console.error('loadUserProfiles failed', e);
  }
}

// Als er in de snapshot users opduiken die nog niet in userMap staan: bijladen
async function ensureUsersLoaded(uids) {
  if (!uids?.length) return;
  const missing = uids.filter(uid => !(uid in userMap));
  if (!missing.length) return;
  try {
    const gets = await Promise.all(missing.map(uid => db().collection('users').doc(uid).get()));
    gets.forEach((doc, i) => { userMap[missing[i]] = doc.exists ? (doc.data() || {}) : {}; });
  } catch (e) {
    console.warn('ensureUsersLoaded failed', e);
  }
}

/* ===== Admin: medewerker-filter UI ===== */
function populateMedewerkerFilter() {
  const wrap = document.getElementById('filterMedewerkerWrap');
  const sel  = document.getElementById('filterMedewerker');
  if (!wrap || !sel) return;

  if (!isAdmin) { // verbergen voor niet-admins
    wrap.classList.add('hidden');
    sel.innerHTML = '<option value="">Alle</option>';
    return;
  }

  // Gebruik de UIDs uit de huidige tabel (allRows) zodat de lijst compact blijft
  const uids = [...new Set(allRows.map(r => r.uid))];
  const options = uids
    .map(uid => ({ uid, label: getDisplayName(uid, userMap[uid]?.email || uid) }))
    .sort((a,b) => a.label.localeCompare(b.label, 'nl', {sensitivity:'base'}));

  const prev = sel.value;
  sel.innerHTML = '<option value="">Alle</option>' +
    options.map(o => `<option value="${o.uid}">${o.label}</option>`).join('');
  // herstel eerdere keuze indien nog aanwezig
  if (options.some(o => o.uid === prev)) sel.value = prev;

  wrap.classList.remove('hidden');
}

/* ===== Realtime listeners ===== */
function attachRealtimeListeners(useAdminView) {
  safeUnsubscribe();

  const month = $('#filterMaand').value || new Date().toISOString().slice(0, 7);
  let q;
  if (useAdminView) {
    q = db().collectionGroup('entries')
      .where('month', '==', month)
      .orderBy('createdAt', 'desc');
  } else {
    q = db().collection('users')
      .doc(currentUser.uid)
      .collection('entries')
      .where('month', '==', month)
      .orderBy('createdAt', 'desc');
  }

  unsubscribe = q.onSnapshot(
    async (snap) => {
      allRows = snap.docs.map(d => ({
        id : d.id,
        uid: d.ref.parent.parent.id,
        ...d.data()
      }));

      // Zorg dat namen bekend zijn (alleen nodig voor admins)
      if (isAdmin) {
        const uidsInRows = [...new Set(allRows.map(r => r.uid))];
        await ensureUsersLoaded(uidsInRows);
      }

      populateMedewerkerFilter();
      renderTable();
    },
    (err) => {
      // geen popup bij uitloggen of permission-denied
      if (!auth().currentUser || err?.code === 'permission-denied') return;
      console.error(err);
      alert('Lezen mislukt: ' + err.message);
    }
  );
}

/* ===== Tabel renderen ===== */
function renderTable() {
  const tbody = $('#urenTable tbody');
  tbody.innerHTML = '';

  const whoFilter = $('#filterWie')?.value || '';
  const medewerkerUidFilter = document.getElementById('filterMedewerker')?.value || '';
  let total = 0;

  allRows.forEach((r) => {
    if (whoFilter && r.voorWie !== whoFilter) return;
    if (isAdmin && medewerkerUidFilter && r.uid !== medewerkerUidFilter) return;

  const pauzeVal = r.pauzeDur ?? (parseFloat(r.pauze) || 0);
    const wachtVal = r.wachtDur ?? (parseFloat(r.wachturen) || 0);
    const rustVal  = r.rustDur  ?? (parseFloat(r.rusturen)  || 0);  

  const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${getDisplayName(r.uid, r.email)}</td>
      <td>${r.voorWie || ''}</td>
      <td>${fmtDate(r.datum)}</td>
      <td>${r.starttijd || ''}</td>
      <td>${r.eindtijd || ''}</td>
      <td>${pauzeVal.toFixed(2)}</td>
      <td>${wachtVal.toFixed(2)}</td>
      <td>${rustVal.toFixed(2)}</td>
      <td><span class="badge">${(r.uren || 0).toFixed(2)}</span></td>
      <td>${(r.opmerkingen || '').replace(/\n/g, '<br>')}</td>
      <td>${
        isAdmin
          ? `<input type="checkbox" ${r.goedgekeurd ? 'checked' : ''} data-id="${r.id}" data-uid="${r.uid}" class="approve">`
          : (r.goedgekeurd ? 'JA' : 'NEE')
      }</td>
      <td>${
        (isAdmin || r.uid === (currentUser?.uid || ''))
          ? `<button class="danger del" data-id="${r.id}" data-uid="${r.uid}">Verwijder</button>`
          : ''
      }</td>
    `;
    tbody.appendChild(tr);
    total += r.uren || 0;
  });

  $('#totals').textContent = 'Totaal: ' + (Math.round(total * 100) / 100) + ' uur';

  // Delete
  $$('#urenTable .del').forEach(btn => btn.onclick = async (e) => {
    const { id, uid } = e.target.dataset;
    const ref = db().collection('users').doc(uid).collection('entries').doc(id);
    if (!confirm('Weet je zeker dat je deze regel wilt verwijderen?')) return;
    try { await ref.delete(); }
    catch (err) { console.error(err); alert('Verwijderen mislukt: ' + err.message); }
  });

  // Approve
  if (isAdmin) {
    $$('#urenTable .approve').forEach(ch => ch.onchange = async (e) => {
      const { id, uid } = e.target.dataset;
      const ref = db().collection('users').doc(uid).collection('entries').doc(id);
      try { await ref.update({ goedgekeurd: e.target.checked }); }
      catch (err) { console.error(err); alert('Updaten mislukt: ' + err.message); }
    });
  }
}

/* ===== Uren toevoegen ===== */
$('#hours-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  
  const dateVal = $('#datum').value;
  const start   = $('#starttijd').value;
  const end     = $('#eindtijd').value;

  const startMin = parseTime(start);
  const endMin   = parseTime(end);
  const crossesMidnight = endMin < startMin;

  const pauzeStart = $('#pauzeStart')?.value || '';
  const pauzeEnd   = $('#pauzeEnd')?.value || '';
  const wachtStart = $('#wachtStart')?.value || '';
  const wachtEnd   = $('#wachtEnd')?.value || '';
  const rustStart  = $('#rustStart')?.value || '';
  const rustEnd    = $('#rustEnd')?.value || '';

  const base = {
    voorWie    : $('#voorWie').value,
  pauzeStart,
    pauzeEnd,
    pauzeDur   : calcInterval(pauzeStart, pauzeEnd, parseTime(pauzeEnd) < parseTime(pauzeStart)),
    wachtStart,
    wachtEnd,
    wachtDur   : calcInterval(wachtStart, wachtEnd, parseTime(wachtEnd) < parseTime(wachtStart)),
    rustStart,
    rustEnd,
    rustDur    : calcInterval(rustStart, rustEnd, parseTime(rustEnd) < parseTime(rustStart)),
    opmerkingen: $('#opmerkingen').value,
    email      : (currentUser || {}).email || '',
    goedgekeurd: false,
    };
 
  const col = db().collection('users').doc(currentUser.uid).collection('entries');

  if (crossesMidnight) {
    const next = new Date(dateVal);
    next.setDate(next.getDate() + 1);
    const nextDate = next.toISOString().slice(0,10);

     const toAbs = (m) => (crossesMidnight && m < startMin ? m + 1440 : m);
    const splitInterval = (sStr, eStr) => {
      if (!sStr || !eStr) return [{ start:'', end:'', dur:0 }, { start:'', end:'', dur:0 }];
      let s = toAbs(parseTime(sStr));
      let e = toAbs(parseTime(eStr));
      if (e < s) e += 1440;
      const firstMin = Math.max(0, Math.min(e, 1440) - s);
      const secondMin = Math.max(0, e - Math.max(s, 1440));
      const first = firstMin ? { start: sStr, end: e > 1440 ? '00:00' : eStr, dur: firstMin/60 } : { start:'', end:'', dur:0 };
      const second = secondMin ? { start: s < 1440 ? '00:00' : sStr, end: eStr, dur: secondMin/60 } : { start:'', end:'', dur:0 };
      return [first, second];
    };

    const [p1, p2] = splitInterval(base.pauzeStart, base.pauzeEnd);
    const [w1, w2] = splitInterval(base.wachtStart, base.wachtEnd);
    const [r1, r2] = splitInterval(base.rustStart, base.rustEnd);

    const row1 = {
      ...base,
      datum     : dateVal,
      month     : byMonth(dateVal),
      starttijd : start,
      eindtijd  : '00:00',
       pauzeStart: p1.start,
      pauzeEnd  : p1.end,
      pauzeDur  : p1.dur,
      wachtStart: w1.start,
      wachtEnd  : w1.end,
      wachtDur  : w1.dur,
      rustStart : r1.start,
      rustEnd   : r1.end,
      rustDur   : r1.dur,
      createdAt : firebase.firestore.FieldValue.serverTimestamp(),
    };
    const row2 = {
      ...base,
      datum     : nextDate,
      month     : byMonth(nextDate),
      starttijd : '00:00',
      eindtijd  : end,
      pauzeStart: p2.start,
      pauzeEnd  : p2.end,
      pauzeDur  : p2.dur,
      wachtStart: w2.start,
      wachtEnd  : w2.end,
      wachtDur  : w2.dur,
      rustStart : r2.start,
      rustEnd   : r2.end,
      rustDur   : r2.dur,
      createdAt : firebase.firestore.FieldValue.serverTimestamp(),
    };
    try {
      row1.uren = calcHours(row1.starttijd, '00:00', row1.pauzeDur, row1.wachtDur, row1.rustDur, true);
      row2.uren = calcHours('00:00', row2.eindtijd, row2.pauzeDur, row2.wachtDur, row2.rustDur);
    } catch (err) {
      alert(err.message);
      return;
    }
    try {
      await Promise.all([col.add(row1), col.add(row2)]);

      const filter = $('#filterMaand');
      if (filter && ![row1.month, row2.month].includes(filter.value)) {
        filter.value = row1.month;
        const useAdminView = isAdmin && $('#adminToggle').checked;
        attachRealtimeListeners(useAdminView);
      }
if (form && typeof form.reset === 'function') form.reset();
      ['pauzeStart','pauzeEnd','wachtStart','wachtEnd','rustStart','rustEnd'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
     
 alert('Toegevoegd ✓');
    } catch (err) {
      console.error(err);
      alert('Opslaan mislukt: ' + err.message);
    }
  } else {
    const row = {
      ...base,
      datum     : dateVal,
      month     : byMonth(dateVal),
      starttijd : start,
      eindtijd  : end,
      createdAt : firebase.firestore.FieldValue.serverTimestamp(),
    };
    try {
      row.uren = calcHours(row.starttijd, row.eindtijd, row.pauzeDur, row.wachtDur, row.rustDur, crossesMidnight);
    } catch (err) {
      alert(err.message);
      return;

    }
try {
      await col.add(row);
    
   const filter = $('#filterMaand');
      if (filter && filter.value !== row.month) {
        filter.value = row.month;
        const useAdminView = isAdmin && $('#adminToggle').checked;
        attachRealtimeListeners(useAdminView);
      }

      if (form && typeof form.reset === 'function') form.reset();
      ['pauzeStart','pauzeEnd','wachtStart','wachtEnd','rustStart','rustEnd'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

      alert('Toegevoegd ✓');
    } catch (err) {
      console.error(err);
      alert('Opslaan mislukt: ' + err.message);
    }
  }
});

/* Reset-knop */
$('#reset')?.addEventListener('click', () => {
  const f = $('#hours-form');
  f?.reset();
  ['pauzeStart','pauzeEnd','wachtStart','wachtEnd','rustStart','rustEnd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
});

/* ===== Filters / Export ===== */
$('#filterWie')?.addEventListener('change', renderTable);
document.getElementById('filterMedewerker')?.addEventListener('change', renderTable);

$('#filterMaand')?.addEventListener('change', () => {
  const useAdminView = isAdmin && $('#adminToggle').checked;
  attachRealtimeListeners(useAdminView);
});

$('#adminToggle')?.addEventListener('change', () => {
  const useAdminView = isAdmin && $('#adminToggle').checked;
  attachRealtimeListeners(useAdminView);
});

$('#exportCsv')?.addEventListener('click', () => {
  const rows = [[
    'Medewerker','Voor wie','Datum','Start','Eind',
    'Pauze','Wachturen','Rusturen','Uren','Opmerkingen','Goedgekeurd'
  ]];

  const whoFilter = $('#filterWie')?.value || '';
  const medewerkerUidFilter = document.getElementById('filterMedewerker')?.value || '';

  allRows.forEach(r => {
    if (whoFilter && r.voorWie !== whoFilter) return;
    if (isAdmin && medewerkerUidFilter && r.uid !== medewerkerUidFilter) return;

    const pauzeVal = r.pauzeDur ?? (parseFloat(r.pauze) || 0);
    const wachtVal = r.wachtDur ?? (parseFloat(r.wachturen) || 0);
    const rustVal  = r.rustDur  ?? (parseFloat(r.rusturen)  || 0);

    rows.push([
      getDisplayName(r.uid, r.email),
      r.voorWie || '',
      fmtDate(r.datum),
      r.starttijd || '',
      r.eindtijd || '',
      pauzeVal,
      wachtVal,
      rustVal,
      r.uren || 0,
      (r.opmerkingen || '').replace(/\n/g, ' '),
      r.goedgekeurd ? 'JA' : 'NEE'
    ]);
  });

  const csv  = rows
    .map(r => r
      .map(v => {
        const isNum = typeof v === 'number' || (typeof v === 'string' && v.trim() && !isNaN(v));
        const val = isNum
          ? v.toString().replace('.', ',')
          : String(v);
        return `"${val.replaceAll('"','""')}"`;
      })
      .join(';'))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'urenexport.csv'; a.click();
  URL.revokeObjectURL(url);
});

/* ===== Auth state ===== */
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;

    // Rol ophalen + eigen profiel in cache zetten
    let role = 'user';
    try {
      const prof = await db().collection('users').doc(user.uid).get();
      role = prof.exists ? (prof.data().role || 'user') : 'user';
      userMap[user.uid] = { email: user.email, ...(prof.data() || {}) };
    } catch (e) {
      console.warn('Kon profiel niet lezen, ga uit van user', e);
    }
    isAdmin = (role === 'admin');

    // Profielen laden voor namen (admin = alle users)
    await loadUserProfiles();

    // UI
    $('#who').textContent  = getDisplayName(user.uid, user.email);
    $('#role').textContent = role;
    $('#role').style.display = 'inline-block';

    authView.classList.add('hidden');
    appView.classList.remove('hidden');

    // Defaults (datum en maand)
    const today = new Date();
    $('#datum').valueAsDate = today;
    $('#filterMaand').value = today.toISOString().slice(0, 7);

    // Admin toggle
    $('#adminToggle').disabled = !isAdmin;
    $('#adminToggle').checked  = isAdmin;

    attachRealtimeListeners(isAdmin);
    addActivityListeners();
    startInactivityTimer();
  } else {
    safeUnsubscribe();
    removeActivityListeners();
    currentUser = null;
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
  }
});

/* Footer-jaar */
$('#year').textContent = new Date().getFullYear();
