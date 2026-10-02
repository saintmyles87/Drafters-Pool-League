// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyDF0DTsztP2yZBsPFe8XjYT3HXdlQN09nc",
  authDomain: "drafters-pool-league.firebaseapp.com",
  projectId: "drafters-pool-league",
  storageBucket: "drafters-pool-league.firebasestorage.app",
  messagingSenderId: "156482054211",
  appId: "1:156482054211:web:2fa0cb99776f6e1506ccf6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Global State
const ALL_PLAYERS = ["Myles", "Danny", "James", "Mike", "Craig", "Franny"];
let currentTournament = null;
let allTournaments = [];

// App Startup
document.addEventListener("DOMContentLoaded", () => {
  renderPlayerCheckboxes();
  listenToData();
  populateH2HSelects();
});

// Tab Router
function switchTab(tabKey) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach(el => {
    el.classList.remove("border-amber-400", "text-amber-400");
    el.classList.add("border-transparent");
  });

  document.getElementById(`sec-${tabKey}`).classList.remove("hidden");
  document.getElementById(`tab-${tabKey}`).classList.add("border-amber-400", "text-amber-400");

  if (tabKey === 'championship') renderChampionshipTable();
  if (tabKey === 'cumulative') renderCumulativeTable();
  if (tabKey === 'h2h') renderH2H();
}

// Render Setup Checkboxes
function renderPlayerCheckboxes() {
  const container = document.getElementById("player-checkboxes");
  if (!container) return;
  container.innerHTML = ALL_PLAYERS.map((p, i) => `
    <label class="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-700/50 text-xs cursor-pointer">
      <input type="checkbox" value="${p}" checked class="p-check accent-amber-400">
      <span>${p}</span>
    </label>
  `).join('');
}

// Generate Round Robin Fixtures
async function generateFixtures() {
  const selected = Array.from(document.querySelectorAll('.p-check:checked')).map(cb => cb.value);
  if (selected.length < 4 || selected.length > 6) {
    alert("Please select between 4 and 6 players.");
    return;
  }

  const matches = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      matches.push({
        id: `m_${Date.now()}_${i}_${j}`,
        p1: selected[i],
        p2: selected[j],
        p1Balls: null,
        p2Balls: null,
        completed: false,
        type: 'rr'
      });
    }
  }

  const tourneyData = {
    date: new Date().toISOString(),
    players: selected,
    status: 'active',
    matches: matches,
    playoffs: []
  };

  await db.collection("tournaments").add(tourneyData);
}

// Calculate Individual Match Points
function calculateMatchPoints(p1Balls, p2Balls) {
  if (p1Balls === null || p2Balls === null) return { p1Pts: 0, p2Pts: 0 };

  let p1Pts = p1Balls * 0.25;
  let p2Pts = p2Balls * 0.25;

  if (p1Balls > p2Balls) {
    p1Pts += 5.0; // Win
    if (p2Balls === 7) p2Pts += 1.0; // Loser on black
    if (p2Balls === 0) p1Pts += 1.0; // Shutout
  } else if (p2Balls > p1Balls) {
    p2Pts += 5.0;
    if (p1Balls === 7) p1Pts += 1.0;
    if (p1Balls === 0) p2Pts += 1.0;
  }

  return { p1Pts, p2Pts };
}

// Listen to Firestore Realtime Updates
function listenToData() {
  db.collection("tournaments").onSnapshot(snapshot => {
    allTournaments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    currentTournament = allTournaments.find(t => t.status === 'active') || allTournaments[0];

    if (currentTournament) {
      document.getElementById("attendance-card")?.classList.add("hidden");
      document.getElementById("tournament-table-card")?.classList.remove("hidden");
      document.getElementById("fixtures-card")?.classList.remove("hidden");
      document.getElementById("playoffs-card")?.classList.remove("hidden");

      renderTournamentTable();
      renderFixtures();
      renderPlayoffs();
    }
  });
}

// Render Live Tournament Table
function renderTournamentTable() {
  const { players, matches } = currentTournament;
  const stats = {};

  players.forEach(p => stats[p] = { player: p, p: 0, w: 0, l: 0, pts: 0, ballsFor: 0, ballsAgainst: 0 });

  matches.filter(m => m.completed).forEach(m => {
    const { p1Pts, p2Pts } = calculateMatchPoints(m.p1Balls, m.p2Balls);
    stats[m.p1].p++; stats[m.p2].p++;
    stats[m.p1].pts += p1Pts; stats[m.p2].pts += p2Pts;
    stats[m.p1].ballsFor += m.p1Balls; stats[m.p1].ballsAgainst += m.p2Balls;
    stats[m.p2].ballsFor += m.p2Balls; stats[m.p2].ballsAgainst += m.p1Balls;

    if (m.p1Balls > m.p2Balls) { stats[m.p1].w++; stats[m.p2].l++; }
    else { stats[m.p2].w++; stats[m.p1].l++; }
  });

  const sorted = Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.w !== a.w) return b.w - a.w;
    return (b.ballsFor - b.ballsAgainst) - (a.ballsFor - a.ballsAgainst);
  });

  const count = players.length;
  const badge = document.getElementById("player-count-badge");
  if (badge) badge.innerText = `${count} Players`;

  const tbody = document.getElementById("tbl-tournament");
  if (!tbody) return;

  tbody.innerHTML = sorted.map((row, idx) => {
    let borderClass = "";
    if (count === 6 && idx === 3) borderClass = "border-qualify-semi";
    if (count === 5 && idx === 0) borderClass = "border-qualify-direct-final";
    if (count === 5 && idx === 2) borderClass = "border-qualify-playoff";
    if (count === 4 && idx === 1) borderClass = "border-qualify-semi";

    return `
      <tr class="${borderClass}">
        <td class="p-1.5 text-slate-400 font-mono">${idx + 1}</td>
        <td class="p-1.5 font-bold text-slate-200">${row.player}</td>
        <td class="p-1.5 text-center">${row.p}</td>
        <td class="p-1.5 text-center text-emerald-400">${row.w}</td>
        <td class="p-1.5 text-center text-rose-400">${row.l}</td>
        <td class="p-1.5 text-right font-bold text-amber-400">${row.pts.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

// Render Fixtures Cards
function renderFixtures() {
  const container = document.getElementById("list-fixtures");
  if (!container) return;

  container.innerHTML = currentTournament.matches.map(m => {
    const isDone = m.completed;
    const { p1Pts, p2Pts } = calculateMatchPoints(m.p1Balls, m.p2Balls);

    return `
      <div class="bg-slate-900/80 p-3 rounded-lg border border-slate-700/60 flex justify-between items-center text-xs">
        <div class="space-y-1 flex-1">
          <div class="flex justify-between items-center pr-4">
            <span class="${m.p1Balls > m.p2Balls ? 'font-bold text-amber-400' : 'text-slate-300'}">${m.p1}</span>
            <span class="font-mono text-slate-400">${isDone ? `${m.p1Balls} b (${p1Pts.toFixed(2)} pts)` : ''}</span>
          </div>
          <div class="flex justify-between items-center pr-4">
            <span class="${m.p2Balls > m.p1Balls ? 'font-bold text-amber-400' : 'text-slate-300'}">${m.p2}</span>
            <span class="font-mono text-slate-400">${isDone ? `${m.p2Balls} b (${p2Pts.toFixed(2)} pts)` : ''}</span>
          </div>
        </div>
        <div>
          ${isDone 
            ? `<button onclick="openEditModal('${m.id}')" class="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded">Edit</button>`
            : `<button onclick="openEditModal('${m.id}')" class="bg-amber-500 text-slate-950 font-bold px-3 py-1 rounded">Score</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

// Render Playoffs Section
function renderPlayoffs() {
  const container = document.getElementById("playoffs-card");
  if (!currentTournament || !container) return;

  const { players, matches } = currentTournament;
  const allRRCompleted = matches.length > 0 && matches.every(m => m.completed);

  if (!allRRCompleted) {
    const completedCount = matches.filter(m => m.completed).length;
    container.innerHTML = `
      <h3 class="text-sm font-bold text-slate-200 mb-2">Playoffs</h3>
      <p class="text-xs text-slate-400">Complete all Round Robin matches to unlock playoffs (${completedCount}/${matches.length} completed).</p>
    `;
    return;
  }

  const stats = {};
  players.forEach(p => stats[p] = { player: p, p: 0, w: 0, l: 0, pts: 0, ballsFor: 0, ballsAgainst: 0 });

  matches.forEach(m => {
    const { p1Pts, p2Pts } = calculateMatchPoints(m.p1Balls, m.p2Balls);
    stats[m.p1].pts += p1Pts; stats[m.p2].pts += p2Pts;
    stats[m.p1].ballsFor += m.p1Balls; stats[m.p1].ballsAgainst += m.p2Balls;
    stats[m.p2].ballsFor += m.p2Balls; stats[m.p2].ballsAgainst += m.p1Balls;
    if (m.p1Balls > m.p2Balls) { stats[m.p1].w++; stats[m.p2].l++; }
    else { stats[m.p2].w++; stats[m.p1].l++; }
  });

  const sorted = Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.w !== a.w) return b.w - a.w;
    return (b.ballsFor - b.ballsAgainst) - (a.ballsFor - a.ballsAgainst);
  });

  const p1 = sorted[0]?.player || "Seed 1";
  const p2 = sorted[1]?.player || "Seed 2";
  const p3 = sorted[2]?.player || "Seed 3";
  const p4 = sorted[3]?.player || "Seed 4";

  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm font-bold text-amber-400">Final Playoffs</h3>
      <span class="text-[10px] bg-amber-400/10 text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded">Knockout Stage</span>
    </div>

    <div class="space-y-3">
      <div class="bg-slate-900 p-3 rounded-lg border border-slate-700/60">
        <p class="text-[10px] font-bold text-slate-400 mb-1">SEMI-FINAL 1 (1st vs 4th)</p>
        <div class="flex justify-between text-xs font-bold text-slate-200 py-1">
          <span>${p1} (1st)</span>
          <span>vs</span>
          <span>${p4} (4th)</span>
        </div>
      </div>

      <div class="bg-slate-900 p-3 rounded-lg border border-slate-700/60">
        <p class="text-[10px] font-bold text-slate-400 mb-1">SEMI-FINAL 2 (2nd vs 3rd)</p>
        <div class="flex justify-between text-xs font-bold text-slate-200 py-1">
          <span>${p2} (2nd)</span>
          <span>vs</span>
          <span>${p3} (3rd)</span>
        </div>
      </div>
    </div>
  `;
}

// Open Score Modal
function openEditModal(matchId) {
  const match = currentTournament.matches.find(m => m.id === matchId);
  const body = document.getElementById("modal-edit-body");
  if (!body) return;

  body.innerHTML = `
    <div>
      <label class="text-xs text-slate-400">${match.p1} Balls Potted (0-8)</label>
      <input type="number" id="inp-p1" min="0" max="8" value="${match.p1Balls ?? 0}" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-100">
    </div>
    <div>
      <label class="text-xs text-slate-400">${match.p2} Balls Potted (0-8)</label>
      <input type="number" id="inp-p2" min="0" max="8" value="${match.p2Balls ?? 0}" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-100">
    </div>
  `;

  document.getElementById("btn-save-edit").onclick = () => saveMatchScore(matchId);
  document.getElementById("modal-edit").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-edit").classList.add("hidden");
}

// Save Score to Firestore
async function saveMatchScore(matchId) {
  const p1B = parseInt(document.getElementById("inp-p1").value);
  const p2B = parseInt(document.getElementById("inp-p2").value);

  const updatedMatches = currentTournament.matches.map(m => {
    if (m.id === matchId) {
      return { ...m, p1Balls: p1B, p2Balls: p2B, completed: true };
    }
    return m;
  });

  await db.collection("tournaments").doc(currentTournament.id).update({ matches: updatedMatches });
  closeModal();
}

// Populate Head-to-Head Dropdowns
function populateH2HSelects() {
  const p1Sel = document.getElementById("h2h-p1");
  const p2Sel = document.getElementById("h2h-p2");
  if (!p1Sel || !p2Sel) return;

  p1Sel.innerHTML = ALL_PLAYERS.map(p => `<option value="${p}">${p}</option>`).join('');
  p2Sel.innerHTML = ALL_PLAYERS.map((p, i) => `<option value="${p}" ${i === 1 ? 'selected' : ''}>${p}</option>`).join('');
}

// Render Head-to-Head Comparison
function renderH2H() {
  const p1 = document.getElementById("h2h-p1").value;
  const p2 = document.getElementById("h2h-p2").value;
  const card = document.getElementById("h2h-result-card");
  if (!card) return;

  if (p1 === p2) {
    card.innerHTML = `<p class="text-xs text-slate-400">Select two different players.</p>`;
    return;
  }

  let p1Wins = 0, p2Wins = 0, p1Balls = 0, p2Balls = 0, totalMatches = 0;

  allTournaments.forEach(t => {
    t.matches.filter(m => m.completed && ((m.p1 === p1 && m.p2 === p2) || (m.p1 === p2 && m.p2 === p1))).forEach(m => {
      totalMatches++;
      const isP1First = m.p1 === p1;
      const p1B = isP1First ? m.p1Balls : m.p2Balls;
      const p2B = isP1First ? m.p2Balls : m.p1Balls;

      p1Balls += p1B;
      p2Balls += p2B;

      if (p1B > p2B) p1Wins++;
      else if (p2B > p1B) p2Wins++;
    });
  });

  card.innerHTML = `
    <div class="text-xs text-slate-400">Total Played: <span class="text-slate-200 font-bold">${totalMatches}</span></div>
    <div class="grid grid-cols-2 gap-2 text-sm pt-1">
      <div class="bg-slate-800 p-2 rounded border border-slate-700">
        <p class="text-slate-400 text-[10px]">${p1}</p>
        <p class="text-amber-400 font-bold text-lg">${p1Wins} W</p>
        <p class="text-slate-400 text-[10px]">${p1Balls} total balls</p>
      </div>
      <div class="bg-slate-800 p-2 rounded border border-slate-700">
        <p class="text-slate-400 text-[10px]">${p2}</p>
        <p class="text-amber-400 font-bold text-lg">${p2Wins} W</p>
        <p class="text-slate-400 text-[10px]">${p2Balls} total balls</p>
      </div>
    </div>
  `;
}