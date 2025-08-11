// -------- Helpers --------
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const byMonth = (isoDate) => isoDate?.slice(0,7);

// calc hours including overnight
function calcHours(start, end, pauze) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm/60, e = eh + em/60, diff = e - s;
  if (diff < 0) diff += 24;
  return Math.max(0, diff - (parseFloat(pauze)||0));
}
function fmtDate(d) { try { return new Date(d).toLocaleDateString('nl-NL'); } catch { return d; } }

// -------- Auth UI switches --------
const authView = $('#auth-view');
const registerCard = $('#register-card');
const appView = $('#app-view');
$('#to-register').onclick = (e)=>{ e.preventDefault(); registerCard.classList.remove('hidden'); }
$('#to-login').onclick = (e)=>{ e.preventDefault(); registerCard.classList.add('hidden'); }
$('#forgot').onclick = async (e)=>{
  e.preventDefault();
  const email = prompt('Vul je e-mailadres in voor reset-link:');
  if (!email) return;
  try { await auth.sendPasswordResetEmail(email); alert('Reset e-mail verstuurd.'); }
  catch(err){ alert(err.message); }
};

// -------- Auth actions --------
$('#login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass  = $('#login-pass').value;
  try { await auth.signInWithEmailAndPassword(email, pass); }
  catch(err){ alert(err.message); }
});
$('#register-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#reg-email').value.trim();
  const pass  = $('#reg-pass').value;
  try { 
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    // maak user-profiel document
    await db.collection('users').doc(cred.user.uid).set({
      email, role: 'user', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('Account aangemaakt. Je bent ingelogd.');
  } catch(err){ alert(err.message); }
});
$('#logout').addEventListener('click', ()=> auth.signOut());

// -------- Data render --------
let unsubscribe = null;
let currentUser = null;
let allRows = [];

function attachRealtimeListeners(isAdmin) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  const month = $('#filterMaand').value;
  let q;
  if (isAdmin) {
    q = db.collectionGroup('entries').where('month','==',month).orderBy('createdAt','desc');
  } else {
    q = db.collection('users').doc(currentUser.uid).collection('entries')
      .where('month','==',month).orderBy('createdAt','desc');
  }
  unsubscribe = q.onSnapshot(snap => {
    allRows = snap.docs.map(d => ({ id: d.id, ...d.data(), uid: d.ref.parent.parent.id }));
    renderTable();
  });
}

function renderTable() {
  const tbody = $('#urenTable tbody');
  tbody.innerHTML = '';
  const whoFilter = $('#filterWie').value;
  let total = 0;
  allRows.forEach((r)=>{
    if (whoFilter && r.voorWie !== whoFilter) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.email || r.uid}</td>
      <td>${r.voorWie}</td>
      <td>${fmtDate(r.datum)}</td>
      <td>${r.starttijd}</td>
      <td>${r.eindtijd}</td>
      <td>${r.pauze}</td>
      <td><span class="badge">${(r.uren||0).toFixed(2)}</span></td>
      <td>${r.opmerkingen||''}</td>
      <td><input type="checkbox" ${r.goedgekeurd?'checked':''} data-id="${r.id}" data-uid="${r.uid}" class="approve"></td>
      <td><button class="danger del" data-id="${r.id}" data-uid="${r.uid}">Verwijder</button></td>
    `;
    tbody.appendChild(tr);
    total += r.uren||0;
  });
  $('#totals').textContent = 'Totaal: ' + (Math.round(total*100)/100) + ' uur';

  // bind actions
  $$('#urenTable .del').forEach(btn => btn.onclick = async (e)=>{
    const {id, uid} = e.target.dataset;
    const ref = db.collection('users').doc(uid).collection('entries').doc(id);
    if (!confirm('Weet je zeker dat je deze regel wilt verwijderen?')) return;
    await ref.delete();
  });
  $$('#urenTable .approve').forEach(ch => ch.onchange = async (e)=>{
    const {id, uid} = e.target.dataset;
    const ref = db.collection('users').doc(uid).collection('entries').doc(id);
    await ref.update({ goedgekeurd: e.target.checked });
  });
}

// submit new entry
$('#hours-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const row = {
    voorWie: $('#voorWie').value,
    datum: $('#datum').value,
    month: byMonth($('#datum').value),
    starttijd: $('#starttijd').value,
    eindtijd: $('#eindtijd').value,
    pauze: $('#pauze').value || '0',
    opmerkingen: $('#opmerkingen').value,
  };
  row.uren = calcHours(row.starttijd, row.eindtijd, row.pauze);
  row.goedgekeurd = false;
  row.email = currentUser.email;
  row.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  await db.collection('users').doc(currentUser.uid).collection('entries').add(row);
  e.target.reset();
  $('#pauze').value = '0';
});

$('#reset').onclick = ()=>{ $('#hours-form').reset(); $('#pauze').value='0'; };
$('#filterWie').onchange = renderTable;
$('#filterMaand').onchange = ()=> attachRealtimeListeners($('#adminToggle').checked);
$('#exportCsv').onclick = ()=>{
  const rows = [['Medewerker','Voor wie','Datum','Start','Eind','Pauze','Uren','Opmerkingen','Goedgekeurd']];
  allRows.forEach(r => rows.push([r.email||r.uid,r.voorWie,fmtDate(r.datum),r.starttijd,r.eindtijd,r.pauze,r.uren,(r.opmerkingen||'').replace(/\n/g,' '), r.goedgekeurd?'JA':'NEE']));
  const csv = rows.map(r => r.map(v => '"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href=url; a.download='urenexport.csv'; a.click(); URL.revokeObjectURL(url);
};

// Admin toggle (client-side guard; access is enforced by Firestore Rules)
$('#adminToggle').onchange = ()=> attachRealtimeListeners($('#adminToggle').checked);

// -------- Auth state --------
auth.onAuthStateChanged(async (user)=>{
  if (user) {
    currentUser = user;
    // fetch role from /users/{uid}
    const prof = await db.collection('users').doc(user.uid).get();
    const role = prof.exists ? (prof.data().role||'user') : 'user';
    $('#who').textContent = user.email;
    $('#role').textContent = role;
    $('#role').style.display = 'inline-block';
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    const today = new Date(); $('#datum').valueAsDate = today; $('#filterMaand').value = today.toISOString().slice(0,7);
    // admin switch only enabled if role === 'admin'
    $('#adminToggle').disabled = role !== 'admin';
    $('#adminToggle').checked = role === 'admin';
    attachRealtimeListeners(role==='admin');
  } else {
    currentUser = null;
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
  }
});

document.getElementById('year').textContent = new Date().getFullYear();
