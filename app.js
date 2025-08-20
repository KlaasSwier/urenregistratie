/********************
 *  Urenregistratie - app.js (compleet, met admin medewerker-filter)
 ********************/

/* ===== Helpers ===== */
const $  = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const byMonth = (isoDate) => (isoDate || '').slice(0, 7);

function calcHours(start, end, pauze, wachturen, rusturen) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm/60, e = eh + em/60, diff = e - s;
  if (diff < 0) diff += 24; // over middernacht
  return Math.max(0,
    diff
    - (parseFloat(pauze)     || 0)
    - (parseFloat(wachturen) || 0)
    - (parseFloat(rusturen)  || 0)
  );
}

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('nl-NL'); }
  catch { return d; }
}

/* Firebase wrappers (compat) – worden in firebase-config.js geïnitialiseerd */
const auth = () => window.auth || firebase.auth();
const db   = () => window.db   || firebase.firestore();

/* DOM refs */
const authView = $('#auth-view');
const appView  = $('#app-view');

/* ===== Globale staat ===== */
let currentUser  = null;
let isAdmin      = false;
let unsubscribe  = null;
let allRows      = [];          // records voor de tabel
let userMap      = {};          // uid -> { email, naam, ... }

/* ===== Naam-weergave ===== */
function getDisplayName(uid, fallbackEmail) {
  if (userMap[uid]?.naam) return userMap[uid].naam;
  return userMap[uid]?.email || fallbackEmail || uid;
}

/* Profielen (namen/emails) ophalen */
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

/* Admin medewerker-filter vullen */
function populateMedewerkerFilter() {
  const wrap = document.getElementById('filterMedewerkerWrap');
  const sel  = document.getElementById('filterMedewerker');
  if (!wrap || !sel) return;

  if (!isAdmin) { // niet-admins zien het filter niet
    wrap.classList.add('hidden');
    sel.innerHTML = '<option value="">Alle</option>';
    return;
  }

  const entries = Object.entries(userMap)
    .map(([uid, u]) => ({ uid, label: (u.naam || u.email || uid) }))
    .sort((a,b)=> a.label.localeCompare(b.label, 'nl', {sensitivity:'base'}));

  sel.innerHTML = '<option value="">Alle</option>' +
    entries.map(u => `<option value="${u.uid}">${u.label}</option>`).join('');

  wrap.classList.remove('hidden');
}

/* ===== Login / Forgot / Logout ===== */
$('#forgot')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = prompt('Vul je e-mailadres in voor de reset-link:');
  if (!email) return;
  try {
    await auth().sendPasswordResetEmail(email);
    alert('Reset e-mail verstuurd.');
  } catch (err) {
    alert(err.message);
  }
});

$('#login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass  = $('#login-pass').value;
  try {
    await auth().signInWithEmailAndPassword(email, pass);
  } catch (err) {
    alert(err.message);
  }
});

$('#logout')?.addEventListener('click', () => auth().signOut());

/* ===== Realtime listeners (eigen vs admin-overzicht) ===== */
function attachRealtimeListeners(useAdminView) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  const month = $('#filterMaand').value || new Date().toISOString().slice(0, 7);

  let q;
  if (useAdminView) {
    // Admin: alle entries van alle users voor deze maand
    q = db().collectionGroup('entries')
      .where('month', '==', month)
      .orderBy('createdAt', 'desc');
  } else {
    // User: alleen eigen entries
    q = db().collection('users')
      .doc(currentUser.uid)
      .collection('entries')
      .where('month', '==', month)
      .orderBy('createdAt', 'desc');
  }

  unsubscribe = q.onSnapshot((snap) => {
    allRows = snap.docs.map(d => ({
      id : d.id,
      uid: d.ref.parent.parent.id, // uid van eigenaar
      ...d.data()
    }));
    renderTable();
  }, (err) => {
    console.error(err);
    alert('Lezen mislukt: ' + err.message);
  });
}

/* ===== Tabel renderen ===== */
function renderTable() {
  const tbody = $('#urenTable tbody');
  tbody.innerHTML = '';

  const whoFilter = $('#filterWie')?.value || '';
  const medewerkerFilterUid = document.getElementById('filterMedewerker')?.value || '';
  let total = 0;

  allRows.forEach((r) => {
    if (whoFilter && r.voorWie !== whoFilter) return;
    if (isAdmin && medewerkerFilterUid && r.uid !== medewerkerFilterUid) return;

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

  // Verwijderen (admin of eigenaar)
  $$('#urenTable .del').forEach(btn => btn.onclick = async (e) => {
    const { id, uid } = e.target.dataset;
    const ref = db().collection('users').doc(uid).collection('entries').doc(id);
    if (!confirm('Weet je zeker dat je deze regel wilt verwijderen?')) return;
    try { await ref.delete(); }
    catch (err) { console.error(err); alert('Verwijderen mislukt: ' + err.message); }
  });

  // Akkoord (alleen admin)
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
  const form = e.currentTarget; // <form>

  try {
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
    row.uren = calcHours(row.starttijd, row.eindtijd, row.pauze, row.wachturen, row.rusturen);

    await db().collection('users').doc(currentUser.uid).collection('entries').add(row);

    // Filter automatisch naar de maand van de nieuwe regel
    const filter = $('#filterMaand');
    if (filter && filter.value !== row.month) {
      filter.value = row.month;
      const useAdminView = isAdmin && $('#adminToggle').checked;
      attachRealtimeListeners(useAdminView);
    }

    // Formulier veilig resetten + defaults
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

$('#filterMaand')?.addEventListener('change', () => {
  const useAdminView = isAdmin && $('#adminToggle').checked;
  attachRealtimeListeners(useAdminView);
});

$('#adminToggle')?.addEventListener('change', () => {
  const useAdminView = isAdmin && $('#adminToggle').checked;
  attachRealtimeListeners(useAdminView);
});

document.getElementById('filterMedewerker')?.addEventListener('change', renderTable);

$('#exportCsv')?.addEventListener('click', () => {
  const rows = [[
    'Medewerker','Voor wie','Datum','Start','Eind',
    'Pauze','Wachturen','Rusturen','Uren','Opmerkingen','Goedgekeurd'
  ]];

  const whoFilter = $('#filterWie')?.value || '';
  const medewerkerFilterUid = document.getElementById('filterMedewerker')?.value || '';

  allRows.forEach(r => {
    if (whoFilter && r.voorWie !== whoFilter) return;
    if (isAdmin && medewerkerFilterUid && r.uid !== medewerkerFilterUid) return;

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

    // Rol ophalen
    let role = 'user';
    try {
      const prof = await db().collection('users').doc(user.uid).get();
      role = prof.exists ? (prof.data().role || 'user') : 'user';
    } catch (e) {
      console.warn('Kon profiel niet lezen, ga uit van user', e);
    }
    isAdmin = (role === 'admin');

    // Profielen/namen inladen voor weergave + filter vullen
    await loadUserProfiles();
    populateMedewerkerFilter();

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

    // Admin toggle beschikbaar?
    $('#adminToggle').disabled = !isAdmin;
    $('#adminToggle').checked  = isAdmin;

    attachRealtimeListeners(isAdmin);
  } else {
    currentUser = null;
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
  }
});

/* Footer-jaar */
$('#year').textContent = new Date().getFullYear();
