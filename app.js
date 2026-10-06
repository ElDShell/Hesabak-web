/* ============================================================
   سجل المعاملات — منطق التطبيق
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

const uid = () =>
  (crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const nowParts = () => {
  const d = new Date();
  return { date: d.toLocaleDateString('en-CA'), time: d.toTimeString().slice(0, 5) };
};

/* ------------------------------------------------------------
   2) الحالة العامة
   ------------------------------------------------------------ */
let customers = [];
let cur = null;        // معرّف المشتري المعروض حاليًا
let q = '';            // نص البحث
let type = 'debt';     // نوع الحركة المختارة في نموذج الإضافة

/* ------------------------------------------------------------
   3) التخزين المحلي
   ------------------------------------------------------------ */
const store = (op, v) => {
  try {
    return op === 'g' ? localStorage.getItem(KEY) : localStorage.setItem(KEY, v);
  } catch (e) { return null; }
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
  try {
    if (s) { customers = normalize(JSON.parse(s)); return; }
  } catch (e) { /* تجاهل البيانات التالفة */ }

  // بيانات تجريبية عند أول تشغيل
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
   4) التنبيه العائم (Toast)
   ------------------------------------------------------------ */
function toast(msg) {
  const t = $('t');
  t.textContent = msg;
  t.classList.remove('hide');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.add('hide'), 3000);
}

/* ------------------------------------------------------------
   5) النوافذ المنبثقة
   ------------------------------------------------------------ */
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
  modal(
    `<h3>${esc(title)}</h3>
     <p class="note">${esc(text)}</p>
     <div class="row">
       <button class="g" style="flex:1" id="no" type="button">إلغاء</button>
       <button class="d" style="flex:1" id="ok" type="button">${esc(okLabel)}</button>
     </div>`
  );
  $('no').onclick = closeM;
  $('ok').onclick = () => { closeM(); fn(); };
}

/* ------------------------------------------------------------
   6) العرض: قائمة المشترين
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
      <input id="q" type="search" placeholder="ابحث بالاسم" aria-label="بحث"
             value="${esc(q)}">
      <button class="p" id="add" style="margin-bottom:10px;white-space:nowrap" type="button">
        + مشترٍ جديد
      </button>
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
              <button class="o sm" data-qr="${esc(c.id)}" type="button">QR</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="empty">لا يوجد مشترون هنا.<br>اضغط «مشترٍ جديد» للبدء.</div>'}
  `;

  // البحث
  $('q').oninput = e => {
    q = e.target.value;
    const p = e.target.selectionStart;
    viewList();
    const i = $('q');
    i.focus();
    i.setSelectionRange(p, p);
  };

  // إضافة مشترٍ
  $('add').onclick = () => { $('af').classList.remove('hide'); $('nn').focus(); };
  $('cn').onclick  = () => $('af').classList.add('hide');
  $('sv').onclick  = () => {
    const n = $('nn').value.trim();
    if (!n) { toast('أدخل اسم المشتري'); return; }
    customers.unshift({ id: uid(), name: n, transactions: [] });
    save(); viewList(); toast('تمت إضافة المشتري');
  };

  // الأزرار داخل البطاقات
  document.querySelectorAll('[data-o]').forEach(b => {
    b.onclick = () => viewDetail(b.dataset.o);
  });
  document.querySelectorAll('[data-qr]').forEach(b => {
    b.onclick = () => showQR(b.dataset.qr);
  });
}

/* ------------------------------------------------------------
   7) العرض: تفاصيل المشتري
   ------------------------------------------------------------ */
function viewDetail(id) {
  cur = id;
  const c = customers.find(x => x.id === id);
  if (!c) { viewList(); return; }

  const b = bal(c);
  const rows = [...c.transactions].sort((a, b) =>
    (b.date + b.time).localeCompare(a.date + a.time)
  );

  $('v').innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <button class="o" id="bk2" type="button">⬅ عودة</button>
      <button class="p" id="qr" type="button">📱 QR</button>
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
        <button id="tp" aria-pressed="${type === 'pay'}"  type="button">سداد (دفعة)</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label for="am">المبلغ</label>
          <input id="am" type="number" inputmode="decimal" min="0" step="any">
        </div>
        <div>
          <label for="ds">البيان (اختياري)</label>
          <input id="ds">
        </div>
      </div>
      <button class="p" id="at" style="width:100%" type="button">إضافة الحركة</button>
    </div>

    <h3 style="font-size:15px;margin:0 0 6px">سجل الحركات</h3>
    <div class="tw">
      <table>
        <thead>
          <tr>
            <th>التاريخ</th><th>الوقت</th><th>النوع</th>
            <th>المبلغ</th><th>البيان</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map(t => `
              <tr>
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
            : '<tr><td colspan="6" class="empty">لا توجد حركات بعد. أضف أول دين أو سداد.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  window.scrollTo(0, 0);

  /* أحداث التفاصيل */
  $('bk2').onclick = viewList;
  $('qr').onclick  = () => showQR(id);

  $('td').onclick = () => { type = 'debt'; viewDetail(id); };
  $('tp').onclick = () => { type = 'pay';  viewDetail(id); };

  $('at').onclick = () => {
    const a = parseFloat($('am').value);
    if (!(a > 0)) { toast('أدخل مبلغًا أكبر من صفر'); return; }
    const p = nowParts();
    c.transactions.push({
      id: uid(), type, amount: a,
      desc: $('ds').value.trim(), date: p.date, time: p.time
    });
    save(); viewDetail(id); toast('تمت إضافة الحركة');
  };

  $('ed').onclick = () => {
    modal(
      `<h3>تعديل الاسم</h3>
       <input id="en" value="${esc(c.name)}" aria-label="الاسم">
       <div class="row">
         <button class="g" style="flex:1" id="no" type="button">إلغاء</button>
         <button class="p" style="flex:1" id="ok" type="button">حفظ</button>
       </div>`
    );
    $('no').onclick = closeM;
    $('ok').onclick = () => {
      const n = $('en').value.trim();
      if (!n) return;
      c.name = n; save(); closeM(); viewDetail(id);
    };
  };

  $('dc').onclick = () => confirmBox(
    'حذف المشتري نهائيًا؟',
    'سيُحذف ' + c.name + ' وكل حركاته، ولا يمكن التراجع. إن سدّد كل ما عليه فالأفضل الإبقاء على سجله.',
    'حذف نهائي',
    () => {
      customers = customers.filter(x => x.id !== id);
      save(); viewList(); toast('تم الحذف');
    }
  );

  document.querySelectorAll('[data-x]').forEach(b => {
    b.onclick = () => confirmBox(
      'حذف هذه الحركة؟', 'لا يمكن التراجع عن الحذف.', 'حذف',
      () => {
        c.transactions = c.transactions.filter(t => t.id !== b.dataset.x);
        save(); viewDetail(id); toast('تم حذف الحركة');
      }
    );
  });

  document.querySelectorAll('[data-e]').forEach(b => {
    b.onclick = () => {
      const t = c.transactions.find(x => x.id === b.dataset.e);
      modal(
        `<h3>تعديل الحركة</h3>
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
         </div>`
      );
      $('no').onclick = closeM;
      $('ok').onclick = () => {
        const a = parseFloat($('ea').value);
        if (!(a > 0)) { toast('أدخل مبلغًا صحيحًا'); return; }
        t.type   = $('et').value;
        t.amount = a;
        t.desc   = $('ed2').value.trim();
        save(); closeM(); viewDetail(id);
      };
    };
  });
}

/* ------------------------------------------------------------
   8) رمز QR
   ------------------------------------------------------------ */
function showQR(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;

  let img = '';
  try {
    const qr = qrcode(0, 'L');
    qr.addData(id);
    qr.make();
    img = qr.createImgTag(5, 10);
  } catch (e) {
    img = '<p class="note">تعذّر تحميل مكتبة QR. تحقق من الاتصال بالإنترنت.</p>';
  }

  modal(
    `<div style="text-align:center">
       <h3>${esc(c.name)}</h3>
       <div class="qr">${img}</div>
       <p class="note">يحمل الكود معرّف المشتري فقط. لن يفتح السجل من جهاز آخر إلا بعد ربط التطبيق بخادم.</p>
       <button class="p" style="width:100%" id="ok" type="button">إغلاق</button>
     </div>`
  );
  $('ok').onclick = closeM;
}

/* ------------------------------------------------------------
   9) النسخة الاحتياطية
   ------------------------------------------------------------ */
function setupBackup() {
  $('bk').onclick = () => {
    modal(
      `<h3>نسخة احتياطية</h3>
       <p class="note">انسخ النص واحفظه في مكان آمن. للاسترجاع الصقه هنا ثم اضغط «استرجاع» (يستبدل البيانات الحالية).</p>
       <textarea id="bt" aria-label="بيانات النسخة"></textarea>
       <div class="row" style="margin-top:10px">
         <button class="o" style="flex:1" id="cp" type="button">نسخ</button>
         <button class="d" style="flex:1" id="rs" type="button">استرجاع</button>
       </div>
       <button class="g" style="width:100%;margin-top:8px" id="no" type="button">إغلاق</button>`
    );

    $('bt').value = JSON.stringify(customers);
    $('no').onclick = closeM;

    $('cp').onclick = async () => {
      try {
        await navigator.clipboard.writeText($('bt').value);
        toast('تم النسخ');
      } catch (e) {
        $('bt').select();
        toast('حدّد النص وانسخه يدويًا');
      }
    };

    $('rs').onclick = () => {
      try {
        const d = JSON.parse($('bt').value);
        if (!Array.isArray(d)) throw 0;
        confirmBox(
          'استبدال البيانات؟',
          'ستُستبدل كل البيانات الحالية بالنسخة الملصقة.',
          'استرجاع',
          () => {
            customers = normalize(d);
            save(); viewList(); toast('تم الاسترجاع');
          }
        );
      } catch (e) {
        toast('النص غير صالح');
      }
    };
  };
}

/* ------------------------------------------------------------
   10) تبديل الثيم
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
   11) الإقلاع
   ------------------------------------------------------------ */
load();
setupBackup();
setupTheme();
viewList();

})();