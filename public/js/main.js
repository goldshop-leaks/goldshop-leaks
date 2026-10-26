/* ═══════════════════════════════════════════════════
   GoldShop Leaks — Main JS
═══════════════════════════════════════════════════ */

let currentUser = null;
let currentCat  = null;
let currentPage = 1;
let categories  = [];

// ── Toast ─────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success:'✅', error:'❌', info:'⚡' };
  el.innerHTML = `<span>${icons[type]||'⚡'}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Session ───────────────────────────────────────
async function loadUser() {
  try {
    const r = await fetch('/api/me');
    const d = await r.json();
    if (!d.loggedIn) return;
    currentUser = d;
    renderNav(d);
  } catch(e) {}
}

function renderNav(user) {
  const area = document.getElementById('navAuthArea');
  if (!area) return;
  area.innerHTML = `
    <div class="user-menu">
      <div class="user-av-btn" onclick="toggleDrop()">
        <div class="user-av">${user.username[0].toUpperCase()}</div>
        <span class="user-av-name">${user.username}</span>
        <span class="user-av-chevron">▾</span>
      </div>
      <div class="user-dropdown" id="userDrop">
        <div class="user-dropdown-header">
          <div class="uname">${user.username}</div>
          <div class="urole">${user.is_admin ? '👑 Admin' : '👤 Membre'}</div>
        </div>
        ${user.is_admin ? '<a href="/admin">🛠️ Panel Admin</a>' : ''}
        <button onclick="logout()">🚪 Déconnexion</button>
      </div>
    </div>`;
}

function toggleDrop() {
  document.getElementById('userDrop')?.classList.toggle('active');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu'))
    document.getElementById('userDrop')?.classList.remove('active');
  if (!e.target.closest('.lang-picker'))
    document.getElementById('langPicker')?.classList.remove('open');
});

async function logout() {
  await fetch('/api/logout', { method:'POST' });
  window.location.reload();
}

// ── Langue ────────────────────────────────────────
function toggleLang(e) {
  e.stopPropagation();
  document.getElementById('langPicker').classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('langDropdown');
  if (!dropdown) return;
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = e.target.closest('.lang-item');
    if (!item) return;
    dropdown.querySelectorAll('.lang-item').forEach(el => {
      el.classList.remove('active');
      el.querySelector('.lang-check')?.remove();
    });
    item.classList.add('active');
    const check = document.createElement('span');
    check.className = 'lang-check';
    check.textContent = '✓';
    item.appendChild(check);
    document.getElementById('langPicker').classList.remove('open');
  });
});

// ── Categories ────────────────────────────────────
async function loadCategories() {
  try {
    const r = await fetch('/api/categories');
    categories = await r.json();

    const list = document.getElementById('catList');
    if (!list) return;

    list.innerHTML = `
      <li class="cat-item active" onclick="filterCat(null,this)" data-id="">
        <div class="cat-thumb-icon">🏠</div>
        <div class="cat-info">
          <div class="cat-name">Tout</div>
          <div class="cat-count" id="countAll">0 ressources</div>
        </div>
      </li>`;

    categories.forEach(c => {
      const icon = c.icon.startsWith('/') ? '📁' : c.icon;
      const li   = document.createElement('li');
      li.className  = 'cat-item';
      li.dataset.id = c.id;
      li.onclick    = () => filterCat(c.id, li);
      li.innerHTML  = `
        <div class="cat-thumb-icon">${icon}</div>
        <div class="cat-info">
          <div class="cat-name">${c.name}</div>
          <div class="cat-count">${c.description || ''}</div>
        </div>`;
      list.appendChild(li);
    });
  } catch(e) {}
}

function filterCat(id, el) {
  currentCat  = id;
  currentPage = 1;

  document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('active'));
  el?.classList.add('active');

  // Basculer entre home et vue filtrée
  const isHome = id === null;
  document.getElementById('homeSections').style.display  = isHome ? '' : 'none';
  document.getElementById('featuredSection').style.display = isHome ? '' : 'none';
  document.getElementById('sectionAll').style.display    = isHome ? 'none' : '';

  if (!isHome) {
    const label = categories.find(c => c.id === id)?.name || 'Leaks';
    document.getElementById('sectionAllTitle').textContent = label;
    loadAll();
  }
}

function showAll(type = '') {
  // Afficher tous les leaks
  currentCat  = null;
  currentPage = 1;
  document.getElementById('homeSections').style.display   = 'none';
  document.getElementById('featuredSection').style.display = 'none';
  document.getElementById('ctaBanner').style.display      = 'none';
  document.getElementById('sectionAll').style.display     = '';
  document.getElementById('sectionAllTitle').textContent  = type === 'popular' ? 'Les plus téléchargés' : 'Nouveautés';
  loadAll(false, type);
}

// ── Home sections ─────────────────────────────────
async function loadHomeSections() {
  const [popRes, newRes] = await Promise.all([
    fetch('/api/leaks?sort=popular&page=1'),
    fetch('/api/leaks?page=1')
  ]);
  const popular = await popRes.json();
  const newer   = await newRes.json();

  renderCards('popularGrid', popular.slice(0, 5));
  renderCards('newGrid',     newer.slice(0, 5));

  // Featured
  if (popular.length > 0) {
    renderFeatured(popular[0]);
    document.getElementById('featuredSection').style.display = '';
  }
}

// ── Featured ──────────────────────────────────────
function renderFeatured(leak) {
  const card = document.getElementById('featuredCard');
  if (!card) return;
  const catIcon = (!leak.category_icon || leak.category_icon.startsWith('/')) ? '' : leak.category_icon;

  card.onclick = () => {
    if (!currentUser) { window.location.href = '/login'; return; }
    openModal(leak.id);
  };

  card.innerHTML = `
    ${leak.thumbnail
      ? `<img class="featured-bg" src="${leak.thumbnail}" alt="${leak.title}">`
      : `<div class="featured-bg-placeholder"></div>`}
    <div class="featured-overlay"></div>
    <span class="featured-trend">TENDANCE #1</span>
    <div class="featured-content">
      <div class="featured-label">À LA UNE CETTE SEMAINE</div>
      <div class="featured-title">${leak.title}</div>
      ${leak.description ? `<div class="featured-sub">${leak.description.substring(0,80)}${leak.description.length>80?'...':''}</div>` : ''}
      <div class="featured-stats">
        <span>📈 ${leak.download_count || 0} vues</span>
        <span>⬇️ ${leak.download_count || 0}</span>
      </div>
      <div class="featured-dot-nav">
        <div class="featured-dot active"></div>
        <div class="featured-dot"></div>
        <div class="featured-dot"></div>
      </div>
      <button class="slide-btn-primary" onclick="event.stopPropagation();${currentUser ? `openModal(${leak.id})` : `window.location.href='/login'`}">
        ⬇️ Voir la ressource
      </button>
    </div>`;
}

// ── Render cards grid ─────────────────────────────
function renderCards(gridId, leaks) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (!leaks || leaks.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="min-width:200px">
      <span class="empty-icon">📭</span>
      <h3>Aucun leak</h3><p>Reviens plus tard !</p>
    </div>`;
    return;
  }
  grid.innerHTML = leaks.map(l => buildCard(l)).join('');
}

function buildCard(l) {
  const catIcon = (!l.category_icon || l.category_icon.startsWith('/')) ? '' : l.category_icon;
  const catName = l.category_name || 'LEAK';
  const stars   = '★★★★★';

  const thumb = l.thumbnail
    ? `<img src="${l.thumbnail}" alt="${l.title}" loading="lazy">`
    : `<div class="res-card-thumb-placeholder">${catIcon || '📦'}</div>`;

  const action = currentUser ? `openModal(${l.id})` : `window.location.href='/login'`;

  return `
    <div class="res-card" onclick="${action}">
      <div class="res-card-thumb">
        ${thumb}
        <span class="res-badge-cat">${catName.toUpperCase()}</span>
        <span class="res-badge-free">GRATUIT</span>
      </div>
      <div class="res-card-body">
        <div class="res-card-title">${l.title}</div>
        <div class="res-card-author">Par <strong>${l.author_name || 'Admin'}</strong></div>
        <div class="res-card-stars">${stars}</div>
        <div class="res-card-meta">
          <span>👁 ${l.download_count||0}</span>
          <span>⬇️ ${l.download_count||0}</span>
          <span>💬 0</span>
        </div>
      </div>
    </div>`;
}

// ── Load all (vue filtrée) ────────────────────────
async function loadAll(append = false, sort = '') {
  const grid = document.getElementById('allGrid');
  if (!grid) return;
  if (!append) grid.innerHTML = `<div class="loader" style="grid-column:1/-1"><div class="spinner"></div></div>`;

  const search = document.getElementById('navSearch')?.value || document.getElementById('heroSearch')?.value || '';
  const params = new URLSearchParams({ page: currentPage });
  if (currentCat)    params.set('category', currentCat);
  if (search.trim()) params.set('search', search.trim());
  if (sort)          params.set('sort', sort);

  try {
    const r     = await fetch(`/api/leaks?${params}`);
    const leaks = await r.json();
    if (!append) grid.innerHTML = '';
    if (leaks.length === 0 && !append) {
      grid.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span><h3>Aucun résultat</h3></div>`;
      document.getElementById('loadMoreWrap').style.display = 'none';
      return;
    }
    grid.innerHTML += leaks.map(l => buildCard(l)).join('');
    document.getElementById('leakCount').textContent = `${grid.querySelectorAll('.res-card').length} résultat(s)`;
    document.getElementById('loadMoreWrap').style.display = leaks.length === 12 ? '' : 'none';
  } catch(e) {}
}

// ── Modal ─────────────────────────────────────────
async function openModal(id) {
  if (!currentUser) { window.location.href = '/login'; return; }
  const overlay = document.getElementById('leakModal');
  overlay.classList.add('active');
  document.getElementById('modalTitle').textContent = 'Chargement...';
  document.getElementById('modalMedia').innerHTML   = `<div class="loader"><div class="spinner"></div></div>`;
  document.getElementById('modalDesc').textContent  = '';
  document.getElementById('modalTags').innerHTML    = '';
  document.getElementById('modalActions').innerHTML = '';
  document.getElementById('modalMeta').textContent  = '';
  document.getElementById('modalCat').textContent   = '';

  try {
    const r    = await fetch(`/api/leaks/${id}`);
    const leak = await r.json();
    const catIcon = (!leak.category_icon || leak.category_icon.startsWith('/')) ? '📦' : leak.category_icon;
    document.getElementById('modalCat').textContent   = `${catIcon}  ${leak.category_name || 'Général'}`;
    document.getElementById('modalTitle').textContent = leak.title;
    document.getElementById('modalDesc').textContent  = leak.description || '';
    document.getElementById('modalMeta').textContent  = `⬇️ ${leak.download_count||0} · 📅 ${new Date(leak.created_at).toLocaleDateString('fr-FR')} · ✍️ ${leak.author_name||'Admin'}`;
    if (leak.tags) {
      document.getElementById('modalTags').innerHTML = leak.tags.split(',').filter(t=>t.trim()).map(t=>`<span class="tag">${t.trim()}</span>`).join('');
    }
    let media = '';
    if (leak.video_url) {
      if (leak.video_url.includes('youtu')) {
        const vid = leak.video_url.includes('youtu.be') ? leak.video_url.split('/').pop().split('?')[0] : new URL(leak.video_url).searchParams.get('v');
        media = `<iframe class="modal-video" src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe>`;
      } else {
        media = `<video class="modal-video" controls><source src="${leak.video_url}"></video>`;
      }
    } else if (leak.thumbnail) {
      media = `<img src="${leak.thumbnail}" class="modal-thumb" alt="${leak.title}">`;
    }
    document.getElementById('modalMedia').innerHTML   = media;
    document.getElementById('modalActions').innerHTML = `<button class="btn btn-primary" onclick="downloadLeak(${leak.id})">⬇️ Voir la ressource</button>`;
  } catch(e) {
    document.getElementById('modalTitle').textContent = 'Erreur';
    document.getElementById('modalMedia').innerHTML   = '';
  }
}

async function downloadLeak(id) {
  try {
    const r = await fetch(`/api/leaks/${id}/download`, { method:'POST' });
    const d = await r.json();
    if (d.url) { window.open(d.url, '_blank'); toast('Téléchargement lancé !', 'success'); }
  } catch(e) { toast('Erreur.', 'error'); }
}

document.getElementById('modalClose').addEventListener('click', () => document.getElementById('leakModal').classList.remove('active'));
document.getElementById('leakModal').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('active'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('leakModal')?.classList.remove('active'); });

// ── Search ────────────────────────────────────────
function doSearch() {
  document.getElementById('homeSections').style.display    = 'none';
  document.getElementById('featuredSection').style.display = 'none';
  document.getElementById('sectionAll').style.display      = '';
  document.getElementById('sectionAllTitle').textContent   = 'Résultats de recherche';
  currentPage = 1;
  loadAll();
}

document.getElementById('navSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
document.getElementById('heroSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
document.getElementById('navSearch')?.addEventListener('input', e => { const h = document.getElementById('heroSearch'); if (h) h.value = e.target.value; });
document.getElementById('heroSearch')?.addEventListener('input', e => { const n = document.getElementById('navSearch'); if (n) n.value = e.target.value; });

document.getElementById('loadMoreBtn')?.addEventListener('click', () => { currentPage++; loadAll(true); });

// ── Carrousel scroll ──────────────────────────────
function scrollCarousel(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollBy({ left: dir * 440, behavior: 'smooth' });
}

// ── Animate number ────────────────────────────────
function animNum(id, target) {
  const el = document.getElementById(id);
  if (!el || !target) return;
  let cur = 0;
  const step = Math.max(1, Math.ceil(target / 40));
  const t = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur.toLocaleString('fr-FR');
    if (cur >= target) clearInterval(t);
  }, 25);
}

// ── Init ──────────────────────────────────────────
(async () => {
  await loadUser();
  await Promise.all([loadCategories(), loadHomeSections()]);

  // Stats EN BREF + hero
  try {
    const r = await fetch('/api/public/stats');
    const d = await r.json();
    animNum('statUsers', d.users || 0);
    animNum('statLeaks', d.leaks || 0);
    animNum('briefUsers', d.users || 0);
    document.getElementById('countAll').textContent      = `${d.leaks || 0} ressources`;
    document.getElementById('briefOnline').textContent   = '134';
    document.getElementById('briefDiscord').textContent  = d.discordMembers || '0';
    document.getElementById('briefDiscordOnline').textContent = d.discordOnline || '0';
  } catch(e) {}

  // Lien Discord
  try {
    const r = await fetch('/api/settings/discord-invite');
    const d = await r.json();
    if (d.url) { const btn = document.getElementById('discordBtn'); if (btn) btn.href = d.url; }
  } catch(e) {}

  // Bannière hero
  try {
    const r = await fetch('/api/settings/hero-banner');
    const d = await r.json();
    if (d.url) {
      const img = document.getElementById('heroBgImg');
      if (img) img.src = d.url;
    }
  } catch(e) {}
})();

/* ═══════════════════════════════════════════════════
   SLIDER
═══════════════════════════════════════════════════ */
let sliderData    = [];
let sliderCurrent = 0;
let sliderTimer   = null;

async function loadSlider() {
  try {
    const r    = await fetch('/api/slides');
    sliderData = await r.json();
    if (!sliderData.length) return;
    document.getElementById('sliderSection').style.display = '';
    renderSlider();
    startSliderAuto();
  } catch(e) {}
}

function renderSlider() {
  const track  = document.getElementById('sliderTrack');
  const thumbs = document.getElementById('sliderThumbs');
  if (!track || !thumbs) return;

  track.innerHTML = sliderData.map(s => `
    <div class="slide" style="min-width:100%">
      ${s.image ? `<img class="slide-bg" src="${s.image}" alt="${s.title}">` : `<div class="slide-bg" style="background:linear-gradient(135deg,#1a0535,#0a0a16)"></div>`}
      <div class="slide-overlay"></div>
      <div class="slide-content">
        <div class="slide-sponsor-row">
          <div class="slide-sponsor-logo">${s.image ? `<img src="${s.image}" alt="">` : '⚡'}</div>
          <span class="slide-sponsor-name">${s.subtitle || 'Sponsor'}</span>
          <span class="slide-sponso-badge">Sponsorisé</span>
        </div>
        <div class="slide-title">${s.title}</div>
        ${s.description ? `<div class="slide-desc">${s.description}</div>` : ''}
        <div class="slide-actions">
          ${s.btn1_label ? `<a href="${s.btn1_url||'#'}" class="slide-btn-primary" target="_blank" rel="noopener">${s.btn1_label} →</a>` : ''}
          ${s.btn2_label ? `<a href="${s.btn2_url||'#'}" class="slide-btn-ghost" target="_blank" rel="noopener">${s.btn2_label}</a>` : ''}
        </div>
      </div>
    </div>`).join('');

  thumbs.innerHTML = sliderData.map((s, i) => `
    <div class="slider-thumb ${i===0?'active':''}" onclick="sliderGoTo(${i})">
      <div class="slider-thumb-img">${s.image ? `<img src="${s.image}" alt="">` : '<span>📢</span>'}</div>
      <div class="slider-thumb-info">
        <div class="slider-thumb-sub">${s.subtitle||'Sponsorisé'}</div>
        <div class="slider-thumb-name">${s.title}</div>
      </div>
    </div>`).join('');

  goToSlide(0, false);
}

function goToSlide(index, animate = true) {
  if (!sliderData.length) return;
  sliderCurrent = ((index % sliderData.length) + sliderData.length) % sliderData.length;
  const track = document.getElementById('sliderTrack');
  if (track) { track.style.transition = animate ? 'transform 0.5s cubic-bezier(0.4,0,0.2,1)' : 'none'; track.style.transform = `translateX(-${sliderCurrent*100}%)`; }
  document.querySelectorAll('.slider-thumb').forEach((t,i) => t.classList.toggle('active', i===sliderCurrent));
  const fill = document.getElementById('sliderProgressFill');
  if (fill) { fill.classList.remove('running'); void fill.offsetWidth; fill.classList.add('running'); }
}

function sliderMove(dir) { resetSliderAuto(); goToSlide(sliderCurrent + dir); }
function sliderGoTo(i)   { resetSliderAuto(); goToSlide(i); }
function startSliderAuto() { sliderTimer = setInterval(() => goToSlide(sliderCurrent+1), 10000); }
function resetSliderAuto() { clearInterval(sliderTimer); startSliderAuto(); }

loadSlider();
