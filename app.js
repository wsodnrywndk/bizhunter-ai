/* ============================================================
   BIZHUNTER AI — логика приложения
   Часть 1: конфиг, состояние, Supabase, хелперы
   ============================================================ */

// ==== КОНФИГУРАЦИЯ ====
// Замените на свои значения из Supabase Dashboard → Settings → API
const SUPABASE_URL = 'https://yozmyovwakgvwwmmfali.supabase.co;
const SUPABASE_ANON_KEY = 'sb_publishable_LGtn20gGIuBT0M30uYYmtw_JCkyVKDk';

const PLANS = {
  free:     { label: 'Free',     searches: 10,  analyses: 3,   generations: 1,   proposals: 3   },
  starter:  { label: 'Starter',  searches: 100, analyses: 30,  generations: 10,  proposals: 30  },
  pro:      { label: 'Pro',      searches: 500, analyses: 150, generations: 50,  proposals: 150 },
  business: { label: 'Business', searches: 999999, analyses: 1000, generations: 300, proposals: 1000 },
};
const STATUS_LABELS = {
  new: 'Новый', analyzed: 'Проанализирован', proposal_ready: 'Предложение подготовлено',
  sent: 'Отправлено', negotiation: 'Переговоры', client: 'Клиент',
};

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==== СОСТОЯНИЕ ====
const state = {
  user: null,
  profile: null,
  usage: null,
  currentCompany: null, // карточка компании, открытая в view-company
};

// ==== ХЕЛПЕРЫ ====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.borderColor = isErr ? 'var(--danger)' : 'var(--accent)';
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
}

function showMsg(text, type) {
  const el = $('#auth-message');
  el.textContent = text;
  el.className = 'form-message ' + (type === 'ok' ? 'ok' : 'err');
  el.classList.remove('hidden');
}
function hideMsg() { $('#auth-message').classList.add('hidden'); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function setLoading(btn, on, text = 'Обработка…') {
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = text; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || 'Готово'; btn.disabled = false; }
}

// Подтверждение через модальное окно
function confirmModal(title, text) {
  return new Promise(resolve => {
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    $('#modal').classList.remove('hidden');
    const ok = $('#modal-ok'), cancel = $('#modal-cancel');
    const cleanup = (ans) => {
      $('#modal').classList.add('hidden');
      ok.onclick = cancel.onclick = null;
      resolve(ans);
    };
    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}

// Вызов Edge Function с автоматической обработкой ошибок лимитов
async function invokeFn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message || 'Ошибка сервера';
    try { const parsed = JSON.parse(error.context?.body || ''); if (parsed.error) msg = parsed.error; } catch (_) {}
    throw new Error(msg);
  }
  return data;
}

async function callFunction(name, body) {
  try { return await invokeFn(name, body); }
  catch (e) { toast(e.message, true); throw e; }
}

/* ============================================================
   Часть 2: авторизация и роутинг
   ============================================================ */

// --- Вкладки входа / регистрации / сброса ---
$$('[data-auth-tab]').forEach(btn => btn.addEventListener('click', () => {
  $$('[data-auth-tab]').forEach(b => b.classList.toggle('active', b === btn));
  hideMsg();
  $('#login-form').classList.toggle('hidden', btn.dataset.authTab !== 'login');
  $('#signup-form').classList.toggle('hidden', btn.dataset.authTab !== 'signup');
  $('#reset-form').classList.add('hidden');
}));

$('#forgot-btn').addEventListener('click', () => {
  hideMsg();
  $('#login-form').classList.add('hidden');
  $('#reset-form').classList.remove('hidden');
  $('#reset-email').value = $('#login-email').value;
});
$('#reset-back').addEventListener('click', () => {
  $('#reset-form').classList.add('hidden');
  $('#login-form').classList.remove('hidden');
});

// --- Регистрация ---
$('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg();
  const btn = e.target.querySelector('button[type=submit]');
  setLoading(btn, true, 'Регистрация…');
  const { error } = await sb.auth.signUp({
    email: $('#signup-email').value.trim(),
    password: $('#signup-password').value,
  });
  setLoading(btn, false);
  if (error) return showMsg(error.message, 'err');
  showMsg('Аккаунт создан. Проверьте email для подтверждения (если включено в Supabase), затем войдите.', 'ok');
  document.querySelector('[data-auth-tab="login"]').click();
});

// --- Вход ---
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg();
  const btn = e.target.querySelector('button[type=submit]');
  setLoading(btn, true, 'Вход…');
  const { error } = await sb.auth.signInWithPassword({
    email: $('#login-email').value.trim(),
    password: $('#login-password').value,
  });
  setLoading(btn, false);
  if (error) return showMsg(error.message, 'err');
});

// --- Сброс пароля ---
$('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg();
  const { error } = await sb.auth.resetPasswordForEmail($('#reset-email').value.trim(), {
    redirectTo: location.origin + location.pathname,
  });
  if (error) return showMsg(error.message, 'err');
  showMsg('Ссылка для сброса пароля отправлена на email.', 'ok');
});

$('#logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
});

// --- Сессия ---
sb.auth.onAuthStateChange((_e, session) => {
  if (session) onLogin(session.user);
  else {
    state.user = state.profile = state.usage = null;
    $('#app').classList.add('hidden');
    $('#auth-view').classList.remove('hidden');
  }
});

async function onLogin(user) {
  state.user = user;
  const [{ data: profile }, { data: usage }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).single(),
    sb.from('usage_counters').select('*').eq('user_id', user.id).eq('month', currentMonth()).maybeSingle(),
  ]);
  state.profile = profile;
  state.usage = usage || { searches: 0, analyses: 0, generations: 0, proposals: 0 };
  $('#auth-view').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderPlan();
  renderUsage();
  switchView('finder');
}

// --- Навигация ---
$$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

function switchView(name) {
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + name).classList.remove('hidden');
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'crm') loadCrm();
  if (name === 'profile') { renderUsage(); $('#profile-email').textContent = state.profile?.email || ''; }
  window.scrollTo(0, 0);
}

// --- Тариф и лимиты ---
function renderPlan() {
  const plan = state.profile?.plan || 'free';
  $('#plan-badge').textContent = PLANS[plan].label;
  $('#profile-plan').textContent = PLANS[plan].label;
  $('#plan-select').value = plan;
  $$('.plan').forEach(el => el.classList.toggle('current', el.dataset.plan === plan));
  const left = PLANS[plan].searches - (state.usage?.searches || 0);
  $('#finder-limit').textContent =
    `Осталось поисков в этом месяце: ${Math.max(0, left)} из ${PLANS[plan].searches === 999999 ? '∞' : PLANS[plan].searches}`;
}

function renderUsage() {
  if (!state.profile) return;
  const plan = PLANS[state.profile.plan];
  const u = state.usage || {};
  const rows = [
    ['Поиски', u.searches || 0, plan.searches],
    ['Анализы', u.analyses || 0, plan.analyses],
    ['Генерации сайтов', u.generations || 0, plan.generations],
    ['Предложения', u.proposals || 0, plan.proposals],
  ];
  $('#usage-bars').innerHTML = rows.map(([label, used, max]) => {
    const pct = max >= 999999 ? 0 : Math.min(100, Math.round(used / max * 100));
    const maxTxt = max >= 999999 ? '∞' : max;
    return `<div class="usage-bar">
      <span>${label}: ${used} / ${maxTxt}</span>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join('');
  renderPlan();
}

$('#plan-save').addEventListener('click', async () => {
  const plan = $('#plan-select').value;
  const { error } = await sb.from('profiles').update({ plan }).eq('id', state.user.id);
  if (error) return toast(error.message, true);
  state.profile.plan = plan;
  toast('Тариф изменён на ' + PLANS[plan].label);
  renderUsage();
});

/* ============================================================
   Часть 3: Business Finder и CRM
   ============================================================ */

// --- Поиск через Edge Function search-companies ---
$('#finder-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  setLoading(btn, true, 'Ищем…');
  $('#finder-results').innerHTML = '';
  try {
    const data = await callFunction('search-companies', {
      city: $('#finder-city').value.trim(),
      category: $('#finder-category').value.trim(),
      noSiteOnly: $('#finder-nosite').checked,
    });
    state.usage = data.usage;
    renderUsage();
    if (!data.companies?.length) {
      $('#finder-results').innerHTML = '<p class="hint">Ничего не найдено. Попробуйте другую категорию или город.</p>';
    } else {
      state.foundCompanies = data.companies;
      renderFound(data.companies);
      $('#finder-search-row').classList.remove('hidden');
      toast(`Найдено: ${data.companies.length}`);
    }
  } finally {
    setLoading(btn, false);
  }
});

function renderFound(list) {
  const q = ($('#finder-filter').value || '').toLowerCase();
  const filtered = q
    ? list.filter(c => (c.name + ' ' + (c.address || '')).toLowerCase().includes(q))
    : list;
  $('#finder-results').innerHTML = filtered.map((c, i) => `
    <div class="result-item">
      <span class="badge ${c.has_site ? 'has-site' : 'no-site'}">${c.has_site ? 'Есть сайт' : 'Без сайта'}</span>
      <h4>${esc(c.name)}</h4>
      <div class="meta">
        <span>${esc(c.category || '')}</span>
        <span>${esc(c.address || '')}</span>
        ${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}
        ${c.site ? `<a href="${esc(c.site)}" target="_blank" rel="noopener">${esc(c.site)}</a>` : ''}
      </div>
      <div class="item-actions">
        <button class="btn btn-primary btn-sm" onclick="saveCompany(${i})">В CRM</button>
      </div>
    </div>`).join('');
}
$('#finder-filter').addEventListener('input', () => {
  if (state.foundCompanies) renderFound(state.foundCompanies);
});

// Сохранение в CRM (upsert — защита от дубликатов на уровне unique-индекса)
window.saveCompany = async function(index) {
  const c = state.foundCompanies[index];
  const { data, error } = await sb.from('companies').upsert({
    user_id: state.user.id,
    name: c.name,
    address: c.address,
    phone: c.phone,
    site: c.site,
    category: c.category,
    city: c.city,
    source: c.source,
    external_id: c.external_id,
    has_site: c.has_site,
  }, { onConflict: 'user_id,source,external_id' }).select().single();
  if (error) return toast(error.message, true);
  toast(data.created_at === data.updated_at ? 'Сохранено в CRM' : 'Уже есть в CRM (дубликат пропущен)');
};

// --- CRM ---
async function loadCrm() {
  const { data, error } = await sb.from('companies')
    .select('*').order('created_at', { ascending: false });
  if (error) return toast(error.message, true);
  state.companies = data || [];
  renderCrm();
}

function renderCrm() {
  const q = ($('#crm-filter').value || '').toLowerCase();
  const st = $('#crm-status-filter').value;
  let list = state.companies || [];
  if (st) list = list.filter(c => c.status === st);
  if (q) list = list.filter(c =>
    (c.name + ' ' + (c.address || '') + ' ' + (c.category || '')).toLowerCase().includes(q));
  $('#crm-list').innerHTML = list.length ? list.map(c => `
    <div class="result-item" onclick="openCompany('${c.id}')">
      <h4>${esc(c.name)}</h4>
      <div class="meta">
        <span>${esc(c.category || '')} · ${esc(c.city || '')}</span>
        <span>${esc(c.address || '')}</span>
        ${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}
      </div>
      <div class="item-actions" onclick="event.stopPropagation()">
        <select class="status-select" onchange="setStatus('${c.id}', this.value)">
          ${Object.entries(STATUS_LABELS).map(([v, l]) =>
            `<option value="${v}" ${c.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>`).join('')
    : '<p class="hint">Пока пусто. Найдите компании во вкладке «Поиск».</p>';
}
$('#crm-filter').addEventListener('input', renderCrm);
$('#crm-status-filter').addEventListener('change', renderCrm);

window.setStatus = async function(id, status) {
  const { error } = await sb.from('companies').update({ status }).eq('id', id);
  if (error) return toast(error.message, true);
  const c = (state.companies || []).find(x => x.id === id);
  if (c) c.status = status;
  toast('Статус обновлён');
};

// Экспорт CSV
$('#crm-export').addEventListener('click', () => {
  const rows = [['name', 'category', 'city', 'address', 'phone', 'site', 'status', 'notes']];
  (state.companies || []).forEach(c => rows.push(
    [c.name, c.category, c.city, c.address, c.phone, c.site, STATUS_LABELS[c.status] || c.status, c.notes]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)));
  const blob = new Blob(['\ufeff' + rows.map(r => r.join(';')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bizhunter-crm.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ============================================================
   Часть 4: карточка компании, AI-модули
   ============================================================ */

window.openCompany = async function(id) {
  const { data: c, error } = await sb.from('companies').select('*').eq('id', id).single();
  if (error) return toast(error.message, true);
  state.currentCompany = c;
  $('#analysis-result').innerHTML = '';
  $('#proposal-result').innerHTML = '';
  $('#website-preview').innerHTML = '';

  $('#company-detail').innerHTML = `
    <div class="card">
      <span class="badge ${c.has_site ? 'has-site' : 'no-site'}">${c.has_site ? 'Есть сайт' : 'Без сайта'}</span>
      <h2>${esc(c.name)}</h2>
      <div class="meta">
        <p>${esc(c.category || '')} · ${esc(c.city || '')}</p>
        <p>${esc(c.address || '')}</p>
        ${c.phone ? `<p><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></p>` : ''}
        ${c.site ? `<p><a href="${esc(c.site)}" target="_blank" rel="noopener">${esc(c.site)}</a></p>` : ''}
        <p>Статус: <b>${STATUS_LABELS[c.status] || c.status}</b></p>
      </div>
      <div class="item-actions">
        <input type="text" id="note-input" placeholder="Заметка…" style="flex:1">
        <button class="btn btn-ghost btn-sm" id="note-add">Добавить</button>
      </div>
    </div>
    <div class="card"><h3>История взаимодействий</h3><div id="timeline" class="timeline"><p class="hint">Загрузка…</p></div></div>`;

  $('#note-add').onclick = addNote;
  loadTimeline();
  switchViewSilently('company');
};

function switchViewSilently(name) {
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + name).classList.remove('hidden');
  window.scrollTo(0, 0);
}

async function addNote() {
  const text = $('#note-input').value.trim();
  if (!text) return;
  const { error } = await sb.from('interactions').insert({
    company_id: state.currentCompany.id,
    user_id: state.user.id,
    type: 'note',
    payload: { text },
  });
  if (error) return toast(error.message, true);
  $('#note-input').value = '';
  loadTimeline();
  toast('Заметка добавлена');
}

async function loadTimeline() {
  const { data } = await sb.from('interactions')
    .select('*').eq('company_id', state.currentCompany.id)
    .order('created_at', { ascending: false }).limit(50);
  const el = $('#timeline');
  if (!el) return;
  el.innerHTML = data?.length ? data.map(i => {
    let body = '';
    if (i.type === 'note') body = esc(i.payload.text);
    else if (i.type === 'status_change') body = 'Статус: ' + (STATUS_LABELS[i.payload.status] || i.payload.status);
    else body = `<b>${i.type === 'analysis' ? 'AI-анализ' : 'Предложение'}</b><br>${esc(i.payload.summary || '')}`;
    return `<div class="timeline-item">${body}
      <time>${new Date(i.created_at).toLocaleString('ru-RU')}</time></div>`;
  }).join('') : '<p class="hint">Пока пусто.</p>';
}

$('#company-back').addEventListener('click', () => switchView('crm'));

// --- AI Business Analyzer ---
$('#btn-analyze').addEventListener('click', async () => {
  const btn = $('#btn-analyze');
  const box = $('#analysis-result');
  setLoading(btn, true, 'Анализ…');
  box.innerHTML = '<p class="hint">AI анализирует бизнес…</p>';
  try {
    const data = await callFunction('analyze-company', {
      company_id: state.currentCompany.id,
    });
    state.usage = data.usage;
    renderUsage();
    const cls = data.score >= 60 ? 'good' : data.score >= 35 ? 'mid' : 'bad';
    box.innerHTML = `
      <div class="score ${cls}">${data.score}<span style="font-size:1rem;color:var(--text-dim)">/100</span></div>
      <p class="hint">Оценка онлайн-присутствия</p>
      <div class="list-block"><h4>Потенциальные проблемы</h4>
        <ul>${data.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      <div class="list-block"><h4>Возможности</h4>
        <ul>${data.opportunities.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      <div class="list-block"><h4>Рекомендации</h4><p>${esc(data.recommendations)}</p></div>`;
    await sb.from('companies').update({ status: 'analyzed' }).eq('id', state.currentCompany.id);
    loadTimeline();
  } finally { setLoading(btn, false); }
});

// --- AI Website Generator ---
$('#btn-generate').addEventListener('click', async () => {
  const btn = $('#btn-generate');
  const box = $('#website-preview');
  setLoading(btn, true, 'Генерация…');
  box.innerHTML = '<p class="hint">Создаём демо-сайт…</p>';
  try {
    const data = await callFunction('generate-website', {
      company_id: state.currentCompany.id,
      template: $('#gen-template').value,
    });
    state.usage = data.usage;
    renderUsage();
    state.currentWebsiteHtml = data.html;
    box.innerHTML = `
      <iframe class="website-frame" sandbox="allow-same-origin" id="demo-frame"></iframe>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" id="copy-site">Скопировать HTML</button>
        <button class="btn btn-ghost btn-sm" id="download-site">Скачать файл</button>
      </div>`;
    // srcdoc вместо src, чтобы не зависеть от Storage
    $('#demo-frame').srcdoc = data.html;
    $('#copy-site').onclick = () => {
      navigator.clipboard.writeText(data.html).then(() => toast('HTML скопирован'));
    };
    $('#download-site').onclick = () => {
      const blob = new Blob([data.html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'demo-site.html';
      a.click();
      URL.revokeObjectURL(a.href);
    };
  } finally { setLoading(btn, false); }
});

// --- AI Sales Assistant ---
$('#btn-proposal').addEventListener('click', async () => {
  const btn = $('#btn-proposal');
  const box = $('#proposal-result');
  setLoading(btn, true, 'Создаём…');
  box.innerHTML = '<p class="hint">AI готовит предложения…</p>';
  try {
    const data = await callFunction('generate-proposal', {
      company_id: state.currentCompany.id,
      channel: $('#proposal-channel').value,
      style: $('#proposal-style').value,
    });
    state.usage = data.usage;
    renderUsage();
    state.currentProposal = data.text;
    box.innerHTML = `
      <textarea class="proposal-text" id="proposal-edit">${esc(data.text)}</textarea>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" id="copy-proposal">Скопировать</button>
        <button class="btn btn-primary btn-sm" id="send-proposal">Отметить как отправлено</button>
      </div>`;
    $('#copy-proposal').onclick = () => {
      navigator.clipboard.writeText($('#proposal-edit').value).then(() => toast('Скопировано'));
    };
    $('#send-proposal').onclick = async () => {
      const okConfirm = await confirmModal(
        'Отметить как отправлено?',
        'BIZHUNTER не отправляет сообщения автоматически. Вставьте текст в ' +
        $('#proposal-channel').value + ' и подтвердите, что отправили вручную.');
      if (!okConfirm) return;
      await sb.from('interactions').insert({
        company_id: state.currentCompany.id, user_id: state.user.id,
        type: 'proposal', payload: { text: $('#proposal-edit').value, channel: $('#proposal-channel').value },
      });
      await sb.from('companies').update({ status: 'sent' }).eq('id', state.currentCompany.id);
      loadTimeline();
      toast('Отмечено как отправленное');
    };
  } finally { setLoading(btn, false); }
});

// --- Инициализация: проверяем активную сессию при загрузке страницы ---
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) onLogin(session.user);
})();
