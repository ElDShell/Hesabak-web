/* ============================================================
   سجل المعاملات — منطق التطبيق
   الإصدار 9 — اسم مشروع قابل للتعديل + Excel فقط
   ============================================================ */
(function () {
'use strict';

/* ------------------------------------------------------------
   1) أدوات مساعدة
   ------------------------------------------------------------ */
const $ = id => document.getElementById(id);
const KEY = 'ledger_app_data';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const num = n => Number(n).toLocaleString('ar-EG', { maximumFractionDigits: 2 });
const numImg = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

const uid = () =>
  (crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const nowParts = () => {
  const d = new Date();
  return { date: d.toLocaleDateString('en-CA'), time: d.toTimeString().slice(0, 5) };
};

/* ------------------------------------------------------------
   2) ثوابت الصورة
   ------------------------------------------------------------ */
const IMG_WIDTH = 1080;
const IMG_MAX_ROWS = 15;

/* ------------------------------------------------------------
   3) حالة التطبيق
   ------------------------------------------------------------ */
let customers = [];
let cur = null;
let q = '';
let type = 'debt';
let openId = null;

/* ------------------------------------------------------------
   3.5) حالة الفلاتر
   ------------------------------------------------------------ */
const DEFAULT_FILTERS = () => ({
  sort: 'name',
  status: 'all',
  min: '',
  max: ''
});
let filters = DEFAULT_FILTERS();
let fpOpen = false;

/* ------------------------------------------------------------
   3.6) اسم المشروع
   ------------------------------------------------------------ */
const PROJECT_KEY     = 'ledger_project_name';
const PROJECT_DEFAULT = 'مشروع 1';
let projectName = PROJECT_DEFAULT;

function loadProjectName() {
  try {
    const v = localStorage.getItem(PROJECT_KEY);
    if (v && v.trim()) projectName = v.trim();
  } catch (e) {}
}
function saveProjectName() {
  try { localStorage.setItem(PROJECT_KEY, projectName); } catch (e) {}
}

function filtersCount() {
  let n = 0;
  if (filters.sort !== 'name') n++;
  if (filters.status !== 'all') n++;
  if (filters.min !== '' || filters.max !== '') n++;
  return n;
}

function lastActivity(c) {
  if (!c.transactions.length) return '';
  let mx = '';
  for (const t of c.transactions) {
    const k = (t.date || '') + ' ' + (t.time || '');
    if (k > mx) mx = k;
  }
  return mx;
}

function applyFilters(list) {
  let out = list.slice();

  if (filters.status === 'debt')        out = out.filter(c => bal(c) > 0);
  else if (filters.status === 'paid')   out = out.filter(c => bal(c) === 0);
  else if (filters.status === 'credit') out = out.filter(c => bal(c) < 0);

  const min = filters.min === '' ? NaN : parseFloat(filters.min);
  const max = filters.max === '' ? NaN : parseFloat(filters.max);
  if (!isNaN(min)) out = out.filter(c => Math.abs(bal(c)) >= min);
  if (!isNaN(max)) out = out.filter(c => Math.abs(bal(c)) <= max);

  switch (filters.sort) {
    case 'name':
      out.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      break;
    case 'date-desc':
      out.sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
      break;
    case 'date-asc':
      out.sort((a, b) => lastActivity(a).localeCompare(lastActivity(b)));
      break;
    case 'amount-desc':
      out.sort((a, b) => bal(b) - bal(a));
      break;
    case 'amount-asc':
      out.sort((a, b) => bal(a) - bal(b));
      break;
  }
  return out;
}

/* ------------------------------------------------------------
   4) التخزين
   ------------------------------------------------------------ */
const store = (op, v) => {
  try { return op === 'g' ? localStorage.getItem(KEY) : localStorage.setItem(KEY, v); }
  catch (e) { return null; }
};

function normalize(arr) {
  return arr.map(c => ({
    id: String(c.id || uid()),
    name: String(c.name || ''),
    transactions: (c.transactions || []).map(t => ({
      id: t.id || uid(),
      type: t.type === 'pay' ? 'pay' : 'debt',
      amount: Math.abs(parseFloat(t.amount)) || 0,
      desc: t.desc || '',
      date: t.date || '',
      time: t.time || ''
    }))
  }));
}

function load() {
  const s = store('g');
  try { if (s) { customers = normalize(JSON.parse(s)); return; } } catch (e) {}
  customers = normalize([
    { id: uid(), name: 'أحمد محمد', transactions: [
      { type: 'debt', amount: 150, desc: 'شراء بضاعة',   date: '2026-10-01', time: '14:30' },
      { type: 'pay',  amount: 50,  desc: 'دفعة مقدمة',   date: '2026-10-03', time: '10:15' }
    ]},
    { id: uid(), name: 'سارة علي', transactions: [
      { type: 'debt', amount: 300, desc: 'فاتورة رقم 22', date: '2026-10-02', time: '09:00' }
    ]}
  ]);
}

function save() { store('s', JSON.stringify(customers)); }

const bal = c =>
  Math.round(c.transactions.reduce((a, t) => a + (t.type === 'debt' ? t.amount : -t.amount), 0) * 100) / 100;

/* ------------------------------------------------------------
   5) Toast + Modal
   ------------------------------------------------------------ */
function toast(msg, label, fn) {
  const t = $('t');
  t.innerHTML = '';
  const sp = document.createElement('span');
  sp.style.flex = '1';
  sp.textContent = msg;
  t.appendChild(sp);
  if (label && fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => { t.classList.add('hide'); fn(); };
    t.appendChild(b);
  }
  t.classList.remove('hide');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.add('hide'), fn ? 6000 : 3500);
}

function modal(html) {
  const m = $('m');
  m.className = 'modal';
  m.innerHTML = '<div class="mc" role="dialog" aria-modal="true">' + html + '</div>';
  m.onclick = e => { if (e.target === m) closeM(); };
}

function closeM() {
  const m = $('m');
  m.className = 'hide';
  m.innerHTML = '';
}

function confirmBox(title, text, okLabel, fn) {
  modal(`<h3>${esc(title)}</h3><p class="note">${esc(text)}</p>
    <div class="row">
      <button class="g" style="flex:1" id="no" type="button">إلغاء</button>
      <button class="d" style="flex:1" id="ok" type="button">${esc(okLabel)}</button>
    </div>`);
  $('no').onclick = closeM;
  $('ok').onclick = () => { closeM(); fn(); };
}

/* ------------------------------------------------------------
   5.5) التنقل + الإدخال السريع
   ------------------------------------------------------------ */
function openDetail(id) {
  try { history.pushState({ d: 1 }, ''); } catch (e) {}
  viewDetail(id, false);
}
function goBack() {
  if (history.state && history.state.d) history.back();
  else viewList();
}
window.addEventListener('popstate', () => { closeM(); viewList(); });

function recentDescs(c) {
  const seen = new Set(), out = [];
  [...c.transactions]
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .forEach(t => {
      const d = (t.desc || '').trim();
      if (d && !seen.has(d) && out.length < 5) { seen.add(d); out.push(d); }
    });
  return out;
}

function entryHtml(c, p) {
  const r = recentDescs(c);
  const chips = r.length
    ? '<div class="chips">' + r.map(d =>
        '<button type="button" class="chip" data-chip="' + esc(d) + '">' + esc(d) + '</button>').join('') + '</div>'
    : '';
  const n = nowParts();   // القيم الافتراضية: التاريخ والوقت الحاليان
  return `
    <div class="entry" data-type="${type}">
      <div class="tg" role="group" aria-label="نوع الحركة">
        <span class="tg-thumb" aria-hidden="true"></span>
        <button type="button" class="tg-b tg-d" data-t="debt" aria-pressed="${type === 'debt'}">دين</button>
        <button type="button" class="tg-b tg-p" data-t="pay" aria-pressed="${type === 'pay'}">سداد</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label for="${p}am">المبلغ</label>
          <input id="${p}am" class="amin" type="number" inputmode="decimal" min="0" step="any" enterkeyhint="done"></div>
        <div><label for="${p}ds">البيان (اختياري)</label>
          <input id="${p}ds" autocomplete="off" enterkeyhint="done"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label for="${p}dt">التاريخ</label>
          <input id="${p}dt" type="date" value="${n.date}"></div>
        <div><label for="${p}tm">الوقت</label>
          <input id="${p}tm" type="time" value="${n.time}"></div>
      </div>

      ${chips}
      <div class="pv" id="${p}pv" aria-live="polite"></div>
      <button class="sbtn" id="${p}sb" type="button">${type === 'debt' ? 'إضافة دين' : 'إضافة سداد'}</button>
    </div>`;
}

function wireEntry(c, p, onDone) {
  const am = $(p + 'am'), ds = $(p + 'ds'), sb = $(p + 'sb'), pv = $(p + 'pv');
  const dt = $(p + 'dt'), tm = $(p + 'tm');
  const ent = am.closest('.entry');

  const paint = () => {
    ent.dataset.type = type;
    ent.querySelectorAll('.tg-b').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.t === type)));
    sb.textContent = type === 'debt' ? 'إضافة دين' : 'إضافة سداد';
    const a = parseFloat(am.value);
    pv.innerHTML = a > 0
      ? 'سيُسجَّل: <b class="ltr ' + (type === 'debt' ? 'amt-d' : 'amt-p') + '">' +
        (type === 'debt' ? '−' : '') + num(a) + '</b>'
      : '';
  };

  const submit = () => {
    const a = parseFloat(am.value);
    if (!(a > 0)) { toast('أدخل مبلغًا أكبر من صفر'); am.focus(); return; }
    const n = nowParts();               // قيمة احتياطية إن كان أحد الحقلين فارغًا
    const tx = {
      id: uid(),
      type,
      amount: a,
      desc: ds.value.trim(),
      date: (dt && dt.value) ? dt.value : n.date,
      time: (tm && tm.value) ? tm.value : n.time
    };
    c.transactions.push(tx);
    save();
    onDone(tx);
  };

  ent.querySelectorAll('.tg-b').forEach(b => b.onclick = () => { type = b.dataset.t; paint(); });
  am.oninput = paint;
  sb.onclick = submit;

  // Enter في أي من الحقول يُرسل
  [am, ds, dt, tm].forEach(el => {
    if (el) el.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };
  });

  ent.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => {
    ds.value = (ds.value === b.dataset.chip) ? '' : b.dataset.chip;
    if (!am.value) am.focus();
  });
  paint();
}

function undoAdd(cid, txid, refresh) {
  const c = customers.find(x => x.id === cid);
  if (!c) return;
  c.transactions = c.transactions.filter(t => t.id !== txid);
  save(); refresh(); toast('تم التراجع');
}

function quickAdd(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  modal('<h3>' + esc(c.name) + ' — إضافة حركة</h3>' + entryHtml(c, 'q') +
        '<button class="g" style="width:100%;margin-top:8px" id="qx" type="button">إلغاء</button>');
  $('qx').onclick = closeM;
  wireEntry(c, 'q', tx => {
    closeM(); viewList();
    toast((tx.type === 'debt' ? 'دين ' : 'سداد ') + num(tx.amount) + ' — ' + c.name,
          'تراجع', () => undoAdd(id, tx.id, viewList));
  });
  $('qam').focus();
}

/* ------------------------------------------------------------
   6) عرض قائمة المشترين
   ------------------------------------------------------------ */
function viewList() {
  cur = null;
  const owed = customers.reduce((a, c) => a + Math.max(0, bal(c)), 0);
  const openCount = customers.filter(c => bal(c) > 0).length;

  const searched = customers.filter(c => c.name.includes(q.trim()));
  const list = applyFilters(searched);
  const active = filtersCount();

  const sortChips = [
    ['name',        'أبجدي'],
    ['date-desc',   'الأحدث'],
    ['date-asc',    'الأقدم'],
    ['amount-desc', 'المبلغ ⬇'],
    ['amount-asc',  'المبلغ ⬆']
  ].map(([v, l]) =>
    `<button class="fchip" type="button" data-fs="${v}" aria-pressed="${filters.sort === v}">${l}</button>`
  ).join('');

  const statusChips = [
    ['all',    'الكل'],
    ['debt',   'عليهم دين'],
    ['paid',   'مسدَّد'],
    ['credit', 'رصيد لهم']
  ].map(([v, l]) =>
    `<button class="fchip" type="button" data-fst="${v}" aria-pressed="${filters.status === v}">${l}</button>`
  ).join('');

  $('v').innerHTML = `
    <div class="sum">
      <small>إجمالي المتبقي على المشترين</small>
      <div class="big">${num(owed)}</div>
      <small>${num(openCount)} مشترٍ عليهم مبالغ من أصل ${num(customers.length)}</small>
    </div>

    <div class="row">
      <input id="q" type="search" placeholder="ابحث بالاسم" aria-label="بحث" value="${esc(q)}">
      <button class="p" id="add" style="margin-bottom:10px;white-space:nowrap" type="button">+ مشترٍ جديد</button>
    </div>

    <div id="af" class="box hide">
      <h3>مشترٍ جديد</h3>
      <input id="nn" placeholder="اسم المشتري" aria-label="اسم المشتري" enterkeyhint="done">
      <div class="row">
        <button class="p" id="sv" style="flex:1" type="button">حفظ</button>
        <button class="o" id="cn" type="button">إلغاء</button>
      </div>
    </div>

    <div class="fp${fpOpen ? ' open' : ''}" id="fp">
      <div class="fp-h" id="fph" role="button" tabindex="0" aria-expanded="${fpOpen}">
        <span class="t">⚙ الفلاتر والترتيب ${active ? '<span class="c">' + active + '</span>' : ''}</span>
        <span class="ic" aria-hidden="true">▼</span>
      </div>
      <div class="fp-b"><div class="fp-bi"><div>
        <div class="fg">
          <label>الترتيب</label>
          <div class="fchips">${sortChips}</div>
        </div>
        <div class="fg">
          <label>الحالة</label>
          <div class="fchips">${statusChips}</div>
        </div>
        <div class="fg">
          <label>نطاق المبلغ (المتبقي)</label>
          <div class="frange">
            <input id="fmin" type="number" inputmode="decimal" placeholder="من" value="${esc(filters.min)}">
            <span class="sep">—</span>
            <input id="fmax" type="number" inputmode="decimal" placeholder="إلى" value="${esc(filters.max)}">
          </div>
        </div>
        <div class="factions">
          <button class="g" id="freset" type="button">↺ إعادة ضبط</button>
        </div>
      </div></div></div>
    </div>

    ${list.length ? '<div class="note" style="margin:0 0 8px">اضغط على المشتري لإظهار «عرض السجل»</div>' : ''}
    ${list.length
      ? list.map(c => {
          const b = bal(c);
          const owes = b > 0, credit = b < 0;
          return `<div class="cust${c.id === openId ? ' open' : ''}" data-id="${esc(c.id)}" role="button" tabindex="0" aria-expanded="${c.id === openId}">
            <div class="ct">
              <div class="inf">
                <div class="nm">${esc(c.name)}</div>
                <small>${num(c.transactions.length)} حركة</small>
              </div>
              <div class="bal ${owes ? 'neg' : 'z'}">
                ${owes ? '<span class="ltr">−' + num(b) + '</span>' : (credit ? num(-b) : 'مسدَّد')}
                ${owes ? '<small>المتبقي</small>' : (credit ? '<small>رصيد له</small>' : '')}
              </div>
              <div class="row">
                <button class="p sm" data-add="${esc(c.id)}" type="button">إضافة حركة</button>
                <button class="o sm" data-img="${esc(c.id)}" type="button">صورة</button>
              </div>
            </div>
            <div class="cm"><div class="cmi"><div>
              <button class="p" style="width:100%" data-view="${esc(c.id)}" type="button">عرض السجل</button>
            </div></div></div>
          </div>`;
        }).join('')
      : '<div class="empty">لا يوجد مشترون مطابقون.<br>جرّب تغيير الفلاتر أو البحث.</div>'}`;

  /* --- ربط البحث --- */
  $('q').oninput = e => {
    q = e.target.value;
    const p = e.target.selectionStart;
    viewList();
    const i = $('q'); i.focus(); i.setSelectionRange(p, p);
  };

  /* --- إضافة مشترٍ جديد --- */
  $('add').onclick = () => { $('af').classList.remove('hide'); $('nn').focus(); };
  $('cn').onclick  = () => $('af').classList.add('hide');
  const saveCustomer = () => {
    const n = $('nn').value.trim();
    if (!n) { toast('أدخل اسم المشتري'); return; }
    const nc = { id: uid(), name: n, transactions: [] };
    customers.unshift(nc);
    q = '';
    save(); viewList(); quickAdd(nc.id);
  };
  $('sv').onclick = saveCustomer;
  $('nn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveCustomer(); } };

  /* --- لوحة الفلاتر --- */
  const fp = $('fp'), fph = $('fph');
  const toggleFp = () => {
    fpOpen = !fpOpen;
    fp.classList.toggle('open', fpOpen);
    fph.setAttribute('aria-expanded', String(fpOpen));
  };
  fph.onclick = toggleFp;
  fph.onkeydown = e => {
    if (e.target === fph && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); toggleFp();
    }
  };

  document.querySelectorAll('[data-fs]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    filters.sort = b.dataset.fs;
    viewList();
    fpOpen = true;
    const nf = $('fp'); if (nf) nf.classList.add('open');
  });

  document.querySelectorAll('[data-fst]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    filters.status = b.dataset.fst;
    viewList();
    fpOpen = true;
    const nf = $('fp'); if (nf) nf.classList.add('open');
  });

  const fmin = $('fmin'), fmax = $('fmax');
  const commitAmount = () => {
    filters.min = fmin ? fmin.value.trim() : '';
    filters.max = fmax ? fmax.value.trim() : '';
    viewList();
    fpOpen = true;
    const nf = $('fp'); if (nf) nf.classList.add('open');
  };
  if (fmin) fmin.onchange = commitAmount;
  if (fmax) fmax.onchange = commitAmount;
  [fmin, fmax].forEach(el => el && (el.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
  }));

  const freset = $('freset');
  if (freset) freset.onclick = e => {
    e.stopPropagation();
    filters = DEFAULT_FILTERS();
    viewList();
    fpOpen = true;
    const nf = $('fp'); if (nf) nf.classList.add('open');
  };

  /* --- بطاقات المشترين --- */
  document.querySelectorAll('.cust').forEach(card => {
    const toggle = () => {
      const willOpen = !card.classList.contains('open');
      document.querySelectorAll('.cust.open').forEach(x => {
        x.classList.remove('open'); x.setAttribute('aria-expanded', 'false');
      });
      if (willOpen) { card.classList.add('open'); card.setAttribute('aria-expanded', 'true'); }
      openId = willOpen ? card.dataset.id : null;
    };
    card.onclick = toggle;
    card.onkeydown = e => {
      if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); }
    };
  });
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = e => { e.stopPropagation(); openDetail(b.dataset.view); });
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = e => { e.stopPropagation(); quickAdd(b.dataset.add); });
  document.querySelectorAll('[data-img]').forEach(b => b.onclick = e => { e.stopPropagation(); showLedgerImage(b.dataset.img); });
}

/* ------------------------------------------------------------
   7) تفاصيل المشتري
   ------------------------------------------------------------ */
function viewDetail(id, focusAmount) {
  cur = id;
  const c = customers.find(x => x.id === id);
  if (!c) { viewList(); return; }

  const b = bal(c);
  const rows = [...c.transactions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  $('v').innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <button class="o" id="bk2" type="button">⬅ عودة</button>
      <button class="p" id="img" type="button">📄 صورة السجل</button>
      <button class="g" id="ed" type="button">تعديل الاسم</button>
      <button class="d sm" id="dc" type="button">حذف</button>
    </div>
    <h2 style="margin:0 0 4px;color:var(--brand)">${esc(c.name)}</h2>
    <div class="sum">
      <small>${b < 0 ? 'رصيد للمشتري' : 'المتبقي عليه'}</small>
      <div class="big">${b > 0 ? '<span class="ltr">−' + num(b) + '</span>' : num(Math.abs(b))}</div>
    </div>
    <div class="box">
      <h3>إضافة حركة</h3>
      ${entryHtml(c, 'n')}
    </div>
    <h3 style="font-size:15px;margin:0 0 6px">سجل الحركات</h3>
    <div class="tw">
      <table>
        <thead><tr><th>التاريخ</th><th>الوقت</th><th>النوع</th><th>المبلغ</th><th>البيان</th><th></th></tr></thead>
        <tbody>
          ${rows.length
            ? rows.map(t => `<tr>
                <td>${esc(t.date)}</td>
                <td>${esc(t.time)}</td>
                <td class="${t.type === 'debt' ? 'amt-d' : 'amt-p'}">${t.type === 'debt' ? 'دين' : 'سداد'}</td>
                <td class="${t.type === 'debt' ? 'amt-d' : 'amt-p'}">${t.type === 'debt' ? '<span class="ltr">−' + num(t.amount) + '</span>' : num(t.amount)}</td>
                <td>${esc(t.desc) || '-'}</td>
                <td class="acts">
                  <button class="g" data-e="${esc(t.id)}" type="button">تعديل</button>
                  <button class="g" data-x="${esc(t.id)}" type="button">حذف</button>
                </td>
              </tr>`).join('')
            : '<tr><td colspan="6" class="empty">لا توجد حركات بعد.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  window.scrollTo(0, 0);

  $('bk2').onclick = goBack;
  $('img').onclick = () => showLedgerImage(id);
  wireEntry(c, 'n', tx => {
    viewDetail(id, true);
    toast((tx.type === 'debt' ? 'تم تسجيل دين ' : 'تم تسجيل سداد ') + num(tx.amount),
          'تراجع', () => undoAdd(id, tx.id, () => viewDetail(id)));
  });
  if (focusAmount) $('nam').focus({ preventScroll: true });
  $('ed').onclick = () => {
    modal(`<h3>تعديل الاسم</h3><input id="en" value="${esc(c.name)}" aria-label="الاسم">
      <div class="row">
        <button class="g" style="flex:1" id="no" type="button">إلغاء</button>
        <button class="p" style="flex:1" id="ok" type="button">حفظ</button>
      </div>`);
    $('no').onclick = closeM;
    $('ok').onclick = () => {
      const n = $('en').value.trim();
      if (!n) return;
      c.name = n; save(); closeM(); viewDetail(id);
    };
  };
  $('dc').onclick = () => confirmBox(
    'حذف المشتري نهائيًا؟',
    'سيُحذف ' + c.name + ' وكل حركاته، ولا يمكن التراجع.',
    'حذف نهائي',
    () => { customers = customers.filter(x => x.id !== id); save(); goBack(); toast('تم الحذف'); }
  );
  document.querySelectorAll('[data-x]').forEach(b => {
    b.onclick = () => {
      const i = c.transactions.findIndex(t => t.id === b.dataset.x);
      if (i < 0) return;
      const removed = c.transactions.splice(i, 1)[0];
      save(); viewDetail(id);
      toast('تم حذف الحركة', 'تراجع', () => {
        const cc = customers.find(x => x.id === id);
        if (!cc) return;
        cc.transactions.splice(Math.min(i, cc.transactions.length), 0, removed);
        save();
        if (cur === id) viewDetail(id); else viewList();
        toast('تم استرجاع الحركة');
      });
    };
  });
  document.querySelectorAll('[data-e]').forEach(b => {
    b.onclick = () => {
      const t = c.transactions.find(x => x.id === b.dataset.e);
      modal(`<h3>تعديل الحركة</h3>
        <label for="et">النوع</label>
        <select id="et">
          <option value="debt"${t.type === 'debt' ? ' selected' : ''}>دين</option>
          <option value="pay"${t.type === 'pay' ? ' selected' : ''}>سداد</option>
        </select>
        <label for="ea">المبلغ</label>
        <input id="ea" type="number" step="any" value="${t.amount}">
        <label for="ed2">البيان</label>
        <input id="ed2" value="${esc(t.desc)}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
          <div><label for="edt">التاريخ</label>
            <input id="edt" type="date" value="${esc(t.date)}"></div>
          <div><label for="etm">الوقت</label>
            <input id="etm" type="time" value="${esc(t.time)}"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="g" style="flex:1" id="no" type="button">إلغاء</button>
          <button class="p" style="flex:1" id="ok" type="button">حفظ</button>
        </div>`);
      $('no').onclick = closeM;
      $('ok').onclick = () => {
        const a = parseFloat($('ea').value);
        if (!(a > 0)) { toast('أدخل مبلغًا صحيحًا'); return; }
        t.type = $('et').value;
        t.amount = a;
        t.desc = $('ed2').value.trim();
        if ($('edt').value) t.date = $('edt').value;
        if ($('etm').value) t.time = $('etm').value;
        save(); closeM(); viewDetail(id);
      };
    };
  });
}

/* ============================================================
   8) توليد صورة السجل
   ============================================================ */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

async function ensureFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load('400 24px Tajawal'),
      document.fonts.load('500 28px Tajawal'),
      document.fonts.load('700 42px Tajawal'),
      document.fonts.load('700 84px Tajawal')
    ]);
  } catch (e) {}
}

async function generateLedgerImage(customer) {
  await ensureFonts();

  const sorted = [...customer.transactions].sort((a, b) =>
    (a.date + a.time).localeCompare(b.date + b.time)
  );

  let cum = 0;
  const withBalance = sorted.map(t => {
    cum = Math.round((cum + (t.type === 'debt' ? t.amount : -t.amount)) * 100) / 100;
    return Object.assign({}, t, { balance: cum });
  });

  const total = withBalance.length;
  const rowsShown = withBalance.slice(-IMG_MAX_ROWS);
  const hidden = Math.max(0, total - IMG_MAX_ROWS);
  const finalBalance = cum;

  const C = {
    bg:        '#ffffff',
    ink:       '#1a1a1a',
    muted:     '#6b7280',
    border:    '#e5e7eb',
    brand:     '#0f4c4a',
    brandTint: '#f0f5f4',
    debt:      '#c0392b',
    pay:       '#26734a'
  };

  const PAD = 50;
  const W = IMG_WIDTH;
  const H_HEADER     = 100;
  const H_NAME       = 90;
  const H_BALANCE    = 190;
  const H_TABLE_HEAD = 75;
  const H_ROW        = 76;
  const H_HIDDEN     = hidden ? 55 : 0;
  const H_FOOTER     = 110;

  const height =
    PAD + H_HEADER + H_NAME + H_BALANCE + H_TABLE_HEAD +
    (rowsShown.length * H_ROW) + H_HIDDEN + H_FOOTER + PAD;

  const dpr = Math.max(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width  = W * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);

  const rightX = W - PAD;
  const leftX  = PAD;
  const centerX = W / 2;
  let y = PAD;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toTimeString().slice(0, 5);

  /* 1. الرأس */
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.brand;
  ctx.textAlign = 'right';
  ctx.font = '700 46px Tajawal, Tahoma, sans-serif';
  ctx.fillText(projectName, rightX, y + H_HEADER / 2);

  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  ctx.font = '400 22px Tajawal, Tahoma, sans-serif';
  ctx.fillText(dateStr + '  •  ' + timeStr, leftX, y + H_HEADER / 2);

  y += H_HEADER;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  /* 2. اسم المشتري */
  ctx.textAlign = 'right';
  ctx.fillStyle = C.muted;
  ctx.font = '500 22px Tajawal, Tahoma, sans-serif';
  ctx.fillText('المشتري', rightX, y + 30);

  ctx.fillStyle = C.ink;
  ctx.font = '700 40px Tajawal, Tahoma, sans-serif';
  const maxNameW = W - PAD * 2;
  const custName = ctx.measureText(customer.name).width > maxNameW
    ? truncateText(ctx, customer.name, maxNameW)
    : customer.name;
  ctx.fillText(custName, rightX, y + 68);

  y += H_NAME;

  /* 3. صندوق الرصيد */
  const isDebtor = finalBalance > 0;
  const isCredit = finalBalance < 0;
  const balColor = isDebtor ? C.debt : C.pay;
  const balLabel = isDebtor ? 'المتبقي عليه' : (isCredit ? 'رصيد له' : 'مسدَّد');

  ctx.fillStyle = C.brandTint;
  roundRect(ctx, PAD, y, W - PAD * 2, H_BALANCE - 30, 22);
  ctx.fill();

  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  ctx.font = '500 26px Tajawal, Tahoma, sans-serif';
  ctx.fillText(balLabel, rightX - 35, y + 55);

  ctx.textAlign = 'left';
  ctx.font = '400 22px Tajawal, Tahoma, sans-serif';
  ctx.fillText('إجمالي الحركات: ' + total, leftX + 35, y + 55);

  const balText = isDebtor ? '−' + numImg(finalBalance) : numImg(Math.abs(finalBalance));
  const maxBalW = W - PAD * 2 - 70;
  let balFontSize = 84;
  ctx.font = '700 ' + balFontSize + 'px Tajawal, Tahoma, sans-serif';
  while (ctx.measureText(balText).width > maxBalW && balFontSize > 36) {
    balFontSize -= 4;
    ctx.font = '700 ' + balFontSize + 'px Tajawal, Tahoma, sans-serif';
  }

  ctx.fillStyle = balColor;
  ctx.textAlign = 'right';
  ctx.fillText(balText, rightX - 35, y + 125);

  y += H_BALANCE;

  /* 4. الجدول */
  const CONTENT_W = W - PAD * 2;
  const COL_DATE_W    = 200;
  const COL_AMOUNT_W  = 200;
  const COL_NOTES_W   = 320;

  const colDateRight    = W - PAD;
  const colAmountRight  = colDateRight   - COL_DATE_W;
  const colNotesRight   = colAmountRight - COL_AMOUNT_W;
  const colBalRight     = colNotesRight  - COL_NOTES_W;

  ctx.fillStyle = C.brand;
  roundRect(ctx, PAD, y, CONTENT_W, H_TABLE_HEAD, 14);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = '700 26px Tajawal, Tahoma, sans-serif';
  const headY = y + H_TABLE_HEAD / 2;
  ctx.fillText('التاريخ',         colDateRight   - 15, headY);
  ctx.fillText('المبلغ',          colAmountRight - 15, headY);
  ctx.fillText('الملاحظات',       colNotesRight  - 15, headY);
  ctx.fillText('الرصيد المتراكم', colBalRight    - 15, headY);

  y += H_TABLE_HEAD;

  rowsShown.forEach((t, i) => {
    const rowY = y + i * H_ROW;
    const cy   = rowY + H_ROW / 2;

    if (i % 2 === 1) {
      ctx.fillStyle = '#fafbfb';
      ctx.fillRect(PAD, rowY, CONTENT_W, H_ROW);
    }

    ctx.fillStyle = C.ink;
    ctx.textAlign = 'right';
    ctx.font = '400 22px Tajawal, Tahoma, sans-serif';
    ctx.fillText(t.date, colDateRight - 15, cy);

    const amtColor = t.type === 'debt' ? C.debt : C.pay;
    const amtSign  = t.type === 'debt' ? '−' : '';
    ctx.fillStyle = amtColor;
    ctx.font = '700 26px Tajawal, Tahoma, sans-serif';
    ctx.fillText(amtSign + numImg(t.amount), colAmountRight - 15, cy);

    ctx.fillStyle = C.muted;
    ctx.font = '400 20px Tajawal, Tahoma, sans-serif';
    const notes = t.desc ? truncateText(ctx, t.desc, COL_NOTES_W - 30) : '—';
    ctx.textAlign = 'right';
    ctx.fillText(notes, colNotesRight - 15, cy);

    ctx.fillStyle = t.balance > 0 ? C.debt : (t.balance < 0 ? C.pay : C.muted);
    ctx.font = '500 24px Tajawal, Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((t.balance > 0 ? '−' : '') + numImg(Math.abs(t.balance)), colBalRight - 15, cy);

    if (i < rowsShown.length - 1) {
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, rowY + H_ROW);
      ctx.lineTo(W - PAD, rowY + H_ROW);
      ctx.stroke();
    }
  });

  y += rowsShown.length * H_ROW;

  if (hidden > 0) {
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.font = '400 20px Tajawal, Tahoma, sans-serif';
    ctx.fillText('و ' + hidden + ' حركة أقدم غير معروضة', centerX, y + H_HIDDEN / 2);
    y += H_HIDDEN;
  }

  /* 5. التذييل */
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 25);
  ctx.lineTo(W - PAD, y + 25);
  ctx.stroke();

  ctx.fillStyle = C.brand;
  ctx.textAlign = 'right';
  ctx.font = '700 22px Tajawal, Tahoma, sans-serif';
  ctx.fillText('سجل المعاملات — ' + projectName, rightX, y + 65);

  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  ctx.font = '400 20px Tajawal, Tahoma, sans-serif';
  ctx.fillText('طُبعت في ' + dateStr + ' الساعة ' + timeStr, leftX, y + 65);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('فشل توليد الصورة'));
    }, 'image/png');
  });
}

/* ============================================================
   9) عرض الصورة + المشاركة
   ============================================================ */
async function showLedgerImage(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;

  if (!c.transactions.length) {
    toast('لا توجد حركات لعرضها');
    return;
  }

  modal('<h3 style="text-align:center">جاري إنشاء الصورة…</h3>' +
        '<p class="note" style="text-align:center">لحظة واحدة</p>');

  let blob;
  try {
    blob = await generateLedgerImage(c);
  } catch (e) {
    modal('<h3>خطأ</h3><p class="note">تعذّر توليد الصورة: ' + esc(e.message || '') + '</p>' +
          '<button class="p" style="width:100%" id="ok" type="button">إغلاق</button>');
    $('ok').onclick = closeM;
    return;
  }

  const url = URL.createObjectURL(blob);
  const filename = 'سجل-' + c.name.replace(/[\\/:*?"<>|]/g, '') + '-' +
                   nowParts().date + '.png';

  modal(
    '<div style="text-align:center">' +
      '<h3 style="margin-bottom:8px">' + esc(c.name) + '</h3>' +
      '<img src="' + url + '" alt="سجل الحساب" ' +
           'style="max-width:100%;max-height:55vh;border-radius:10px;' +
                  'border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
      '<div style="margin-top:12px">' +
        '<button class="p" style="width:100%;margin-bottom:6px" id="sh" type="button">📤 مشاركة</button>' +
        '<button class="o" style="width:100%;margin-bottom:6px" id="dl" type="button">⬇ تنزيل</button>' +
        '<button class="g" style="width:100%" id="ok" type="button">إغلاق</button>' +
      '</div>' +
    '</div>'
  );

  const mc = document.querySelector('#m .mc');
  if (mc) { mc.style.maxWidth = '520px'; mc.style.padding = '16px'; }

  $('sh').onclick = async () => {
    try {
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'سجل ' + c.name });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: 'سجل ' + c.name, url: url });
        return;
      }
      toast('المشاركة غير مدعومة على هذا الجهاز');
    } catch (e) {
      // المستخدم ألغى
    }
  };

  $('dl').onclick = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('تم التنزيل — راجع الصور أو التنزيلات');
  };

  $('ok').onclick = () => {
    URL.revokeObjectURL(url);
    closeM();
  };
}

/* ------------------------------------------------------------
   10) تصدير تقرير Excel
   ------------------------------------------------------------ */
function exportExcel() {
  if (!customers.length) { toast('لا يوجد مشترون للتصدير'); return; }

  const reportDate = nowParts().date;

  /* --- تجهيز صفوف التقرير --- */
  const rows = customers.map(c => {
    const b = Math.round(bal(c) * 100) / 100;
    const last = lastActivity(c);                     // "YYYY-MM-DD HH:MM" أو ""
    return {
      name:     c.name,
      count:    c.transactions.length,
      lastDate: last ? last.slice(0, 10) : '',
      lastTime: last ? last.slice(11, 16) : '',
      debt:     b > 0 ? b : 0,
      credit:   b < 0 ? -b : 0,
      balance:  b,
      status:   b > 0 ? 'عليه دين' : (b < 0 ? 'رصيد له' : 'مسدَّد')
    };
  });

  // ترتيب: الأكثر دينًا أولاً ثم أبجديًا
  rows.sort((a, b) => (b.debt - a.debt) || a.name.localeCompare(b.name, 'ar'));

  const totalDebt   = Math.round(rows.reduce((s, r) => s + r.debt,   0) * 100) / 100;
  const totalCredit = Math.round(rows.reduce((s, r) => s + r.credit, 0) * 100) / 100;

  const cellNum = (v, cls) => {
    const c = cls ? ('num ' + cls) : 'num';
    const s = Number(v) ? String(Math.round(Number(v) * 100) / 100) : '';
    return '<td class="' + c + '">' + s + '</td>';
  };

  /* --- بناء ملف HTML يفتحه Excel --- */
  let html =
    '<html xmlns:x="urn:schemas-microsoft-com:office:excel" dir="rtl">' +
    '<head><meta charset="UTF-8"><style>' +
    'table{border-collapse:collapse;font-family:Tajawal,Arial,sans-serif}' +
    'th,td{border:1px solid #c0c0c0;padding:6px 10px;text-align:right;vertical-align:middle;white-space:nowrap}' +
    'th{background:#0f4c4a;color:#ffffff;font-weight:bold}' +
    '.title{font-size:16pt;font-weight:bold;color:#0f4c4a;padding:8px 0}' +
    '.meta{color:#6b7280;font-size:10pt;padding-bottom:8px}' +
    '.num{mso-number-format:"0\\.00";text-align:left}' +
    '.debt{color:#c0392b;font-weight:bold}' +
    '.credit{color:#26734a;font-weight:bold}' +
    '.ok{color:#26734a}' +
    '.total{background:#e2ecea;font-weight:bold}' +
    '</style></head><body>';

  html += '<div class="title">' + esc(projectName) + ' — تقرير المبالغ المتبقية</div>';
  html += '<div class="meta">' +
          'تاريخ التقرير: ' + reportDate +
          '  •  عدد المشترين: ' + rows.length +
          '  •  إجمالي الديون: ' + totalDebt +
          '  •  إجمالي أرصدة المشترين: ' + totalCredit +
          '</div>';

  html += '<table><thead><tr>' +
          '<th>#</th>' +
          '<th>اسم المشتري</th>' +
          '<th>عدد الحركات</th>' +
          '<th>تاريخ آخر حركة</th>' +
          '<th>وقت آخر حركة</th>' +
          '<th>المتبقي عليه (دين)</th>' +
          '<th>رصيد له</th>' +
          '<th>الحالة</th>' +
          '</tr></thead><tbody>';

  rows.forEach((r, i) => {
    const cls = r.balance > 0 ? 'debt' : (r.balance < 0 ? 'credit' : 'ok');
    html += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + esc(r.name) + '</td>' +
      '<td class="num">' + r.count + '</td>' +
      '<td>' + (r.lastDate || '—') + '</td>' +
      '<td>' + (r.lastTime || '—') + '</td>' +
      cellNum(r.debt,   'debt') +
      cellNum(r.credit, 'credit') +
      '<td class="' + cls + '">' + r.status + '</td>' +
      '</tr>';
  });

  html += '<tr class="total">' +
          '<td colspan="5">الإجمالي</td>' +
          cellNum(totalDebt,   'debt') +
          cellNum(totalCredit, 'credit') +
          '<td></td>' +
          '</tr>';

  html += '</tbody></table></body></html>';

  /* --- التنزيل --- */
  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safeName = projectName.replace(/[\\/:*?"<>|]/g, '').trim() || 'المعاملات';
  a.href     = url;
  a.download = 'تقرير-' + safeName + '-' + reportDate + '.xls';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('تم تنزيل تقرير Excel');
}

/* ------------------------------------------------------------
   10.6) تعديل اسم المشروع
   ------------------------------------------------------------ */
function renderProjectName() {
  const el = $('pt');
  if (el) el.textContent = projectName;
}

function editProjectName() {
  modal(`<h3>اسم المشروع</h3>
    <p class="note" style="margin-bottom:10px">
      يظهر في رأس القائمة وفي تقرير Excel وفي صورة السجل.
    </p>
    <input id="pni" value="${esc(projectName)}" maxlength="40"
           aria-label="اسم المشروع" enterkeyhint="done" autocomplete="off">
    <div class="row">
      <button class="g" style="flex:1" id="no" type="button">إلغاء</button>
      <button class="p" style="flex:1" id="ok" type="button">حفظ</button>
    </div>`);

  const input = $('pni');
  input.focus();
  input.select();

  const commit = () => {
    const v = input.value.trim();
    if (!v) { toast('أدخل اسمًا للمشروع'); input.focus(); return; }
    projectName = v;
    saveProjectName();
    renderProjectName();
    closeM();
    toast('تم تحديث اسم المشروع');
  };

  $('no').onclick = closeM;
  $('ok').onclick = commit;
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } };
}

function setupProjectName() {
  const el = $('pt');
  if (!el) return;
  renderProjectName();
  el.onclick = editProjectName;
  el.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editProjectName(); }
  };
}

/* ------------------------------------------------------------
   10.7) نافذة النسخة الاحتياطية
   ------------------------------------------------------------ */
function setupBackup() {
  $('bk').onclick = () => {
    modal(`<h3>النسخة الاحتياطية</h3>
      <p class="note" style="margin-bottom:12px">
        تقرير Excel يحتوي اسم كل مشترٍ، عدد حركاته، تاريخ ووقت آخر حركة، والمبلغ المتبقي عليه.
      </p>
      <button class="p" style="width:100%;padding:14px;font-size:15px;font-weight:700" id="xl" type="button">📊 تنزيل تقرير Excel</button>
      <button class="g" style="width:100%;margin-top:10px" id="no" type="button">إغلاق</button>`);

    $('xl').onclick = exportExcel;
    $('no').onclick = closeM;
  };
}

/* ------------------------------------------------------------
   11) الثيم
   ------------------------------------------------------------ */
function setupTheme() {
  $('th').onclick = () => {
    const r = document.documentElement;
    const isDark = r.dataset.theme === 'dark'
      || (!r.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
    r.dataset.theme = isDark ? 'light' : 'dark';
  };
}

/* ------------------------------------------------------------
   12) الإقلاع
   ------------------------------------------------------------ */
load();
loadProjectName();
setupProjectName();
setupBackup();
setupTheme();
viewList();

})();