const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const byMonth = (isoDate) => isoDate?.slice(0,7);
function calcHours(start, end, pauze) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm/60, e = eh + em/60, diff = e - s;
  if (diff < 0) diff += 24;
  return Math.max(0, diff - (parseFloat(pauze)||0));
}
function fmtDate(d) { try { return new Date(d).toLocaleDateString('nl-NL'); } catch { return d; } }
const auth = () => window.auth;
const db   = () => window.db;
const authView = document.getElementById('auth-view');
const registerCard = document.getElementById('register-card');
const appView = document.getElementById('app-view');
document.getElementById('to-register')?.addEventListener('click',(e)=>{ e.preventDefault(); registerCard.classList.remove('hidden'); });
document.getElementById('to-login')?.addEventListener('click',(e)=>{ e.preventDefault(); registerCard.classList.add('hidden'); });
document.getElementById('forgot')?.addEventListener('click', async (e)=>{
  e.preventDefault();
  const email = prompt('Vul je e-mailadres in voor reset-link:');
  if (!email) return;
  try { await auth().sendPasswordResetEmail(email); alert('Reset e-mail verstuurd.'); }
  catch(err){ alert(err.message); }
});
document.getElementById('login-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  try { await auth().signInWithEmailAndPassword(email, pass); }
  catch(err){ alert(err.message); }
});
document.getElementById('register-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  try { 
    const cred = await auth().createUserWithEmailAndPassword(email, pass);
    await db().collection('users').doc(cred.user.uid).set({
      email, role: 'user', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('Account aangemaakt. Je bent ingelogd.');
  } catch(err){ alert(err.message); }
});
document.getElementById('logout')?.addEventListener('click', ()=> auth().signOut());
let unsubscribe = null;
let currentUser = null;
let isAdmin = false;
let allRows = [];
function attachRealtimeListeners(isAdmin) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  const month = document.getElementById('filterMaand').value;
  let q;
  if (isAdmin) {
    q = db().collectionGroup('entries').where('month','==',month).orderBy('createdAt','desc');
  } else {
    q = db().collection('users').doc(currentUser.uid).collection('entries')
      .where('month','==',month).orderBy('createdAt','desc');
  }
  unsubscribe = q.onSnapshot(snap => {
    allRows = snap.docs.map(d => ({ id: d.id, ...d.data(), uid: d.ref.parent.parent.id }));
    renderTable();
  });
}
function renderTable() {
  const tbody = document.querySelector('#urenTable tbody');
  tbody.innerHTML = '';
  const whoFilter = document.getElementById('filterWie').value;
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
      <td>${
  isAdmin
    ? `<input type="checkbox" ${r.goedgekeurd ? 'checked' : ''} data-id="${r.id}" data-uid="${r.uid}" class="approve">`
    : (r.goedgekeurd ? 'JA' : 'NEE')
}</td>

      <td><button class="danger del" data-id="${r.id}" data-uid="${r.uid}">Verwijder</button></td>
    `;
    tbody.appendChild(tr);
    total += r.uren||0;
  });
  document.getElementById('totals').textContent = 'Totaal: ' + (Math.round(total*100)/100) + ' uur';
  document.querySelectorAll('#urenTable .del').forEach(btn => btn.onclick = async (e)=>{
    const {id, uid} = e.target.dataset;
    const ref = db().collection('users').doc(uid).collection('entries').doc(id);
    if (!confirm('Weet je zeker dat je deze regel wilt verwijderen?')) return;
    await ref.delete();
  });
  if (isAdmin) {
  document.querySelectorAll('#urenTable .approve').forEach(ch => ch.onchange = async (e)=>{
    const {id, uid} = e.target.dataset;
    const ref = db().collection('users').doc(uid).collection('entries').doc(id);
    await ref.update({ goedgekeurd: e.target.checked });
  });
}

}
document.getElementById('hours-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const row = {
    voorWie: document.getElementById('voorWie').value,
    datum: document.getElementById('datum').value,
    month: (document.getElementById('datum').value||'').slice(0,7),
    starttijd: document.getElementById('starttijd').value,
    eindtijd: document.getElementById('eindtijd').value,
    pauze: document.getElementById('pauze').value || '0',
    opmerkingen: document.getElementById('opmerkingen').value,
  };
  row.uren = calcHours(row.starttijd, row.eindtijd, row.pauze);
  row.goedgekeurd = false;
  row.email = (currentUser||{}).email;
  row.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  await db().collection('users').doc(currentUser.uid).collection('entries').add(row);
  e.target.reset();
  document.getElementById('pauze').value = '0';
});
document.getElementById('reset')?.addEventListener('click', ()=>{ 
  document.getElementById('hours-form').reset(); 
  document.getElementById('pauze').value='0'; 
});
document.getElementById('filterWie')?.addEventListener('change', renderTable);
document.getElementById('filterMaand')?.addEventListener('change', ()=> attachRealtimeListeners(document.getElementById('adminToggle').checked));
document.getElementById('exportCsv')?.addEventListener('click', ()=>{
  const rows = [['Medewerker','Voor wie','Datum','Start','Eind','Pauze','Uren','Opmerkingen','Goedgekeurd']];
  allRows.forEach(r => rows.push([r.email||r.uid,r.voorWie,fmtDate(r.datum),r.starttijd,r.eindtijd,r.pauze,r.uren,(r.opmerkingen||'').replace(/\n/g,' '), r.goedgekeurd?'JA':'NEE']));
  const csv = rows.map(r => r.map(v => '"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href=url; a.download='urenexport.csv'; a.click(); URL.revokeObjectURL(url);
});
document.getElementById('adminToggle')?.addEventListener('change', ()=> attachRealtimeListeners(document.getElementById('adminToggle').checked));
firebase.auth().onAuthStateChanged(async (user)=>{
  if (user) {
    currentUser = user;
    const prof = await db().collection('users').doc(user.uid).get();
    const role = prof.exists ? (prof.data().role||'user') : 'user';
    isAdmin = (role === 'admin');
    document.getElementById('who').textContent = user.email;
    document.getElementById('role').textContent = role;
    document.getElementById('role').style.display = 'inline-block';
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    const today = new Date(); 
    document.getElementById('datum').valueAsDate = today; 
    document.getElementById('filterMaand').value = today.toISOString().slice(0,7);
    document.getElementById('adminToggle').disabled = role !== 'admin';
    document.getElementById('adminToggle').checked = role === 'admin';
    attachRealtimeListeners(role==='admin');
  } else {
    currentUser = null;
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
  }
});
document.getElementById('year').textContent = new Date().getFullYear();
