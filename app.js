/* ============================================================
   سجل المعاملات — منطق التطبيق
   الإصدار 4 — توليد صورة PNG للسجل (بدل QR)
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

// أرقام عربية للعرض داخل التطبيق
const num = n => Number(n).toLocaleString('ar-EG', { maximumFractionDigits: 2 });
// أرقام لاتينية للصورة (أوضح في المشاركة والطباعة)
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
const IMG_WIDTH = 1080;        // عرض مثالي لواتساب
const IMG_MAX_ROWS = 15;       // أقصى عدد حركات معروضة
const PROJECT_NAME = 'مشروع 1'; // ← غيّره لاحقًا

/* ------------------------------------------------------------
   3) حالة التطبيق
   ------------------------------------------------------------ */
let customers = [];
let cur = null;
let q = '';
let type = 'debt';

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
  c.transactions.reduce((a, t) => a + (t.type === 'debt' ? t.amount : -t.amount), 0);

/* ------------------------------------------------------------
   5) Toast + Modal
   ------------------------------------------------------------ */
function toast(msg) {
  const t = $('t');
  t.textContent = msg;
  t.classList.remove('hide');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.add('hide'), 3500);
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
   6) عرض قائمة المشترين
   ------------------------------------------------------------ */
function viewList() {
  cur = null;
  const owed = customers.reduce((a, c) => a + Math.max(0, bal(c)), 0);
  const open = customers.filter(c => bal(c) > 0).length;
  const list = customers.filter(c => c.name.includes(q.trim()));

  $('v').innerHTML = `
    <div class="sum">
      <small>إجمالي المتبقي على المشترين</small>
      <div class="big">${num(owed)}</div>
      <small>${num(open)} مشترٍ عليهم مبالغ من أصل ${num(customers.length)}</small>
    </div>
    <div class="row">
      <input id="q" type="search" placeholder="ابحث بالاسم" aria-label="بحث" value="${esc(q)}">
      <button class="p" id="add" style="margin-bottom:10px;white-space:nowrap" type="button">+ مشترٍ جديد</button>
    </div>
    <div id="af" class="box hide">
      <h3>مشترٍ جديد</h3>
      <input id="nn" placeholder="اسم المشتري" aria-label="اسم المشتري">
      <div class="row">
        <button class="p" id="sv" style="flex:1" type="button">حفظ</button>
        <button class="o" id="cn" type="button">إلغاء</button>
      </div>
    </div>
    ${list.length
      ? list.map(c => {
          const b = bal(c);
          return `<div class="cust">
            <div>
              <div class="nm">${esc(c.name)}</div>
              <small>${num(c.transactions.length)} حركة</small>
            </div>
            <div class="bal ${b <= 0 ? 'z' : ''}">
              ${b <= 0 ? 'مسدَّد' : num(b)}
              <small>${b < 0 ? 'رصيد له ' + num(-b) : 'المتبقي'}</small>
            </div>
            <div class="row">
              <button class="p sm" data-o="${esc(c.id)}" type="button">السجل</button>
              <button class="o sm" data-img="${esc(c.id)}" type="button">صورة</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="empty">لا يوجد مشترون هنا.<br>اضغط «مشترٍ جديد» للبدء.</div>'}`;

  $('q').oninput = e => {
    q = e.target.value;
    const p = e.target.selectionStart;
    viewList();
    const i = $('q'); i.focus(); i.setSelectionRange(p, p);
  };
  $('add').onclick = () => { $('af').classList.remove('hide'); $('nn').focus(); };
  $('cn').onclick  = () => $('af').classList.add('hide');
  $('sv').onclick  = () => {
    const n = $('nn').value.trim();
    if (!n) { toast('أدخل اسم المشتري'); return; }
    customers.unshift({ id: uid(), name: n, transactions: [] });
    save(); viewList(); toast('تمت إضافة المشتري');
  };
  document.querySelectorAll('[data-o]').forEach(b => b.onclick = () => viewDetail(b.dataset.o));
  document.querySelectorAll('[data-img]').forEach(b => b.onclick = () => showLedgerImage(b.dataset.img));
}

/* ------------------------------------------------------------
   7) تفاصيل المشتري
   ------------------------------------------------------------ */
function viewDetail(id) {
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
      <div class="big">${num(Math.abs(b))}</div>
    </div>
    <div class="box">
      <h3>إضافة حركة</h3>
      <div class="seg">
        <button id="td" aria-pressed="${type === 'debt'}" type="button">دين (عليه)</button>
        <button id="tp" aria-pressed="${type === 'pay'}" type="button">سداد (دفعة)</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label for="am">المبلغ</label><input id="am" type="number" inputmode="decimal" min="0" step="any"></div>
        <div><label for="ds">البيان (اختياري)</label><input id="ds"></div>
      </div>
      <button class="p" id="at" style="width:100%" type="button">إضافة الحركة</button>
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
                <td>${t.type === 'debt' ? 'دين' : 'سداد'}</td>
                <td class="${t.type === 'debt' ? 'amt-d' : 'amt-p'}">${num(t.amount)}</td>
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

  $('bk2').onclick = viewList;
  $('img').onclick = () => showLedgerImage(id);
  $('td').onclick = () => { type = 'debt'; viewDetail(id); };
  $('tp').onclick = () => { type = 'pay';  viewDetail(id); };
  $('at').onclick = () => {
    const a = parseFloat($('am').value);
    if (!(a > 0)) { toast('أدخل مبلغًا أكبر من صفر'); return; }
    const p = nowParts();
    c.transactions.push({ id: uid(), type, amount: a, desc: $('ds').value.trim(), date: p.date, time: p.time });
    save(); viewDetail(id); toast('تمت إضافة الحركة');
  };
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
    () => { customers = customers.filter(x => x.id !== id); save(); viewList(); toast('تم الحذف'); }
  );
  document.querySelectorAll('[data-x]').forEach(b => {
    b.onclick = () => confirmBox('حذف هذه الحركة؟', 'لا يمكن التراجع.', 'حذف', () => {
      c.transactions = c.transactions.filter(t => t.id !== b.dataset.x);
      save(); viewDetail(id); toast('تم حذف الحركة');
    });
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
        <div class="row">
          <button class="g" style="flex:1" id="no" type="button">إلغاء</button>
          <button class="p" style="flex:1" id="ok" type="button">حفظ</button>
        </div>`);
      $('no').onclick = closeM;
      $('ok').onclick = () => {
        const a = parseFloat($('ea').value);
        if (!(a > 0)) { toast('أدخل مبلغًا صحيحًا'); return; }
        t.type = $('et').value; t.amount = a; t.desc = $('ed2').value.trim();
        save(); closeM(); viewDetail(id);
      };
    };
  });
}

/* ============================================================
   8) توليد صورة السجل (الجزء الجديد)
   ============================================================ */

/** مستطيل بأطراف دائرية */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

/** اقتطاع النص ليتسع داخل عرض محدد */
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

/** التأكد من تحميل الخط قبل الرسم */
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

/** توليد صورة PNG للسجل، وإرجاع Blob */
async function generateLedgerImage(customer) {
  await ensureFonts();

  /* -- ترتيب زمني (الأقدم أولًا) لحساب الرصيد المتراكم -- */
  const sorted = [...customer.transactions].sort((a, b) =>
    (a.date + a.time).localeCompare(b.date + b.time)
  );

  let cum = 0;
  const withBalance = sorted.map(t => {
    cum += (t.type === 'debt' ? t.amount : -t.amount);
    return Object.assign({}, t, { balance: cum });
  });

  const total = withBalance.length;
  const rowsShown = withBalance.slice(-IMG_MAX_ROWS); // آخر 15 (الأحدث)
  const hidden = Math.max(0, total - IMG_MAX_ROWS);
  const finalBalance = cum;

  /* -- الألوان (أخضر مائي + أبيض) -- */
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

  /* -- أبعاد -- */
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

  /* -- تحضير Canvas بدقة عالية -- */
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width  = W * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  /* -- الخلفية -- */
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);

  const rightX = W - PAD;
  const leftX  = PAD;
  const centerX = W / 2;
  let y = PAD;

  /* -- التواريخ -- */
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toTimeString().slice(0, 5);

  /* ===== 1. الرأس ===== */
  ctx.textBaseline = 'middle';

  // اسم المشروع (يمين)
  ctx.fillStyle = C.brand;
  ctx.textAlign = 'right';
  ctx.font = '700 46px Tajawal, Tahoma, sans-serif';
  ctx.fillText(PROJECT_NAME, rightX, y + H_HEADER / 2);

  // التاريخ والوقت (يسار)
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  ctx.font = '400 22px Tajawal, Tahoma, sans-serif';
  ctx.fillText(dateStr + '  •  ' + timeStr, leftX, y + H_HEADER / 2);

  // خط فاصل
  y += H_HEADER;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  /* ===== 2. اسم المشتري ===== */
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

  /* ===== 3. صندوق الرصيد ===== */
  const isDebtor = finalBalance > 0;
  const isCredit = finalBalance < 0;
  const balColor = isDebtor ? C.debt : C.pay;
  const balLabel = isDebtor ? 'المتبقي عليه' : (isCredit ? 'رصيد له' : 'مسدَّد');

  // خلفية الصندوق
  ctx.fillStyle = C.brandTint;
  roundRect(ctx, PAD, y, W - PAD * 2, H_BALANCE - 30, 22);
  ctx.fill();

  // التسمية
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  ctx.font = '500 26px Tajawal, Tahoma, sans-serif';
  ctx.fillText(balLabel, rightX - 35, y + 55);

  // عدد الحركات
  ctx.textAlign = 'left';
  ctx.font = '400 22px Tajawal, Tahoma, sans-serif';
  ctx.fillText('إجمالي الحركات: ' + total, leftX + 35, y + 55);

  // الرقم الكبير (مع تصغير تلقائي إن كان طويلًا)
  const balText = numImg(Math.abs(finalBalance));
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

  /* ===== 4. الجدول ===== */
  /* عرض الأعمدة (من اليمين إلى اليسار)
     التاريخ | المبلغ | الملاحظات | الرصيد
     200     | 200   | 320       | 260   = 980 */
  const CONTENT_W = W - PAD * 2;
  const COL_DATE_W    = 200;
  const COL_AMOUNT_W  = 200;
  const COL_NOTES_W   = 320;
  const COL_BAL_W     = CONTENT_W - COL_DATE_W - COL_AMOUNT_W - COL_NOTES_W;

  const colDateRight    = W - PAD;
  const colAmountRight  = colDateRight   - COL_DATE_W;
  const colNotesRight   = colAmountRight - COL_AMOUNT_W;
  const colBalRight     = colNotesRight  - COL_NOTES_W;

  /* --- رأس الجدول --- */
  ctx.fillStyle = C.brand;
  roundRect(ctx, PAD, y, CONTENT_W, H_TABLE_HEAD, 14);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = '700 26px Tajawal, Tahoma, sans-serif';
  const headY = y + H_TABLE_HEAD / 2;
  ctx.fillText('التاريخ',      colDateRight   - 15, headY);
  ctx.fillText('المبلغ',       colAmountRight - 15, headY);
  ctx.fillText('الملاحظات',    colNotesRight  - 15, headY);
  ctx.fillText('الرصيد المتراكم', colBalRight  - 15, headY);

  y += H_TABLE_HEAD;

  /* --- صفوف الجدول --- */
  rowsShown.forEach((t, i) => {
    const rowY = y + i * H_ROW;
    const cy   = rowY + H_ROW / 2;

    // تخطيط متعرج
    if (i % 2 === 1) {
      ctx.fillStyle = '#fafbfb';
      ctx.fillRect(PAD, rowY, CONTENT_W, H_ROW);
    }

    // التاريخ
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'right';
    ctx.font = '400 22px Tajawal, Tahoma, sans-serif';
    ctx.fillText(t.date, colDateRight - 15, cy);

    // المبلغ (مع إشارة + أو −)
    const amtColor = t.type === 'debt' ? C.debt : C.pay;
    const amtSign  = t.type === 'debt' ? '+' : '−';
    ctx.fillStyle = amtColor;
    ctx.font = '700 26px Tajawal, Tahoma, sans-serif';
    ctx.fillText(amtSign + ' ' + numImg(t.amount), colAmountRight - 15, cy);

    // الملاحظات (مع اقتطاع)
    ctx.fillStyle = C.muted;
    ctx.font = '400 20px Tajawal, Tahoma, sans-serif';
    const notes = t.desc ? truncateText(ctx, t.desc, COL_NOTES_W - 30) : '—';
    ctx.textAlign = 'right';
    ctx.fillText(notes, colNotesRight - 15, cy);

    // الرصيد المتراكم
    ctx.fillStyle = t.balance > 0 ? C.debt : (t.balance < 0 ? C.pay : C.muted);
    ctx.font = '500 24px Tajawal, Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(numImg(t.balance), colBalRight - 15, cy);

    // خط فاصل بين الصفوف
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

  /* --- سطر "الحركات المخفية" --- */
  if (hidden > 0) {
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.font = '400 20px Tajawal, Tahoma, sans-serif';
    ctx.fillText('و ' + hidden + ' حركة أقدم غير معروضة', centerX, y + H_HIDDEN / 2);
    y += H_HIDDEN;
  }

  /* ===== 5. التذييل ===== */
  // خط فاصل علوي
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 25);
  ctx.lineTo(W - PAD, y + 25);
  ctx.stroke();

  // علامة المشروع (يمين)
  ctx.fillStyle = C.brand;
  ctx.textAlign = 'right';
  ctx.font = '700 22px Tajawal, Tahoma, sans-serif';
  ctx.fillText('سجل المعاملات — ' + PROJECT_NAME, rightX, y + 65);

  // تاريخ الطباعة (يسار)
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  ctx.font = '400 20px Tajawal, Tahoma, sans-serif';
  ctx.fillText('طُبعت في ' + dateStr + ' الساعة ' + timeStr, leftX, y + 65);

  /* ===== تحويل إلى Blob ===== */
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

  // جعل النافذة أوسع للصورة
  const mc = document.querySelector('#m .mc');
  if (mc) { mc.style.maxWidth = '520px'; mc.style.padding = '16px'; }

  /* -- مشاركة -- */
  $('sh').onclick = async () => {
    try {
      const file = new File([blob], filename, { type: 'image/png' });

      // المسار المفضّل: مشاركة كملف (يدعم واتساب مباشرة)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'سجل ' + c.name });
        return;
      }
      // مسار احتياطي: مشاركة الرابط
      if (navigator.share) {
        await navigator.share({ title: 'سجل ' + c.name, url: url });
        return;
      }
      toast('المشاركة غير مدعومة على هذا الجهاز');
    } catch (e) {
      // المستخدم ألغى — لا نفعل شيئًا
    }
  };

  /* -- تنزيل (يعمل على أندرويد وسطح المكتب) -- */
  $('dl').onclick = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('تم التنزيل — راجع الصور أو التنزيلات');
  };

  /* -- تنظيف -- */
  $('ok').onclick = () => {
    URL.revokeObjectURL(url);
    closeM();
  };
}

/* ------------------------------------------------------------
   10) النسخة الاحتياطية
   ------------------------------------------------------------ */
function setupBackup() {
  $('bk').onclick = () => {
    modal(`<h3>نسخة احتياطية</h3>
      <p class="note">انسخ النص واحفظه في مكان آمن. للاسترجاع الصقه هنا ثم اضغط «استرجاع».</p>
      <textarea id="bt" aria-label="بيانات النسخة"></textarea>
      <div class="row" style="margin-top:10px">
        <button class="o" style="flex:1" id="cp" type="button">نسخ</button>
        <button class="d" style="flex:1" id="rs" type="button">استرجاع</button>
      </div>
      <button class="g" style="width:100%;margin-top:8px" id="no" type="button">إغلاق</button>`);
    $('bt').value = JSON.stringify(customers);
    $('no').onclick = closeM;
    $('cp').onclick = async () => {
      try { await navigator.clipboard.writeText($('bt').value); toast('تم النسخ'); }
      catch (e) { $('bt').select(); toast('انسخ يدويًا'); }
    };
    $('rs').onclick = () => {
      try {
        const d = JSON.parse($('bt').value);
        if (!Array.isArray(d)) throw 0;
        confirmBox('استبدال البيانات؟', 'ستُستبدل كل البيانات الحالية بالنسخة الملصقة.', 'استرجاع', () => {
          customers = normalize(d);
          save(); viewList(); toast('تم الاسترجاع');
        });
      } catch (e) { toast('النص غير صالح'); }
    };
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
setupBackup();
setupTheme();
viewList();

})();