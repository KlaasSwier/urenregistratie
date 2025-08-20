/********************
 *  Urenregistratie
 *  Volledige app.js met admin-filter
 ********************/

/* ===== Helpers ===== */
const $  = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const byMonth = (isoDate) => (isoDate || '').slice(0, 7);

function calcHours(start, end, pauze, wachturen, rusturen) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm / 60,
      e = eh + em / 60,
      diff = e - s;
  if (diff < 0) diff += 24;

  return Math.max(
    0,
    diff
      - (parseFloat(pauze) || 0)
      - (parseFloat(wachturen) || 0)
      - (parseFloat(rusturen) || 0)
  );
}

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('nl-NL'); }
  catch { return d; }
}

/* Firebase wrappers */
const auth = () => window.auth || firebase.auth();
const db   = () => window.db   || firebase.firestore();

/* DOM refs */
const authView = $('#auth-view');
const registerCard = $('#register-card');
const appView = $('#app-view');

/* ===== Login / Forgot / Logout ===== */
$('#to-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  registerCard?.classList.remove('hidden');
});
$('#to-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  registerCard?.classList.add('hidden');
});

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

$('#logout')?.addEventListener('click', () => {
  safeUnsubscribe();
  auth().signOut();
});

/* ===== Globale staat ===== */
let currentUser = null;
let isAdmin = false;
let allRows = [];
let userMap = {};

let unsubscribe = null;
function safeUnsubscribe() {
  if (unsubscribe) {
    try { unsubscribe(); } catch (e) {}
  }
  unsubscribe = null;
}

// Display name
function getDisplayName(uid, fallbackEmail) {
  if (userMap[uid] && userMap[uid].naam) return userMap[uid].naam;
  return userMap[uid]?.email || fallbackEmail || uid;
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
    (snap) => {
      allRows = snap.docs.map((d) => ({
        id: d.id,
        uid: d.ref.parent.parent.id,
        ...d.data(),
      }));
      renderTable();
    },
    (err) => {
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
  const medewerkerFilter = $('#filterMedewerker')?.value || '';
  let total = 0;

  allRows.forEach((r) => {
    if (whoFilter && r.voorWie !== whoFilter) return;
    if (medewerkerFilter && getDisplayName(r.uid, r.email) !== medewerkerFilter) return;

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
  $$('#urenTable .del').forEach((btn) => (btn.onclick = async (e) => {
    const { id, uid } = e.target.dataset;
    const ref = db().collection('users').doc(uid).collection('entries').doc(id);
    if (!confirm('Weet je zeker dat je deze regel wilt verwijderen?')) return;
    try { await ref.delete(); }
    catch (err) { console.error(err); alert('Verwijderen mislukt: ' + err.message); }
  }));

  // Approve
  if (isAdmin) {
    $$('#urenTable .approve').forEach((ch) => (ch.onchange = async (e) => {
      const { id, uid } = e.target.dataset;
      const ref = db().collection('users').doc(uid).collection('entries').doc(id);
      try { await ref.update({ goedgekeurd: e.target.checked }); }
      catch (err) { console.error(err); alert('Updaten mislukt: ' + err.message); }
    }));
  }

  // Admin filter dropdown vullen met medewerkers
  if (isAdmin) {
    const select = $('#filterMedewerker');
    if (select) {
      const uniqueUsers = [...new Set(allRows.map(r => getDisplayName(r.uid, r.email)))];
      select.innerHTML = '<option value="">Alle medewerkers</option>' + uniqueUsers.map(u => `<option value="${u}">${u}</option>`).join('');
      if (medewerkerFilter) select.value = medewerkerFilter;
    }
  }
}

/* ===== Uren toevoegen ===== */
$('#hours-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;

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
      rusturen   : $('#rusturen') ? $('#rusturen').value || '0' : '0',
      opmerkingen: $('#opmerkingen').value,
      email      : (currentUser || {}).email || '',
      goedgekeurd: false,
      createdAt  : firebase.firestore.FieldValue.serverTimestamp(),
    };
    row.uren = calcHours(row.starttijd, row.eindtijd, row.pauze, row.wachturen, row.rusturen);

    await db().collection('users').doc(currentUser.uid).collection('entries').add(row);

    const filter = $('#filterMaand');
    if (filter && filter.value !== row.month) {
      filter.value = row.month;
      const useAdminView = isAdmin && $('#adminToggle').checked;
      attachRealtimeListeners(useAdminView);
    }

    if (form && typeof form.reset === 'function') form.reset();
    $('#pauze').value = '0';

    alert('Toegevoegd ✓');
  } catch (err) {
    console.error(err);
    alert('Opslaan mislukt: ' + err.message);
  }
});

/* Reset */
$('#reset')?.addEventListener('click', () => {
  const f = $('#hours-form');
  f?.reset();
  $('#pauze').value = '0';
});

/* ===== Filters / Export ===== */
$('#filterWie')?.addEventListener('change', renderTable);
$('#filterMedewerker')?.addEventListener('change', renderTable);

$('#filterMaand')?.addEventListener('change', () => {
  const useAdminView = isAdmin && $('#adminToggle').checked;
  attachRealtimeListeners(useAdminView);
});

$('#adminToggle')?.addEventListener('change', () => {
  const useAdminView = isAdmin && $('#adminToggle').checked;
  attachRealtimeListeners(useAdminView);
});

$('#exportCsv')?.addEventListener('click', () => {
  const rows = [
    ['Medewerker', 'Voor wie', 'Datum', 'Start', 'Eind', 'Pauze', 'Wachturen', 'Rusturen', 'Uren', 'Opmerkingen', 'Goedgekeurd'],
  ];
  allRows.forEach((r) =>
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
      r.goedgekeurd ? 'JA' : 'NEE',
    ])
  );

  const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'urenexport.csv';
  a.click();
  URL.revokeObjectURL(url);
});

/* ===== Auth state ===== */
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;

    let role = 'user';
    try {
      const prof = await db().collection('users').doc(user.uid).get();
      role = prof.exists ? (prof.data().role || 'user') : 'user';
      userMap[user.uid] = { email: user.email, ...prof.data() };
    } catch (e) {
      console.warn('Kon profiel niet lezen, ga uit van user', e);
    }
    isAdmin = role === 'admin';

    $('#who').textContent = getDisplayName(user.uid, user.email);
    $('#role').textContent = role;
    $('#role').style.display = 'inline-block';

    authView.classList.add('hidden');
    appView.classList.remove('hidden');

    const today = new Date();
    $('#datum').valueAsDate = today;
    $('#filterMaand').value = today.toISOString().slice(0, 7);

    $('#adminToggle').disabled = !isAdmin;
    $('#adminToggle').checked = isAdmin;

    attachRealtimeListeners(isAdmin);
  } else {
    safeUnsubscribe();
    currentUser = null;
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
  }
});

/* Footer */
$('#year').textContent = new Date().getFullYear();
