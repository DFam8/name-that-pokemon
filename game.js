'use strict';

// ────────────────────────────────────────────────────────────
//  CONFIG
// ────────────────────────────────────────────────────────────
const LIVES_MAX   = 3;
const REGEN_AT    = 100;   // lives restored every N correct
const CACHE_KEY   = 'pkmnquiz_v6_list';
const HS_KEY      = 'pkmnquiz_pts_v1';     // points-based score (renamed from count-based)
const REPORTS_KEY = 'pkmnquiz_reports';
const API_SCORES  = '/api/scores.php';

// ────────────────────────────────────────────────────────────
//  NAME FORMATTING
// ────────────────────────────────────────────────────────────
const SPECIAL = {
  'mr-mime':'Mr. Mime','mr-rime':'Mr. Rime','mime-jr':'Mime Jr.',
  'type-null':'Type: Null','ho-oh':'Ho-Oh','porygon-z':'Porygon-Z',
  'jangmo-o':'Jangmo-o','hakamo-o':'Hakamo-o','kommo-o':'Kommo-o',
  'tapu-koko':'Tapu Koko','tapu-lele':'Tapu Lele','tapu-bulu':'Tapu Bulu','tapu-fini':'Tapu Fini',
  'nidoran-f':'Nidoran♀','nidoran-m':'Nidoran♂',
  'flabebe':'Flabébé','farfetchd':"Farfetch'd",'sirfetchd':"Sirfetch'd",
  'great-tusk':'Great Tusk','scream-tail':'Scream Tail','brute-bonnet':'Brute Bonnet',
  'flutter-mane':'Flutter Mane','slither-wing':'Slither Wing','sandy-shocks':'Sandy Shocks',
  'iron-treads':'Iron Treads','iron-bundle':'Iron Bundle','iron-hands':'Iron Hands',
  'iron-jugulis':'Iron Jugulis','iron-moth':'Iron Moth','iron-thorns':'Iron Thorns',
  'roaring-moon':'Roaring Moon','iron-valiant':'Iron Valiant',
  'walking-wake':'Walking Wake','iron-leaves':'Iron Leaves',
  'gouging-fire':'Gouging Fire','raging-bolt':'Raging Bolt',
  'iron-boulder':'Iron Boulder','iron-crown':'Iron Crown',
  'chi-yu':'Chi-Yu','chien-pao':'Chien-Pao','ting-lu':'Ting-Lu','wo-chien':'Wo-Chien',
  'greninja-battle-bond':'Ash-Greninja',
  'pikachu-original-cap':'Pikachu (Original Cap)',
  'pikachu-hoenn-cap':'Pikachu (Hoenn Cap)',
  'pikachu-sinnoh-cap':'Pikachu (Sinnoh Cap)',
  'pikachu-unova-cap':'Pikachu (Unova Cap)',
  'pikachu-kalos-cap':'Pikachu (Kalos Cap)',
  'pikachu-alola-cap':'Pikachu (Alola Cap)',
  'pikachu-partner-cap':'Pikachu (Partner Cap)',
  'pikachu-world-cap':'Pikachu (World Cap)',
  'tauros-paldea-combat':'Paldean Tauros (Combat Breed)',
  'tauros-paldea-blaze':'Paldean Tauros (Blaze Breed)',
  'tauros-paldea-aqua':'Paldean Tauros (Aqua Breed)',
};
const REGIONAL = { alola:'Alolan', galar:'Galarian', hisui:'Hisuian', paldea:'Paldean' };

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function formatBase(n) {
  if (SPECIAL[n]) return SPECIAL[n];
  return n.split('-').map(cap).join(' ');
}
function formatName(api) {
  if (SPECIAL[api]) return SPECIAL[api];
  const p = api.split('-');
  const last = p[p.length - 1];

  for (const [region, prefix] of Object.entries(REGIONAL)) {
    const ri = p.indexOf(region);
    if (ri !== -1) {
      const base   = formatBase(p.slice(0, ri).join('-'));
      const suffix = p.slice(ri + 1);
      return prefix + ' ' + base + (suffix.length ? ' (' + suffix.map(cap).join(' ') + ')' : '');
    }
  }

  if (p.includes('mega')) {
    const mi = p.indexOf('mega');
    const suf = p.slice(mi+1).map(s => s.toUpperCase()).join(' ');
    return 'Mega ' + formatBase(p.slice(0,mi).join('-')) + (suf ? ' ' + suf : '');
  }
  if (last === 'gmax')   return 'Gigantamax ' + formatBase(p.slice(0,-1).join('-'));
  if (last === 'primal') return 'Primal '     + formatBase(p.slice(0,-1).join('-'));
  if (last === 'origin') return formatBase(p.slice(0,-1).join('-')) + ' (Origin Forme)';
  if (last === 'totem')  return 'Totem '      + formatBase(p.slice(0,-1).join('-'));

  return formatBase(api);
}

// ────────────────────────────────────────────────────────────
//  ANSWER CHECK  (exact + fuzzy Levenshtein)
// ────────────────────────────────────────────────────────────
function norm(s) {
  return s.toLowerCase()
    .replace(/♀/g,'f').replace(/♂/g,'m')
    .replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a')
    .replace(/[ïî]/g,'i').replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u')
    .replace(/[.'':,\-]/g,'').replace(/\s+/g,' ').trim();
}
function acceptedSet(display) {
  const s = new Set();
  const add = v => s.add(norm(v));
  add(display);
  add(display.replace('♀','F').replace('♂','M'));
  add(display.replace('♀','Female').replace('♂','Male'));
  add(display.replace(/[.'':]/g,''));
  add(display.replace(/[.'':]/g,' '));
  return s;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const row = Array.from({length: n+1}, (_,i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const val = a[i-1] === b[j-1] ? row[j-1] : 1 + Math.min(prev, row[j], row[j-1]);
      row[j-1] = prev;
      prev = val;
    }
    row[n] = prev;
  }
  return row[n];
}

function allowedErrors(len) {
  if (len <= 4)  return 0;
  if (len <= 7)  return 1;
  if (len <= 12) return 2;
  return 3;
}

function checkAnswer(typed, display) {
  const t = norm(typed);
  for (const v of acceptedSet(display)) {
    if (t === v) return { ok: true, fuzzy: false };
  }
  const target = norm(display);
  const dist = levenshtein(t, target);
  const ok = dist <= allowedErrors(target.length);
  return { ok, fuzzy: ok };
}

// ────────────────────────────────────────────────────────────
//  SPRITES
// ────────────────────────────────────────────────────────────
const artUrl = (id, sh) => sh
  ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${id}.png`
  : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const sprUrl = (id, sh) => sh
  ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`
  : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// ────────────────────────────────────────────────────────────
//  BUILD LIST
// ────────────────────────────────────────────────────────────
async function buildList(onProg) {
  try {
    const c = localStorage.getItem(CACHE_KEY);
    if (c) {
      const p = JSON.parse(c);
      if (p && p.length > 100) { onProg(100, `Loaded ${p.length} entries from cache`); return p; }
    }
  } catch(e) {}

  onProg(5, 'Connecting to PokéAPI…');
  const r = await fetch('https://pokeapi.co/api/v2/pokemon?limit=10000');
  if (!r.ok) throw new Error('Network error');
  const data = await r.json();

  onProg(15, `Building ${data.results.length} Pokémon…`);
  const list = [];
  const total = data.results.length;

  for (let i = 0; i < total; i++) {
    const pk = data.results[i];
    const id = parseInt(pk.url.split('/').filter(Boolean).pop());
    const d = formatName(pk.name);
    list.push({ id, api: pk.name, d, sh: false,  di: i });
    list.push({ id, api: pk.name, d: 'Shiny ' + d, sh: true, di: i });
    if (i % 100 === 0) onProg(15 + Math.round(i/total * 75), `Processing… (${i}/${total})`);
  }

  onProg(95, 'Saving…');
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch(e) {}
  onProg(100, `Ready — ${list.length} entries`);
  return list;
}

// ────────────────────────────────────────────────────────────
//  SHUFFLE / SORT
// ────────────────────────────────────────────────────────────
function shuffle(a) {
  const r = [...a];
  for (let i = r.length-1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// ────────────────────────────────────────────────────────────
//  TIMER
// ────────────────────────────────────────────────────────────
let timerStart = 0, timerEl, timerRAF;
function startTimer() {
  timerStart = Date.now();
  timerEl = document.getElementById('timer');
  function tick() {
    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    const m = String(Math.floor(elapsed/60)).padStart(2,'0');
    const s = String(elapsed % 60).padStart(2,'0');
    timerEl.textContent = m + ':' + s;
    timerRAF = requestAnimationFrame(tick);
  }
  tick();
}
function stopTimer() { cancelAnimationFrame(timerRAF); }

// ────────────────────────────────────────────────────────────
//  DOM HELPERS
// ────────────────────────────────────────────────────────────
const $id = id => document.getElementById(id);
const Screens = {
  title:    $id('title-screen'),
  settings: $id('settings-screen'),
  loading:  $id('loading-screen'),
  game:     $id('game-screen'),
  gameover: $id('gameover-screen'),
  complete: $id('complete-screen'),
};
function show(name) {
  Object.values(Screens).forEach(s => s.classList.remove('active'));
  Screens[name].classList.add('active');
}

// ────────────────────────────────────────────────────────────
//  GAME STATE
// ────────────────────────────────────────────────────────────
let allPk = [], gameList = [];
let G = {};
let shadowMode  = false;
let answerMode  = 'free';   // 'free' | 'auto' | 'choice'
let orderMode   = 'random';
let streak = 0;
let waiting = false;
let disputeTimer = null;

function pointsPerCorrect() {
  const base = answerMode === 'choice' ? 1 : answerMode === 'auto' ? 2 : 3;
  return base + (shadowMode ? 1 : 0);
}

function makeGameList() {
  if (orderMode === 'dex')   return [...allPk].sort((a,b) => a.di - b.di);
  if (orderMode === 'chaos') return shuffle(allPk);
  return shuffle(allPk);
}

function newGame() {
  stopTimer();
  gameList = makeGameList();
  G = { idx: 0, lives: LIVES_MAX, score: 0, correct: 0, total: gameList.length };
  streak = 0;
  waiting = false;
  show('game');
  updateHUD();
  startTimer();
  loadPk(0);
}

// ────────────────────────────────────────────────────────────
//  HUD
// ────────────────────────────────────────────────────────────
function getHS()  { return parseInt(localStorage.getItem(HS_KEY) || '0'); }
function saveHS(n){ localStorage.setItem(HS_KEY, n); }

function updateHUD() {
  $id('score-num').textContent = G.score;
  $id('score-den').textContent = 'pts';
  $id('score-best').textContent = G.correct + ' named · Best: ' + getHS() + ' pts';
  const pct = G.total > 0 ? G.correct / G.total * 100 : 0;
  $id('prog-fill').style.width = pct + '%';

  document.querySelectorAll('.heart').forEach(h => {
    h.classList.toggle('dead', parseInt(h.dataset.n) > G.lives);
  });

  const sb = $id('streak-badge');
  $id('streak-num').textContent = streak;
  sb.classList.toggle('on', streak >= 3);
}

// ────────────────────────────────────────────────────────────
//  SPRITE ID RESOLUTION
// ────────────────────────────────────────────────────────────
function resolveArtId(pk) {
  if (/^minior-.+-meteor$/.test(pk.api)) {
    const coreApi = pk.api.replace(/-meteor$/, '');
    const core = allPk.find(p => p.api === coreApi && !p.sh);
    if (core) return core.id;
  }
  return pk.id;
}

// For high-ID form variants that share artwork with their base Pokémon
// (e.g. miraidon-drive-mode, koraidon-sprinting-build), find the base ID.
// Returns null if no base is found, or if the Pokémon is already a base form.
function resolveFormBaseId(pk) {
  if (pk.id < 10000) return null;
  const parts = pk.api.split('-');
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(0, i).join('-');
    const base = allPk.find(p => p.id < 10000 && p.api === candidate && !p.sh);
    if (base) return base.id;
  }
  return null;
}

// ────────────────────────────────────────────────────────────
//  LOAD POKÉMON
// ────────────────────────────────────────────────────────────
function loadPk(idx) {
  const pk = gameList[idx];
  if (!pk) return;

  const artId = resolveArtId(pk);

  $id('pk-num').textContent = '#' + String(pk.id).padStart(3, '0');

  // Reset shared UI
  $id('feedback').textContent = ''; $id('feedback').className = 'feedback';
  $id('dispute-btn').style.display = 'none';
  $id('type-row').innerHTML = '';
  $id('autocomplete-list').classList.remove('visible');
  $id('holo-overlay').classList.remove('on');

  // Mode-specific input UI
  if (answerMode === 'choice') {
    $id('input-row').style.display   = 'none';
    $id('skip-btn').style.display    = 'none';
    $id('input-prompt').textContent  = 'Select the correct Pokémon';
    const choices = generateChoices(pk);
    renderChoices(choices, pk);
  } else {
    $id('input-row').style.display  = '';
    $id('skip-btn').style.display   = '';
    $id('choice-grid').classList.remove('visible');
    $id('choice-grid').innerHTML    = '';
    $id('input-prompt').textContent = answerMode === 'auto'
      ? 'Start typing to see suggestions'
      : 'Name this Pokémon';
    const inp = $id('name-input');
    inp.value = ''; inp.className = ''; inp.disabled = false;
    inp.placeholder = answerMode === 'auto' ? 'Type to search…' : 'Type name and press Enter…';
    $id('submit-btn').disabled = false;
    if (!('ontouchstart' in window)) inp.focus();
  }

  const img = $id('pk-img');
  img.className = 'hidden';
  if (shadowMode) img.classList.add('silhouette');

  // Build fallback chain: art → sprite, (shiny→non-shiny), then base form for high-ID variants
  const fallbacks = [sprUrl(artId, pk.sh)];
  if (pk.sh) {
    fallbacks.push(artUrl(artId, false));
    fallbacks.push(sprUrl(artId, false));
  }
  const baseId = resolveFormBaseId(pk);
  if (baseId) {
    fallbacks.push(artUrl(baseId, pk.sh));
    if (pk.sh) fallbacks.push(artUrl(baseId, false));
    fallbacks.push(sprUrl(baseId, false));
  }
  let fbIdx = 0;

  img.onerror = () => {
    if (fbIdx < fallbacks.length) { img.src = fallbacks[fbIdx++]; }
    else { img.onerror = null; img.classList.remove('hidden'); }
  };
  img.onload = () => {
    img.style.imageRendering = img.src.includes('/other/official-artwork') ? 'auto' : 'pixelated';
    img.classList.remove('hidden');
    void img.offsetWidth;
    img.classList.add('pop');
    if (shadowMode) img.classList.add('silhouette');
    if (pk.sh) {
      const holo = $id('holo-overlay');
      holo.style.setProperty('--holo-mask', `url("${img.src}")`);
      holo.classList.add('on');
    }
  };
  img.src = artUrl(artId, pk.sh);
}

// ────────────────────────────────────────────────────────────
//  REVEAL (show types after correct / wrong)
// ────────────────────────────────────────────────────────────
function revealPk(pk) {
  const img = $id('pk-img');
  img.classList.remove('silhouette');
  img.classList.add('correct-flash');

  fetch(`https://pokeapi.co/api/v2/pokemon/${pk.api}`)
    .then(r => r.json())
    .then(data => {
      const tr = $id('type-row');
      tr.innerHTML = '';
      (data.types || []).forEach(t => {
        const pill = document.createElement('span');
        pill.className = `type-pill on t-${t.type.name}`;
        pill.textContent = t.type.name;
        tr.appendChild(pill);
      });
    }).catch(() => {});
}

// ────────────────────────────────────────────────────────────
//  SUBMIT
// ────────────────────────────────────────────────────────────
function submit() {
  if (waiting) return;
  const inp = $id('name-input');
  const typed = inp.value.trim();
  if (!typed) return;

  const pk = gameList[G.idx];
  if (!pk) return;

  const { ok, fuzzy } = checkAnswer(typed, pk.d);

  if (ok) {
    inp.classList.add('ok');
    G.score += pointsPerCorrect();
    G.correct++;
    streak++;
    $id('feedback').className = 'feedback ok';
    $id('feedback').textContent = fuzzy ? `✓  Close enough! (${pk.d})` : `✓  ${pk.d}`;
    inp.disabled = true;
    $id('submit-btn').disabled = true;
    revealPk(pk);

    if (G.correct > 0 && G.correct % REGEN_AT === 0) {
      waiting = true;
      setTimeout(() => showMilestone(G.correct), 500);
    } else {
      waiting = true;
      setTimeout(advance, 800);
    }
  } else {
    inp.classList.add('bad');
    G.lives--;
    streak = 0;
    const hn = G.lives + 1;
    const h = document.querySelector(`.heart[data-n="${hn}"]`);
    if (h) { h.classList.add('pulse'); setTimeout(() => h.classList.remove('pulse'), 400); }
    updateHUD();

    inp.disabled = true;
    $id('submit-btn').disabled = true;

    if (G.lives <= 0) {
      $id('feedback').className = 'feedback bad';
      $id('feedback').textContent = `✗  It was "${pk.d}" — Game over!`;
      waiting = true;
      revealPk(pk);
      $id('dispute-btn').style.display = 'inline-block';
      disputeTimer = setTimeout(gameOver, 2400);
    } else {
      $id('feedback').className = 'feedback bad';
      $id('feedback').textContent = `✗  It was "${pk.d}" — ${G.lives} life${G.lives===1?'':'s'} left`;
      revealPk(pk);
      waiting = true;
      $id('dispute-btn').style.display = 'inline-block';
      disputeTimer = setTimeout(advance, 2000);
    }
  }
  updateHUD();
}

// ────────────────────────────────────────────────────────────
//  SKIP
// ────────────────────────────────────────────────────────────
function doSkip() {
  if (waiting) return;
  const inp = $id('name-input');
  inp.value = '???';
  inp.classList.add('bad');
  const pk = gameList[G.idx];
  G.lives--;
  streak = 0;
  const hn = G.lives + 1;
  const h = document.querySelector(`.heart[data-n="${hn}"]`);
  if (h) { h.classList.add('pulse'); setTimeout(() => h.classList.remove('pulse'), 400); }
  updateHUD();
  inp.disabled = true;
  $id('submit-btn').disabled = true;
  revealPk(pk);

  if (G.lives <= 0) {
    $id('feedback').className = 'feedback bad';
    $id('feedback').textContent = `It was "${pk.d}" — Game over!`;
    waiting = true;
    $id('dispute-btn').style.display = 'inline-block';
    disputeTimer = setTimeout(gameOver, 2400);
  } else {
    $id('feedback').className = 'feedback bad';
    $id('feedback').textContent = `It was "${pk.d}"`;
    waiting = true;
    $id('dispute-btn').style.display = 'inline-block';
    disputeTimer = setTimeout(advance, 2000);
  }
}

// ────────────────────────────────────────────────────────────
//  GAME FLOW
// ────────────────────────────────────────────────────────────
function advance() {
  waiting = false;
  G.idx++;
  if (G.idx >= gameList.length) { finishGame(true); return; }
  updateHUD();
  loadPk(G.idx);
}

function gameOver() { finishGame(false); }

function finishGame(isComplete) {
  waiting = false;
  stopTimer();
  const prev = getHS();
  const isNew = G.score > prev;
  if (isNew) saveHS(G.score);
  const hs = isNew ? G.score : prev;

  if (isComplete) {
    $id('cmp-total').textContent = G.correct.toLocaleString();
    $id('cmp-pts').textContent   = G.score.toLocaleString() + ' pts';
    $id('cmp-hs').textContent    = hs.toLocaleString();
    $id('cmp-record').classList.toggle('on', isNew);
    show('complete');
    initLeaderboard('cmp', G.score);
  } else {
    $id('go-score').textContent = G.correct.toLocaleString();
    $id('go-pts').textContent   = G.score.toLocaleString() + ' pts';
    $id('go-hs').textContent    = hs.toLocaleString();
    $id('go-record').classList.toggle('on', isNew);
    show('gameover');
    initLeaderboard('go', G.score);
  }
}

// ────────────────────────────────────────────────────────────
//  LEADERBOARD
// ────────────────────────────────────────────────────────────
function htmlEscape(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fetchLeaderboard() {
  try {
    const r = await fetch(API_SCORES);
    if (!r.ok) throw new Error('bad status');
    const d = await r.json();
    return d.scores || [];
  } catch { return null; }
}

async function submitScore(name, score) {
  const r = await fetch(API_SCORES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score }),
  });
  if (!r.ok) throw new Error('server error');
  return await r.json();
}

function qualifiesForBoard(score, scores) {
  if (!scores || score < 1) return false;
  if (scores.length < 10)  return true;
  return score > Math.min(...scores.map(s => s.score));
}

function renderLeaderboard(listEl, scores, highlightScore) {
  if (!scores) {
    listEl.innerHTML = '<div class="lb-empty">Could not reach the server.</div>';
    return;
  }
  if (!scores.length) {
    listEl.innerHTML = '<div class="lb-empty">No scores yet — be the first!</div>';
    return;
  }
  const medals = ['🥇','🥈','🥉'];
  listEl.innerHTML = scores.map((s, i) => `
    <div class="lb-row${highlightScore && s.score == highlightScore ? ' lb-you' : ''}">
      <span class="lb-rank">${medals[i] ?? (i + 1)}</span>
      <span class="lb-name">${htmlEscape(s.name)}</span>
      <span class="lb-score">${Number(s.score).toLocaleString()}</span>
    </div>
  `).join('');
}

async function initLeaderboard(suffix, score) {
  const listEl  = $id('lb-list-'  + suffix);
  const entryEl = $id('lb-entry-' + suffix);
  const nameEl  = $id('lb-name-'  + suffix);
  const saveBtn = $id('lb-save-'  + suffix);

  // Reset UI from any previous game
  listEl.innerHTML = '<div class="lb-loading">Loading…</div>';
  entryEl.classList.remove('visible');
  nameEl.value = '';
  saveBtn.disabled = false;
  saveBtn.textContent = 'Save';

  const scores = await fetchLeaderboard();
  renderLeaderboard(listEl, scores, null);

  if (qualifiesForBoard(score, scores)) {
    entryEl.classList.add('visible');
    if (!('ontouchstart' in window)) setTimeout(() => nameEl.focus(), 80);
  }

  // Replace handlers each game (onclick = natural dedup)
  let submitted = false;
  async function handleSave() {
    if (submitted) return;
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }
    submitted = true;
    saveBtn.disabled = true;
    saveBtn.textContent = '…';
    try {
      const res = await submitScore(name, score);
      entryEl.classList.remove('visible');
      renderLeaderboard(listEl, res.scores || scores, score);
    } catch {
      submitted = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  }
  saveBtn.onclick = handleSave;
  nameEl.onkeydown = e => { if (e.key === 'Enter') handleSave(); };
}

// ────────────────────────────────────────────────────────────
//  MULTIPLE CHOICE
// ────────────────────────────────────────────────────────────
function generateChoices(pk) {
  const correct = pk.d;
  // Draw wrong answers from the same shiny tier so "Shiny X" only appears vs other shinies
  const pool = allPk.filter(p => p.sh === pk.sh && p.d !== correct);
  const wrong = shuffle(pool).slice(0, 3).map(p => p.d);
  return shuffle([correct, ...wrong]);
}

function renderChoices(choices, pk) {
  const grid = $id('choice-grid');
  grid.innerHTML = '';
  choices.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => selectChoice(name, pk, choices));
    grid.appendChild(btn);
  });
  grid.classList.add('visible');
}

function selectChoice(picked, pk, choices) {
  if (waiting) return;

  // Disable all buttons and reveal the correct one
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === pk.d) btn.classList.add('correct');
  });

  if (picked === pk.d) {
    document.querySelectorAll('.choice-btn').forEach(btn => {
      if (btn.textContent === picked) btn.classList.add('correct');
    });
    G.score += pointsPerCorrect();
    G.correct++;
    streak++;
    $id('feedback').className = 'feedback ok';
    $id('feedback').textContent = `✓  ${pk.d}`;
    revealPk(pk);
    updateHUD();

    if (G.correct > 0 && G.correct % REGEN_AT === 0) {
      waiting = true;
      setTimeout(() => showMilestone(G.correct), 500);
    } else {
      waiting = true;
      setTimeout(advance, 900);
    }
  } else {
    document.querySelectorAll('.choice-btn').forEach(btn => {
      if (btn.textContent === picked) btn.classList.add('wrong');
    });
    G.lives--;
    streak = 0;
    const hn = G.lives + 1;
    const h = document.querySelector(`.heart[data-n="${hn}"]`);
    if (h) { h.classList.add('pulse'); setTimeout(() => h.classList.remove('pulse'), 400); }
    revealPk(pk);
    updateHUD();

    if (G.lives <= 0) {
      $id('feedback').className = 'feedback bad';
      $id('feedback').textContent = `✗  It was "${pk.d}" — Game over!`;
      waiting = true;
      $id('dispute-btn').style.display = 'inline-block';
      disputeTimer = setTimeout(gameOver, 2400);
    } else {
      $id('feedback').className = 'feedback bad';
      $id('feedback').textContent = `✗  It was "${pk.d}" — ${G.lives} life${G.lives === 1 ? '' : 's'} left`;
      waiting = true;
      $id('dispute-btn').style.display = 'inline-block';
      disputeTimer = setTimeout(advance, 2000);
    }
  }
}

// ────────────────────────────────────────────────────────────
//  AUTOCOMPLETE
// ────────────────────────────────────────────────────────────
function updateAutocomplete() {
  const typed = $id('name-input').value.trim();
  const list  = $id('autocomplete-list');

  if (typed.length < 2) { list.classList.remove('visible'); return; }

  const normTyped = norm(typed);
  const matches = allPk
    .filter(p => norm(p.d).startsWith(normTyped) || norm(p.d).includes(normTyped))
    .sort((a, b) => {
      const aS = norm(a.d).startsWith(normTyped) ? 0 : 1;
      const bS = norm(b.d).startsWith(normTyped) ? 0 : 1;
      return aS - bS || a.d.localeCompare(b.d);
    })
    .slice(0, 8);

  if (!matches.length) { list.classList.remove('visible'); return; }

  list.innerHTML = matches
    .map(p => `<div class="ac-item" data-name="${htmlEscape(p.d)}">${htmlEscape(p.d)}</div>`)
    .join('');
  list.classList.add('visible');

  list.querySelectorAll('.ac-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();   // stop blur firing before click
      $id('name-input').value = item.dataset.name;
      list.classList.remove('visible');
      submit();
    });
  });
}

// ────────────────────────────────────────────────────────────
//  SETTINGS PREVIEW (title screen)
// ────────────────────────────────────────────────────────────
function updatePtsPreview() {
  const el = $id('gs-pts-val');
  if (el) el.textContent = pointsPerCorrect();
}

// ────────────────────────────────────────────────────────────
//  MILESTONE
// ────────────────────────────────────────────────────────────
function showMilestone(n) {
  G.lives = LIVES_MAX;
  updateHUD();
  $id('ms-title').textContent = n + ' Named!';
  $id('ms-modal').classList.add('on');
}
$id('ms-continue').addEventListener('click', () => {
  $id('ms-modal').classList.remove('on');
  waiting = true;
  setTimeout(advance, 50);
});

// ────────────────────────────────────────────────────────────
//  THEME
// ────────────────────────────────────────────────────────────
const themeBtn = $id('theme-toggle');
themeBtn.addEventListener('click', () => {
  const html = document.documentElement;
  const dark = html.dataset.theme === 'dark';
  html.dataset.theme = dark ? 'light' : 'dark';
  themeBtn.textContent = dark ? '☀️' : '🌙';
});

// ────────────────────────────────────────────────────────────
//  SHADOW MODE
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
//  ORDER MODE
// ────────────────────────────────────────────────────────────
document.querySelectorAll('.toggle-btn[data-group="order"]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn[data-group="order"]').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    orderMode = btn.id.replace('order-', '');
  });
});

// ────────────────────────────────────────────────────────────
//  EVENTS
// ────────────────────────────────────────────────────────────
// Title leaderboard button
$id('lb-title-btn').addEventListener('click', async () => {
  const listEl = $id('lb-modal-list');
  listEl.innerHTML = '<div class="lb-loading">Loading…</div>';
  $id('lb-modal').classList.add('on');
  const scores = await fetchLeaderboard();
  renderLeaderboard(listEl, scores, null);
});
$id('lb-modal-close').addEventListener('click', () => $id('lb-modal').classList.remove('on'));
$id('lb-modal').addEventListener('click', e => {
  if (e.target === $id('lb-modal')) $id('lb-modal').classList.remove('on');
});

// Title → Settings
$id('start-btn').addEventListener('click', () => {
  // Kick off background load immediately so settings-screen time isn't wasted
  if (!_loadPromise) _loadPromise = buildList(() => {}).catch(() => null);
  show('settings');
});

// Settings back
$id('settings-back').addEventListener('click', () => show('title'));

// Settings → Game
let _loadPromise = null;
$id('play-btn').addEventListener('click', async () => {
  // Data already loaded from a previous game — skip loading screen entirely
  if (allPk.length) { newGame(); return; }

  show('loading');
  try {
    allPk = await (_loadPromise || buildList((pct, msg) => {
      $id('load-fill').style.width = pct + '%';
      $id('load-msg').textContent  = msg;
    }));
    if (!allPk || !allPk.length) {
      allPk = await buildList((pct, msg) => {
        $id('load-fill').style.width = pct + '%';
        $id('load-msg').textContent  = msg;
      });
    }
    _loadPromise = null;
    newGame();
  } catch(e) {
    $id('load-msg').textContent = 'Failed to load. Check your connection and refresh.';
    console.error(e);
  }
});

$id('submit-btn').addEventListener('click', submit);
$id('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
$id('skip-btn').addEventListener('click', doSkip);

$id('dispute-btn').addEventListener('click', () => {
  if (disputeTimer) { clearTimeout(disputeTimer); disputeTimer = null; }
  const pk = gameList[G.idx];
  if (G.lives < LIVES_MAX) {
    G.lives++;
    const hn = G.lives;
    const h = document.querySelector(`.heart[data-n="${hn}"]`);
    if (h) { h.classList.add('pulse'); setTimeout(() => h.classList.remove('pulse'), 400); }
  }
  G.score += pointsPerCorrect();
  G.correct++;
  streak++;
  updateHUD();
  $id('feedback').className = 'feedback ok';
  $id('feedback').textContent = `✓  Accepted — moving on`;
  $id('dispute-btn').style.display = 'none';
  waiting = true;
  setTimeout(advance, 1200);
});

$id('go-restart').addEventListener('click',  () => show('settings'));
$id('cmp-restart').addEventListener('click', () => show('settings'));

// ────────────────────────────────────────────────────────────
//  REPORT A MISTAKE
// ────────────────────────────────────────────────────────────
function openReport() {
  const pk = gameList[G.idx];
  $id('report-pk-info').textContent = pk ? `#${String(pk.id).padStart(3,'0')} ${pk.d}` : '';
  $id('report-text').value = '';
  $id('report-thanks').style.display = 'none';
  $id('report-submit').disabled = false;
  $id('report-modal').classList.add('on');
  setTimeout(() => $id('report-text').focus(), 50);
}

function closeReport() {
  $id('report-modal').classList.remove('on');
}

$id('report-btn').addEventListener('click', openReport);
$id('report-cancel').addEventListener('click', closeReport);
$id('report-modal').addEventListener('click', e => {
  if (e.target === $id('report-modal')) closeReport();
});

$id('report-submit').addEventListener('click', () => {
  const text = $id('report-text').value.trim();
  if (!text) { $id('report-text').focus(); return; }
  const pk = gameList[G.idx];
  const reports = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
  reports.push({
    date: new Date().toISOString(),
    pkId: pk?.id,
    pkName: pk?.d,
    pkApi: pk?.api,
    note: text,
  });
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  $id('report-submit').disabled = true;
  $id('report-thanks').style.display = 'block';
  setTimeout(closeReport, 1400);
});

// ────────────────────────────────────────────────────────────
//  TITLE SCREEN SETTINGS
// ────────────────────────────────────────────────────────────

// Answer mode cards
document.querySelectorAll('#answer-mode-opts .mode-card').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#answer-mode-opts .mode-card').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    answerMode = btn.dataset.mode;
    updatePtsPreview();
  });
});

// Silhouette toggle on title screen
$id('gs-shadow-btn').addEventListener('click', () => {
  shadowMode = !shadowMode;
  $id('gs-shadow-btn').classList.toggle('on', shadowMode);
  updatePtsPreview();
});

// Initialise preview text on page load
updatePtsPreview();

// ────────────────────────────────────────────────────────────
//  MOBILE KEYBOARD — shrink image so input stays visible
// ────────────────────────────────────────────────────────────
if ('ontouchstart' in window) {
  $id('name-input').addEventListener('focus', () => document.body.classList.add('keyboard-open'));
  $id('name-input').addEventListener('blur',  () => document.body.classList.remove('keyboard-open'));
}

// ────────────────────────────────────────────────────────────
//  AUTOCOMPLETE INPUT EVENTS
// ────────────────────────────────────────────────────────────
$id('name-input').addEventListener('input', () => {
  if (answerMode === 'auto') updateAutocomplete();
});

$id('name-input').addEventListener('blur', () => {
  // Small delay so mousedown on an ac-item fires first
  setTimeout(() => $id('autocomplete-list').classList.remove('visible'), 150);
});

$id('name-input').addEventListener('keydown', e => {
  if (e.key === 'Escape') $id('autocomplete-list').classList.remove('visible');
});

