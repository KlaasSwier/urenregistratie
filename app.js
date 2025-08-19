// ===== Helpers =====
const $  = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const byMonth = (isoDate) => isoDate?.slice(0,7);
const unique  = (arr) => [...new Set(arr)].sort();

function calcHours(start, end, pauze) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm/60, e = eh + em/60, diff = e - s;
  if (diff < 0) diff += 24; // nacht-uren
  return Math.max(0, diff - (parseFloat(pauze)||0));
}
function fmtDate(d) { try { return new Date(d).toLocaleDateString('nl-NL'); } catch { return d; } }

const auth = () => window.auth;
const db   = () => window.db;

// ===== UI hooks =====
const authView     = $('#auth-view');
const registerCard = $('#register-card');
const appView      = $('#app-view');

// Meldingen (groene/rode balk)
function showMessage(text, type='success', timeout=3000) {
  const msg = $('#message');
  if (!msg) return alert(text); // fallback
  msg.textContent = text;
  msg.className = `show ${type}`; // CSS verwacht .show .success/.error
  setTimeout(()=>{ msg.className = 'hidden'; }, timeout);
}

// Form (de)activeren tot auth klaar is
function setFormDisabled(disabled) {
  $$('#hours-form input, #hours-form select, #hours-form textarea, #hours-form button')
    .forEach(el => el.disabled = disabled);
}

// ===== Auth forms =====
$('#to-register')?.addEventListener('click',(e)=>{ e.preventDefault(); registerCard.classList.remove('hidden'); });
$('#to-login')?.addEventListener('click',(e)=>{ e.preventDefault(); registerCard.classList.add('hidden'); });

$('#forgot')?.addEventListener('click', async (e)=>{
  e.preventDefault();
  const email = prompt('Vul je e-mailadres in voor reset-link:');
  if (!email) return;
  try { await auth().sendPasswordResetEmail(email); showMessage('Reset e-mail verstuurd ✓','success'); }
  catch(err){ showMessage(err.message,'error'); }
});

$('#login-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass  = $('#login-pass').value;
  try { await auth().signInWithEmailAndPassword(email, pass); }
  catch(err){ showMessage(err.message,'error'); }
});

$('#register-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#reg-email').value.trim();
  const pass  = $('#reg-pass').value;
  try {
    const cred = await auth().createUserWithEmailAndPassword(email, pass);
    await db().collection('users').doc(cred.user.uid).set({
      email, role: 'user', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showMessage('Account aangemaakt. Je bent ingelogd.','success');
  } catch(err){ showMessage(err.message,'error'); }
});

$('#logout')?.addEventListener('click', ()=> auth().signOut());

// ===== App state =====
let unsubscribe = null;
let currentUser = null;
let isAdmin = false;
let allRows = [];

// ===== Filters (incl. admin medewerker-filter) =====
function getFilteredRows() {
  const whoFilter = $('#filterWie')?.value || '';
  const medFilter = isAdmin ? ($('#filterMedewerker')?.value || '') : '';
  return allRows.filter(r => {
    if (whoFilter && r.voorWie !== whoFilter) return false;
    if (medFilter && (r.email || r.uid) !== medFilter) return false;
    return true;
  });
}

// ===== Data listen (realtime) =====
function attachRealtimeListeners(adminView) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  const month = $('#filterMaand').value;
  let q;
  if (adminView) {
    // Admin: alle medewerkers via collectionGroup
    q = db().collectionGroup('entries')
            .where('month','==',month)
            .orderBy('createdAt','desc');
  } else {
    // User: alleen eigen uren
    q = db().collection('users').doc(currentUser.uid).collection('entries')
            .where('month','==',month)
            .orderBy('createdAt','desc');
  }

  unsubscribe = q.onSnapshot(
    snap => {
      allRows = snap.docs.map(d => ({ id: d.id, ...d.data(), uid: d.ref.parent.parent.id }));
      // Admin: vul medewerkers-select op basis van actuele data
      if (isAdmin) {
        const sel = $('#filterMedewerker');
        const wrap = $('#filterMedewerkerWrap');
        if (wrap) wrap.classList.toggle('hidden', false);
        if (sel) {
          const keep = sel.value;
          const emails = unique(allRows.map(r => r.email || r.uid).filter(Boolean));
          sel.innerHTML = '<option value="">Alle</option>' +
            emails.map(e => `<option value="${e}">${e}</option>`).join('');
          if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
        }
      }
      renderTable();
    },
    err => {
      console.error('listen error:', err);
      showMessage('Lezen mislukt: ' + (err.message || err),'error');
    }
  );
}

// ===== Tabel/render =====
function renderTable() {
  const tbody = $('#urenTable tbody');
  tbody.innerHTML = '';

  const rows = getFilteredRows();
  let total = 0;

  rows.forEach((r)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.email || r.uid}</td>
      <td>${r.voorWie}</td>
      <td>${fmtDate(r.datum)}</td>
      <td>${r.starttijd}</td>
      <td>${r.eindtijd}</td>
      <td>${r.pauze}</td>
      <td><span class="badge">${(r.uren||0).toFixed(2)}</span></td>
      <td>${r.opmerkingen ? String(r.opmerkingen).replace(/</g,'&lt;') : ''}</td>
      <td>${
        isAdmin
          ? `<input type="checkbox"
                 ${r.goedgekeurd ? 'checked' : ''}
                 data-id="${r.id}" data-uid="${r.uid}"
                 class="approve">`
          : (r.goedgekeurd ? 'JA' : 'NEE')
      }</td>
      <td>${
        isAdmin || r.uid === (currentUser?.uid || '')
          ? `<button class="danger del" data-id="${r.id}" data-uid="${r.uid}">Verwijder</button>`
          : ''
      }</td>
    `;
    tbody.appendChild(tr);
    total += r.uren||0;
  });

  $('#totals').textContent = 'Totaal: ' + (Math.round(total*100)/100) + ' uur';

  // Verwijderen: admin of eigenaar (rules beschermen server-side)
  $$('#urenTable .del').forEach(btn => btn.onclick = async (e)=>{
    const {id, uid} = e.target.dataset;
    const ref = db().collection('users').doc(uid).collection('entries').doc(id);
    if (!confirm('Weet je zeker dat je deze regel wilt verwijderen?')) return;
    try {
      await ref.delete();
      showMessage('Regel verwijderd.','success',2000);
    } catch (err) {
      console.error(err);
      showMessage('Verwijderen mislukt: ' + (err.message || err),'error');
    }
  });

  // Akkoord: alleen admins krijgen een listener
  if (isAdmin) {
    $$('#urenTable .approve').forEach(ch => ch.onchange = async (e)=>{
      const {id, uid} = e.target.dataset;
      const ref = db().collection('users').doc(uid).collection('entries').doc(id);
      try {
        await ref.update({ goedgekeurd: e.target.checked });
        // geen toast nodig; maar kan:
        // showMessage('Status aangepast.','success',1500);
      } catch (err) {
        console.error(err);
        showMessage('Updaten mislukt: ' + (err.message || err),'error');
        // rollback UI
        e.target.checked = !e.target.checked;
      }
    });
  }
}

// ===== Submit uren =====
$('#hours-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();

  const voorWie  = $('#voorWie').value;
  const datum    = $('#datum').value;
  const start    = $('#starttijd').value;
  const eind     = $('#eindtijd').value;
  const pauze    = $('#pauze').value || '0';
  const opmerkingen = $('#opmerkingen').value;

  if (!currentUser?.uid) {
    showMessage('Je bent (nog) niet volledig ingelogd. Probeer opnieuw.','error');
    return;
  }
  if (!voorWie || !datum || !start || !eind) {
    showMessage('Vul alle verplichte velden in.','error');
    return;
  }

  const uren = calcHours(start, eind, pauze);

  const row = {
    voorWie,
    datum,
    month: byMonth(datum),
    starttijd: start,
    eindtijd: eind,
    pauze,
    opmerkingen,
    uren,
    goedgekeurd: false,
    email: currentUser.email || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const path = `users/${currentUser.uid}/entries`;
    console.log('Schrijf naar:', path, row);
    await db().collection('users').doc(currentUser.uid).collection('entries').add(row);
    e.target.reset();
    $('#pauze').value = '0';
    showMessage('Uren succesvol opgeslagen ✓','success');
  } catch (err) {
    console.error('Add entry failed', err);
    showMessage('Opslaan mislukt: ' + (err.message || err),'error');
  }
});

// Reset knop
$('#reset')?.addEventListener('click', ()=>{
  $('#hours-form').reset();
  $('#pauze').value = '0';
});

// Filters
$('#filterWie')?.addEventListener('change', renderTable);

$('#filterMaand')?.addEventListener('change', ()=>{
  const adminView = isAdmin && $('#adminToggle').checked;
  attachRealtimeListeners(adminView);
});

$('#filterMedewerker')?.addEventListener('change', renderTable);

// Export: precies wat je ziet (filters toegepast)
$('#exportCsv')?.addEventListener('click', ()=>{
  const rows = [['Medewerker','Voor wie','Datum','Start','Eind','Pauze','Uren','Opmerkingen','Goedgekeurd']];
  const data = getFilteredRows();
  data.forEach(r => rows.push([
    r.email || r.uid,
    r.voorWie,
    fmtDate(r.datum),
    r.starttijd,
    r.eindtijd,
    r.pauze,
    r.uren,
    (r.opmerkingen||'').replace(/\n/g,' '),
    r.goedgekeurd ? 'JA' : 'NEE'
  ]));
  const csv = rows.map(r => r.map(v => '"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const medewerker = isAdmin ? (($('#filterMedewerker')?.value)||'alle') : (currentUser?.email || 'mijn');
  const maand = $('#filterMaand').value || 'maand';
  const fname = `uren_${medewerker}_${maand}.csv`.replace(/[^\w.-]+/g,'_');

  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
});

// Admin-toggle: alleen admin mag wisselen
$('#adminToggle')?.addEventListener('change', ()=>{
  const adminView = isAdmin && $('#adminToggle').checked;
  attachRealtimeListeners(adminView);
});

// ===== Auth lifecycle =====
setFormDisabled(true); // tot auth klaar is

firebase.auth().onAuthStateChanged(async (user)=>{
  if (user) {
    currentUser = user;
    try {
      const prof = await db().collection('users').doc(user.uid).get();
      const role = prof.exists ? (prof.data().role || 'user') : 'user';
      isAdmin = (role === 'admin');

      $('#who').textContent  = user.email;
      $('#role').textContent = role;
      $('#role').style.display = 'inline-block';

      authView.classList.add('hidden');
      appView.classList.remove('hidden');

      const today = new Date();
      $('#datum').valueAsDate = today;
      $('#filterMaand').value = today.toISOString().slice(0,7);

      // Medewerker-filter alleen tonen voor admin
      $('#filterMedewerkerWrap')?.classList.toggle('hidden', !isAdmin);

      // Admin-toggle instellen op basis van rol
      $('#adminToggle').disabled = !isAdmin;
      $('#adminToggle').checked  = isAdmin;

      // Formulier aan
      setFormDisabled(false);

      // Start juiste query
      attachRealtimeListeners(isAdmin);

    } catch (err) {
      console.error(err);
      showMessage('Kan profiel niet laden: ' + (err.message || err),'error');
    }
  } else {
    currentUser = null;
    isAdmin = false;
    setFormDisabled(true);
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
  }
});

// Footer jaartal
$('#year').textContent = new Date().getFullYear();

