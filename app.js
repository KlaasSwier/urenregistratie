/********************
 *  Urenregistratie – app.js (fixed: admin-filter op UID + namen)
 ********************/

/* ===== Helpers ===== */
const $  = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const byMonth = (isoDate) => (isoDate || '').slice(0, 7);

function calcHours(start, end, pauze, wachturen, rusturen, nightShift = false) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm/60, e = eh + em/60, diff = e - s;
  if (diff < 0) {
    if (nightShift) diff += 24; // over middernacht
    else throw new Error('Eindtijd ligt voor starttijd. Vink "nachtelijke shift" aan indien van toepassing.');
  }
  return Math.max(0,
    diff
    - (parseFloat(pauze)     || 0)
    - (parseFloat(wachturen) || 0)
    - (parseFloat(rusturen)  || 0)
  );
}
if (typeof module !== 'undefined') module.exports = { calcHours };

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
  auth().signOut();
});

/* ===== Globale staat ===== */
let currentUser = null;
let isAdmin     = false;
let allRows     = [];          // records voor de tabel
let userMap     = {};          // uid -> { email, naam, role, ... }

// Realtime listener netjes opruimen
let unsubscribe = null;
function safeUnsubscribe() {
  if (unsubscribe) { try { unsubscribe(); } catch (e) {} }
  unsubscribe = null;
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

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${getDisplayName(r.uid, r.email)}</td>
      <td>${r.voorWie || ''}</td>
      <td>${fmtDate(r.datum)}</td>
      <td>${r.starttijd || ''}</td>
      <td>${r.eindtijd || ''}</td>
      <td>${r.pauze || '0'}</td>
      <td>${r.wachturen || 0}</td>
      <td>${r.rusturen || 0}</td>
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
  const nightShift = $('#nachtshift')?.checked;

  const dateVal = $('#datum').value;

  const row = {
    voorWie    : $('#voorWie').value,
    datum      : dateVal,
    month      : byMonth(dateVal),
    starttijd  : $('#starttijd').value,
    eindtijd   : $('#eindtijd').value,
    pauze      : $('#pauze').value || '0',
    wachturen  : $('#wachturen') ? $('#wachturen').value || '0' : '0',
    rusturen   : $('#rusturen')  ? $('#rusturen').value  || '0' : '0',
    opmerkingen: $('#opmerkingen').value,
    email      : (currentUser || {}).email || '',
    goedgekeurd: false,
    createdAt  : firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    row.uren = calcHours(row.starttijd, row.eindtijd, row.pauze, row.wachturen, row.rusturen, nightShift);
  } catch (err) {
    alert(err.message);
    return;
  }

  try {
    await db().collection('users').doc(currentUser.uid).collection('entries').add(row);

    // Spring automatisch naar de juiste maand in de filter
    const filter = $('#filterMaand');
    if (filter && filter.value !== row.month) {
      filter.value = row.month;
      const useAdminView = isAdmin && $('#adminToggle').checked;
      attachRealtimeListeners(useAdminView);
    }

    // Form reset + defaults
    if (form && typeof form.reset === 'function') form.reset();
    if ($('#pauze'))     $('#pauze').value     = '0';
    if ($('#wachturen')) $('#wachturen').value = '0';
    if ($('#rusturen'))  $('#rusturen').value  = '0';

    alert('Toegevoegd ✓');
  } catch (err) {
    console.error(err);
    alert('Opslaan mislukt: ' + err.message);
  }
});

/* Reset-knop */
$('#reset')?.addEventListener('click', () => {
  const f = $('#hours-form');
  f?.reset();
  if ($('#pauze'))     $('#pauze').value     = '0';
  if ($('#wachturen')) $('#wachturen').value = '0';
  if ($('#rusturen'))  $('#rusturen').value  = '0';
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

    rows.push([
      getDisplayName(r.uid, r.email),
      r.voorWie || '',
      fmtDate(r.datum),
      r.starttijd || '',
      r.eindtijd || '',
      r.pauze || '0',
      r.wachturen || 0,
      r.rusturen || 0,
      r.uren || 0,
      (r.opmerkingen || '').replace(/\n/g, ' '),
      r.goedgekeurd ? 'JA' : 'NEE'
    ]);
  });

  const csv  = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
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
  } else {
    safeUnsubscribe();
    currentUser = null;
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
  }
});

/* Footer-jaar */
$('#year').textContent = new Date().getFullYear();
