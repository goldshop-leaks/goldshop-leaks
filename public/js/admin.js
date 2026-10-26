/* ═══════════════════════════════════════════════════
   GoldShop Leaks — Admin JS (version propre)
═══════════════════════════════════════════════════ */

let adminUser = null;
let banTargetUserId = null;
let userSearchTimeout = null;

// ── Toast ─────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: '💡' };
  el.innerHTML = `<span>${icons[type] || '💡'}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Navigation ────────────────────────────────────
function nav(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('[data-page]').forEach(a => a.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  const navEl  = document.querySelector(`[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');

  const titles = {
    dashboard: '📊 Dashboard', leaks: '📦 Leaks',
    categories: '🗂️ Catégories', slides: '📢 Pubs / Slides',
    users: '👥 Utilisateurs', bans: '🔨 Bans',
    logs: '📋 Logs', settings: '⚙️ Paramètres'
  };
  const el = document.getElementById('topbarTitle');
  if (el) el.textContent = titles[page] || page;

  if (page === 'leaks')      loadAdminLeaks();
  if (page === 'categories') loadCategories();
  if (page === 'slides')     loadSlides();
  if (page === 'users')      loadUsers();
  if (page === 'bans')       loadBans();
  if (page === 'logs')       loadLogs();
  if (page === 'settings')   loadSettings();
  return false;
}

// ── Modal helpers ─────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
});

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════
async function loadStats() {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;
  try {
    const res = await fetch('/api/admin/stats');
    const s   = await res.json();
    if (s.error) { grid.innerHTML = `<p style="color:var(--text-muted)">Erreur: ${s.error}</p>`; return; }
    grid.innerHTML = `
      <div class="stat-card purple"><span class="stat-icon">📦</span><span class="stat-value">${s.leaks||0}</span><span class="stat-label">Leaks publiés</span></div>
      <div class="stat-card blue">  <span class="stat-icon">👥</span><span class="stat-value">${s.users||0}</span><span class="stat-label">Membres inscrits</span></div>
      <div class="stat-card green"> <span class="stat-icon">⬇️</span><span class="stat-value">${s.downloads||0}</span><span class="stat-label">Téléchargements</span></div>
      <div class="stat-card red">   <span class="stat-icon">🔨</span><span class="stat-value">${s.bans||0}</span><span class="stat-label">Bans actifs</span></div>
      <div class="stat-card orange"><span class="stat-icon">🆕</span><span class="stat-value">${s.newToday||0}</span><span class="stat-label">Nouveaux aujourd'hui</span></div>`;
  } catch(e) {
    if (grid) grid.innerHTML = '<p style="color:var(--text-muted)">Erreur de chargement.</p>';
  }
}

// ═══════════════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════════════
async function loadLogs() {
  const t1 = document.getElementById('logsTableBody');
  const t2 = document.getElementById('logsFullBody');
  try {
    const res  = await fetch('/api/admin/logs');
    const logs = await res.json();
    if (!Array.isArray(logs)) { return; }
    const html = logs.length === 0
      ? '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px">Aucun log</td></tr>'
      : logs.map(l => {
          let d = {};
          try { d = JSON.parse(l.data || '{}'); } catch(e) {}
          const colors = { login:'badge-green', register:'badge-blue', ban:'badge-red' };
          return `<tr>
            <td><span class="badge ${colors[l.type]||'badge-gray'}">${l.type}</span></td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;color:var(--text-soft)">${Object.entries(d).map(([k,v])=>`<b>${k}</b>: ${v}`).join(' · ')}</td>
            <td style="color:var(--text-muted)">${new Date(l.created_at).toLocaleString('fr-FR')}</td>
          </tr>`;
        }).join('');
    if (t1) t1.innerHTML = html;
    if (t2) t2.innerHTML = html;
  } catch(e) {}
}

// ═══════════════════════════════════════════════════
// LEAKS
// ═══════════════════════════════════════════════════
async function loadAdminLeaks() {
  const tbody = document.getElementById('leaksTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  try {
    const res   = await fetch('/api/admin/leaks');
    const leaks = await res.json();
    if (!leaks.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Aucun leak.</td></tr>'; return; }
    tbody.innerHTML = leaks.map(l => `
      <tr>
        <td style="max-width:200px">
          ${l.thumbnail ? `<img src="${l.thumbnail}" style="width:36px;height:24px;border-radius:4px;object-fit:cover;margin-right:8px;vertical-align:middle">` : ''}
          <span style="font-weight:600">${l.title}</span>
        </td>
        <td><span class="badge badge-purple">${l.category_name||'—'}</span></td>
        <td>⬇️ ${l.download_count||0}</td>
        <td><span class="badge ${l.published?'badge-green':'badge-gray'}">${l.published?'Publié':'Brouillon'}</span></td>
        <td style="color:var(--text-muted)">${new Date(l.created_at).toLocaleDateString('fr-FR')}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm btn-icon" onclick="editLeak(${l.id})">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="deleteLeak(${l.id})">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  } catch(e) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Erreur.</td></tr>'; }
}

async function openLeakModal(id = null) {
  const fields = ['leakId','leakTitle','leakDesc','leakLink','leakVideo','leakTags'];
  fields.forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; });
  const pub = document.getElementById('leakPublished'); if(pub) pub.value = 'true';
  const mt  = document.getElementById('leakModalTitle'); if(mt) mt.textContent = id ? 'Modifier le Leak' : 'Nouveau Leak';
  try {
    const res  = await fetch('/api/categories');
    const cats = await res.json();
    const sel  = document.getElementById('leakCategory');
    if (sel) sel.innerHTML = '<option value="">Choisir...</option>' + cats.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  } catch(e) {}
  openModal('leakModal');
}

async function editLeak(id) {
  await openLeakModal(id);
  try {
    const res  = await fetch('/api/admin/leaks');
    const all  = await res.json();
    const leak = all.find(l => l.id === id);
    if (!leak) return;
    const set = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val||''; };
    set('leakId', leak.id); set('leakTitle', leak.title); set('leakDesc', leak.description);
    set('leakLink', leak.external_link); set('leakVideo', leak.video_url); set('leakTags', leak.tags);
    set('leakCategory', leak.category_id);
    const pub = document.getElementById('leakPublished'); if(pub) pub.value = leak.published ? 'true' : 'false';
    const mt  = document.getElementById('leakModalTitle'); if(mt) mt.textContent = 'Modifier le Leak';
  } catch(e) {}
}

document.getElementById('leakForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('leakSubmitBtn');
  if(btn) { btn.disabled = true; btn.textContent = 'Enregistrement...'; }
  const id = document.getElementById('leakId')?.value;
  const fd = new FormData();
  ['title','desc','link','video','tags'].forEach(k => {
    const map = {title:'leakTitle',desc:'leakDesc',link:'leakLink',video:'leakVideo',tags:'leakTags'};
    fd.append(k==='link'?'external_link':k==='desc'?'description':k==='video'?'video_url':k,
      document.getElementById(map[k])?.value||'');
  });
  fd.append('category_id', document.getElementById('leakCategory')?.value||'');
  fd.append('published',   document.getElementById('leakPublished')?.value||'false');
  const thumb = document.getElementById('leakThumb')?.files[0];
  const file  = document.getElementById('leakFile')?.files[0];
  if(thumb) fd.append('thumbnail', thumb);
  if(file)  fd.append('file', file);
  try {
    const res  = await fetch(id ? `/api/admin/leaks/${id}` : '/api/admin/leaks', { method: id?'PUT':'POST', body: fd });
    const data = await res.json();
    if(data.success) { toast(id?'Leak modifié !':'Leak créé !','success'); closeModal('leakModal'); loadAdminLeaks(); }
    else toast('Erreur : '+(data.error||'inconnue'),'error');
  } catch(err) { toast('Erreur réseau.','error'); }
  if(btn) { btn.disabled=false; btn.textContent='💾 Enregistrer'; }
});

async function deleteLeak(id) {
  if(!confirm('Supprimer ce leak ?')) return;
  const res = await fetch(`/api/admin/leaks/${id}`,{method:'DELETE'});
  const d   = await res.json();
  if(d.success) { toast('Leak supprimé.','success'); loadAdminLeaks(); } else toast('Erreur.','error');
}

// ═══════════════════════════════════════════════════
// CATÉGORIES
// ═══════════════════════════════════════════════════
async function loadCategories() {
  const tbody = document.getElementById('catsTableBody');
  if (!tbody) return;
  try {
    const res  = await fetch('/api/categories');
    const cats = await res.json();
    if(!cats.length) { tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">Aucune catégorie.</td></tr>'; return; }
    tbody.innerHTML = cats.map(c=>`
      <tr>
        <td style="font-size:1.3rem">${c.icon.startsWith('/')?`<img src="${c.icon}" style="width:28px;border-radius:4px">`:c.icon}</td>
        <td><span style="font-weight:600">${c.name}</span></td>
        <td style="color:var(--text-muted)">${c.description||'—'}</td>
        <td><span class="badge badge-gray">${c.position}</span></td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm btn-icon" onclick="editCat(${c.id},'${encodeURIComponent(JSON.stringify(c))}')">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteCat(${c.id})">🗑️</button>
        </div></td>
      </tr>`).join('');
  } catch(e) {}
}

function openCatModal() {
  ['catId','catName','catDesc','catPosition'].forEach(f=>{ const el=document.getElementById(f); if(el) el.value=''; });
  const icon=document.getElementById('catIcon'); if(icon) icon.value='📦';
  const col=document.getElementById('catColor'); if(col) col.value='#8b5cf6';
  const mt=document.getElementById('catModalTitle'); if(mt) mt.textContent='Nouvelle Catégorie';
  openModal('catModal');
}

function editCat(id, encoded) {
  const cat = JSON.parse(decodeURIComponent(encoded));
  const set = (elId, val) => { const el=document.getElementById(elId); if(el) el.value=val||''; };
  set('catId',cat.id); set('catName',cat.name); set('catDesc',cat.description);
  set('catIcon',cat.icon); set('catColor',cat.color||'#8b5cf6'); set('catPosition',cat.position||0);
  const mt=document.getElementById('catModalTitle'); if(mt) mt.textContent='Modifier la Catégorie';
  openModal('catModal');
}

document.getElementById('catForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('catId')?.value;
  const body = {
    name: document.getElementById('catName')?.value,
    description: document.getElementById('catDesc')?.value,
    icon: document.getElementById('catIcon')?.value,
    color: document.getElementById('catColor')?.value,
    position: document.getElementById('catPosition')?.value||0
  };
  const res  = await fetch(id?`/api/admin/categories/${id}`:'/api/admin/categories', { method:id?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const data = await res.json();
  if(data.success) { toast(id?'Catégorie modifiée !':'Catégorie créée !','success'); closeModal('catModal'); loadCategories(); }
  else toast('Erreur.','error');
});

async function deleteCat(id) {
  if(!confirm('Supprimer cette catégorie ?')) return;
  const res = await fetch(`/api/admin/categories/${id}`,{method:'DELETE'});
  const d   = await res.json();
  if(d.success) { toast('Supprimée.','success'); loadCategories(); } else toast('Erreur.','error');
}

// ═══════════════════════════════════════════════════
// UTILISATEURS
// ═══════════════════════════════════════════════════
async function loadUsers(search='') {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  try {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const res    = await fetch(`/api/admin/users${params}`);
    const users  = await res.json();
    if(!users.length) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">Aucun utilisateur.</td></tr>'; return; }
    tbody.innerHTML = users.map(u=>`
      <tr>
        <td style="color:var(--text-muted)">#${u.id}</td>
        <td><div class="user-chip"><div class="av">${u.username[0].toUpperCase()}</div><span style="font-weight:600">${u.username}</span></div></td>
        <td style="color:var(--text-muted)">${u.email}</td>
        <td><span class="ip-chip">${u.ip||'—'}</span></td>
        <td style="color:var(--text-muted)">${u.created_at?new Date(u.created_at).toLocaleDateString('fr-FR'):'—'}</td>
        <td style="color:var(--text-muted)">${u.last_login?new Date(u.last_login).toLocaleString('fr-FR'):'Jamais'}</td>
        <td><span class="badge ${u.is_admin?'badge-purple':'badge-gray'}">${u.is_admin?'👑 Admin':'👤 Membre'}</span></td>
        <td><div style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm btn-icon" onclick="viewUser(${u.id})">👁️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="banUser(${u.id})">🔨</button>
          ${u.is_admin
            ?`<button class="btn btn-outline btn-sm" onclick="demoteUser(${u.id})">↓</button>`
            :`<button class="btn btn-gold btn-sm" onclick="promoteUser(${u.id})">👑</button>`}
        </div></td>
      </tr>`).join('');
  } catch(e) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Erreur.</td></tr>'; }
}

function searchUsers() {
  clearTimeout(userSearchTimeout);
  userSearchTimeout = setTimeout(() => loadUsers(document.getElementById('userSearch')?.value||''), 350);
}

async function viewUser(id) {
  openModal('userModal');
  const body = document.getElementById('userModalBody');
  if(body) body.innerHTML='<div class="loader-center"><div class="spinner"></div></div>';
  try {
    const res = await fetch(`/api/admin/users/${id}`);
    const u   = await res.json();
    if(body) body.innerHTML=`
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,var(--purple),var(--purple-dark));display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:800;color:#fff">${u.username[0].toUpperCase()}</div>
        <div><div style="font-size:1rem;font-weight:700">${u.username}</div><div style="color:var(--text-muted);font-size:.82rem">${u.email}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
        <div style="background:var(--bg-card2);padding:10px;border-radius:7px;border:1px solid var(--border)"><div style="font-size:.72rem;color:var(--text-muted)">IP</div><span class="ip-chip">${u.ip||'—'}</span></div>
        <div style="background:var(--bg-card2);padding:10px;border-radius:7px;border:1px solid var(--border)"><div style="font-size:.72rem;color:var(--text-muted)">Inscrit le</div><span style="font-size:.82rem">${u.created_at?new Date(u.created_at).toLocaleString('fr-FR'):'—'}</span></div>
      </div>
      <h4 style="font-size:.85rem;margin-bottom:8px">📥 Derniers téléchargements</h4>
      ${u.downloads?.length?`<ul style="list-style:none;display:flex;flex-direction:column;gap:5px">${u.downloads.map(d=>`<li style="background:var(--bg-card2);padding:7px 10px;border-radius:5px;border:1px solid var(--border);font-size:.78rem;display:flex;justify-content:space-between"><span>${d.title}</span><span style="color:var(--text-muted)">${new Date(d.downloaded_at).toLocaleDateString('fr-FR')}</span></li>`).join('')}</ul>`:'<p style="color:var(--text-muted);font-size:.82rem">Aucun téléchargement.</p>'}
      <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">
        <button class="btn btn-danger btn-sm" onclick="banUser(${u.id});closeModal('userModal')">🔨 Bannir</button>
        ${!u.is_admin?`<button class="btn btn-gold btn-sm" onclick="promoteUser(${u.id});closeModal('userModal')">👑 Promouvoir</button>`:`<button class="btn btn-outline btn-sm" onclick="demoteUser(${u.id});closeModal('userModal')">↓ Rétrograder</button>`}
      </div>`;
  } catch(e) { if(body) body.innerHTML='<p style="color:var(--text-muted)">Erreur.</p>'; }
}

function banUser(userId) {
  banTargetUserId = userId;
  const ip=document.getElementById('banIp'); if(ip) ip.value='';
  const r=document.getElementById('banReason'); if(r) r.value='';
  openModal('banModal');
}

async function submitBan() {
  const ip     = document.getElementById('banIp')?.value.trim();
  const reason = document.getElementById('banReason')?.value.trim();
  const body   = { reason };
  if(banTargetUserId) body.userId = banTargetUserId;
  if(ip) body.ip = ip;
  const res  = await fetch('/api/admin/ban',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json();
  if(data.success) { toast('Utilisateur banni !','success'); closeModal('banModal'); banTargetUserId=null; loadUsers(); loadBans(); }
  else toast('Erreur : '+(data.error||''),'error');
}

function openBanModal() { banTargetUserId=null; const ip=document.getElementById('banIp'); if(ip) ip.value=''; const r=document.getElementById('banReason'); if(r) r.value=''; openModal('banModal'); }

async function promoteUser(id) {
  const res=await fetch(`/api/admin/promote/${id}`,{method:'POST'});
  const d=await res.json();
  if(d.success){toast('Admin promu !','success');loadUsers();}else toast('Erreur.','error');
}

async function demoteUser(id) {
  if(!confirm('Rétrograder ?')) return;
  const res=await fetch(`/api/admin/demote/${id}`,{method:'POST'});
  const d=await res.json();
  if(d.success){toast('Rétrogradé.','success');loadUsers();}else toast('Erreur.','error');
}

// ═══════════════════════════════════════════════════
// BANS
// ═══════════════════════════════════════════════════
async function loadBans() {
  const tbody = document.getElementById('bansTableBody');
  if(!tbody) return;
  try {
    const res  = await fetch('/api/admin/bans');
    const bans = await res.json();
    if(!bans.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Aucun ban. 🎉</td></tr>';return;}
    tbody.innerHTML=bans.map(b=>`
      <tr>
        <td style="color:var(--text-muted)">#${b.id}</td>
        <td>${b.username||'<span style="color:var(--text-muted)">IP seulement</span>'}</td>
        <td><span class="ip-chip">${b.ip||'—'}</span></td>
        <td style="color:var(--text-muted)">${b.reason||'—'}</td>
        <td style="color:var(--text-muted)">${new Date(b.banned_at).toLocaleString('fr-FR')}</td>
        <td><button class="btn btn-success btn-sm" onclick="unban(${b.id})">✅ Débannir</button></td>
      </tr>`).join('');
  } catch(e) {}
}

async function unban(id) {
  if(!confirm('Débannir ?')) return;
  const res=await fetch(`/api/admin/ban/${id}`,{method:'DELETE'});
  const d=await res.json();
  if(d.success){toast('Débanni !','success');loadBans();}else toast('Erreur.','error');
}

// ═══════════════════════════════════════════════════
// SLIDES / PUBS
// ═══════════════════════════════════════════════════
async function loadSlides() {
  const tbody = document.getElementById('slidesTableBody');
  if(!tbody) return;
  tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:20px"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  try {
    const res    = await fetch('/api/admin/slides');
    const slides = await res.json();
    if(!slides.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Aucune pub.</td></tr>';return;}
    tbody.innerHTML=slides.map(s=>`
      <tr>
        <td>${s.image?`<img src="${s.image}" style="width:64px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">`:'—'}</td>
        <td style="font-weight:700">${s.title}</td>
        <td style="color:var(--text-muted)">${s.subtitle||'—'}</td>
        <td style="font-size:.75rem">${s.btn1_label?`<span style="background:var(--purple-glow);border:1px solid var(--purple-border);color:var(--purple-light);padding:1px 7px;border-radius:4px">${s.btn1_label}</span>`:''}</td>
        <td><span class="badge ${s.active?'badge-green':'badge-gray'}">${s.active?'✅ Actif':'🚫 Off'}</span></td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm btn-icon" onclick="editSlide(${s.id})">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteSlide(${s.id})">🗑️</button>
        </div></td>
      </tr>`).join('');
  } catch(e) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Erreur.</td></tr>'; }
}

function openSlideModal() {
  ['slideId','slideTitle','slideSubtitle','slideDesc','slideBtn1Label','slideBtn1Url','slideBtn2Label','slideBtn2Url','slidePosition'].forEach(f=>{const el=document.getElementById(f);if(el)el.value='';});
  const a=document.getElementById('slideActive'); if(a) a.value='true';
  const mt=document.getElementById('slideModalTitle'); if(mt) mt.textContent='Nouvelle Pub';
  openModal('slideModal');
}

async function editSlide(id) {
  openSlideModal();
  try {
    const res    = await fetch('/api/admin/slides');
    const slides = await res.json();
    const s      = slides.find(x=>x.id===id);
    if(!s) return;
    const set=(elId,val)=>{const el=document.getElementById(elId);if(el)el.value=val||'';};
    set('slideId',s.id);set('slideTitle',s.title);set('slideSubtitle',s.subtitle);
    set('slideDesc',s.description);set('slideBtn1Label',s.btn1_label);set('slideBtn1Url',s.btn1_url);
    set('slideBtn2Label',s.btn2_label);set('slideBtn2Url',s.btn2_url);set('slidePosition',s.position);
    const a=document.getElementById('slideActive');if(a)a.value=s.active?'true':'false';
    const mt=document.getElementById('slideModalTitle');if(mt)mt.textContent='Modifier la Pub';
  } catch(e) {}
}

document.getElementById('slideForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn=document.getElementById('slideSubmitBtn');
  if(btn){btn.disabled=true;btn.textContent='Enregistrement...';}
  const id=document.getElementById('slideId')?.value;
  const fd=new FormData();
  ['title','subtitle','description','btn1_label','btn1_url','btn2_label','btn2_url','position','active'].forEach(k=>{
    const map={title:'slideTitle',subtitle:'slideSubtitle',description:'slideDesc',btn1_label:'slideBtn1Label',btn1_url:'slideBtn1Url',btn2_label:'slideBtn2Label',btn2_url:'slideBtn2Url',position:'slidePosition',active:'slideActive'};
    fd.append(k,document.getElementById(map[k])?.value||'');
  });
  const img=document.getElementById('slideImg')?.files[0];
  if(img) fd.append('image',img);
  try {
    const res=await fetch(id?`/api/admin/slides/${id}`:'/api/admin/slides',{method:id?'PUT':'POST',body:fd});
    const data=await res.json();
    if(data.success){toast(id?'Pub modifiée !':'Pub créée !','success');closeModal('slideModal');loadSlides();}
    else toast('Erreur : '+(data.error||''),'error');
  } catch(err){toast('Erreur réseau.','error');}
  if(btn){btn.disabled=false;btn.textContent='💾 Enregistrer';}
});

async function deleteSlide(id) {
  if(!confirm('Supprimer cette pub ?')) return;
  const res=await fetch(`/api/admin/slides/${id}`,{method:'DELETE'});
  const d=await res.json();
  if(d.success){toast('Supprimée.','success');loadSlides();}else toast('Erreur.','error');
}

// ═══════════════════════════════════════════════════
// PARAMÈTRES
// ═══════════════════════════════════════════════════
async function loadSettings() {
  try {
    const r=await fetch('/api/admin/webhook');
    const d=await r.json();
    const el=document.getElementById('webhookUrl');
    if(el) el.value=d.webhook||'';
  } catch(e) {}
  try {
    const r=await fetch('/api/settings/discord-invite');
    const d=await r.json();
    const el=document.getElementById('discordInviteUrl');
    if(el) el.value=d.url||'';
  } catch(e) {}
  try {
    const r=await fetch('/api/public/stats');
    const d=await r.json();
    const dm=document.getElementById('discordMembers');
    const do_=document.getElementById('discordOnline');
    if(dm)  dm.value=d.discordMembers||'';
    if(do_) do_.value=d.discordOnline||'';
  } catch(e) {}
  try {
    const r=await fetch('/api/settings/hero-banner');
    const d=await r.json();
    const urlEl=document.getElementById('bannerUrl');
    if(urlEl) urlEl.value=d.url||'';
    const prev=document.getElementById('bannerPreview');
    const img=document.getElementById('bannerPreviewImg');
    if(prev&&img&&d.url){img.src=d.url;prev.style.display='';}
  } catch(e) {}
}

async function saveWebhook() {
  const webhook=document.getElementById('webhookUrl')?.value.trim();
  const res=await fetch('/api/admin/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({webhook})});
  const d=await res.json();
  if(d.success) toast('Webhook sauvegardé !','success'); else toast('Erreur.','error');
}

async function testWebhook() {
  const webhook=document.getElementById('webhookUrl')?.value.trim();
  if(!webhook){toast('Entre un webhook d\'abord.','error');return;}
  try {
    await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({embeds:[{title:'🧪 Test — GoldShop Leaks',description:'Le webhook fonctionne !',color:0x8b5cf6,timestamp:new Date().toISOString()}]})});
    toast('Message envoyé sur Discord !','success');
  } catch(e){toast('Erreur d\'envoi.','error');}
}

async function saveDiscordInvite() {
  const url=document.getElementById('discordInviteUrl')?.value.trim();
  const res=await fetch('/api/admin/discord-invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  const d=await res.json();
  if(d.success) toast('Lien Discord sauvegardé !','success'); else toast('Erreur.','error');
}

async function saveDiscordStats() {
  const members=document.getElementById('discordMembers')?.value||'0';
  const online=document.getElementById('discordOnline')?.value||'0';
  const res=await fetch('/api/admin/discord-stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({members,online})});
  const d=await res.json();
  if(d.success) toast('Stats Discord mises à jour !','success'); else toast('Erreur.','error');
}

async function saveBanner() {
  const file=document.getElementById('bannerFile')?.files[0];
  const urlVal=document.getElementById('bannerUrl')?.value.trim();
  const fd=new FormData();
  if(file) fd.append('banner',file);
  else if(urlVal) fd.append('url',urlVal);
  else{toast('Choisis une image ou colle un lien.','error');return;}
  const res=await fetch('/api/admin/hero-banner',{method:'POST',body:fd});
  const d=await res.json();
  if(d.success){
    toast('Bannière mise à jour !','success');
    const src=d.url||urlVal;
    const prev=document.getElementById('bannerPreview');
    const img=document.getElementById('bannerPreviewImg');
    if(prev&&img&&src){img.src=src;prev.style.display='';}
  } else toast('Erreur.','error');
}

async function promoteUser(id){
  const res=await fetch(`/api/admin/promote/${id}`,{method:'POST'});
  const d=await res.json();
  if(d.success){toast('Promu admin !','success');loadUsers();}else toast('Erreur.','error');
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
(async () => {
  try {
    const res  = await fetch('/api/me');
    const user = await res.json();
    if (!user.loggedIn || !user.is_admin) { window.location.href = '/'; return; }
    adminUser = user;
    const nameEl   = document.getElementById('adminName');
    const avatarEl = document.getElementById('adminAvatar');
    if (nameEl)   nameEl.textContent   = user.username;
    if (avatarEl) avatarEl.textContent = user.username.charAt(0).toUpperCase();
  } catch(e) { window.location.href = '/'; return; }

  await Promise.all([loadStats(), loadLogs()]);
})();
