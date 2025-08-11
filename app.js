/* Simple client-side storage using localStorage */
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const state = {
  rows: JSON.parse(localStorage.getItem("uren_rows") || "[]"),
};

function save() {
  localStorage.setItem("uren_rows", JSON.stringify(state.rows));
}

function calcHours(start, end, pauze) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm/60;
  let e = eh + em/60;
  let diff = e - s;
  if (diff < 0) diff += 24; // overnight
  const res = Math.max(0, diff - (parseFloat(pauze) || 0));
  return Math.round(res * 100) / 100;
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('nl-NL');
  } catch { return d }
}

function render() {
  const tbody = $("#urenTable tbody");
  tbody.innerHTML = "";
  const filterWie = $("#filterWie").value;
  const filterMaand = $("#filterMaand").value; // yyyy-mm
  let total = 0;

  state.rows
    .sort((a,b) => (a.datum > b.datum ? -1 : 1))
    .forEach((r, idx) => {
      if (filterWie && r.voorWie !== filterWie) return;
      if (filterMaand && !r.datum.startsWith(filterMaand)) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.voorWie}</td>
        <td>${fmtDate(r.datum)}</td>
        <td>${r.starttijd}</td>
        <td>${r.eindtijd}</td>
        <td>${r.pauze}</td>
        <td><span class="badge">${r.uren.toFixed(2)}</span></td>
        <td>${r.opmerkingen || ""}</td>
        <td><input type="checkbox" ${r.goedgekeurd ? "checked": ""} data-idx="${idx}" class="approve"></td>
        <td><button data-idx="${idx}" class="danger del">Verwijder</button></td>
      `;
      tbody.appendChild(tr);
      total += r.uren;
    });

  $("#totals").textContent = "Totaal: " + (Math.round(total*100)/100) + " uur";
  $("#year").textContent = new Date().getFullYear();

  // bind row actions
  $$("#urenTable .del").forEach(btn => btn.addEventListener("click", (e) => {
    const i = +e.currentTarget.dataset.idx;
    state.rows.splice(i,1);
    save(); render();
  }));
  $$("#urenTable .approve").forEach(chk => chk.addEventListener("change", (e) => {
    const i = +e.currentTarget.dataset.idx;
    state.rows[i].goedgekeurd = e.currentTarget.checked;
    save();
  }));
}

$("#hours-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const row = {
    voorWie: $("#voorWie").value,
    datum: $("#datum").value,
    starttijd: $("#starttijd").value,
    eindtijd: $("#eindtijd").value,
    pauze: $("#pauze").value || "0",
    opmerkingen: $("#opmerkingen").value,
  };
  row.uren = calcHours(row.starttijd, row.eindtijd, row.pauze);
  row.goedgekeurd = false;
  state.rows.push(row);
  save();
  render();
  e.target.reset();
  $("#pauze").value = "0";
});

$("#reset").addEventListener("click", () => {
  $("#hours-form").reset();
  $("#pauze").value = "0";
});

$("#clearAll").addEventListener("click", () => {
  if (confirm("Weet je zeker dat je alle registraties wilt verwijderen?")) {
    state.rows = [];
    save(); render();
  }
});

$("#filterWie").addEventListener("change", render);
$("#filterMaand").addEventListener("change", render);

$("#exportCsv").addEventListener("click", () => {
  const rows = [["Voor wie","Datum","Start","Eind","Pauze","Uren","Opmerkingen","Goedgekeurd"]];
  const filterWie = $("#filterWie").value;
  const filterMaand = $("#filterMaand").value;
  state.rows.forEach(r => {
    if (filterWie && r.voorWie !== filterWie) return;
    if (filterMaand && !r.datum.startsWith(filterMaand)) return;
    rows.push([r.voorWie, fmtDate(r.datum), r.starttijd, r.eindtijd, r.pauze, r.uren, (r.opmerkingen||"").replace(/\n/g,' '), r.goedgekeurd ? "JA":"NEE"]);
  });
  const csv = rows.map(r => r.map(v => '"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n");
  const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "urenexport.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// set defaults
(function init() {
  const today = new Date();
  $("#datum").valueAsDate = today;
  $("#filterMaand").value = today.toISOString().slice(0,7);
  render();
})();