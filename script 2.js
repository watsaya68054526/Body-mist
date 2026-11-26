/* ==========================================================================
   Body Scent — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : โหลด products.json, แสดงการ์ด, กรองตาม mood
   - order.html   : เติม items/total จาก URL, ส่งฟอร์มไป Apps Script
   - admin.html   : ดึง CSV มาแสดงเป็นตารางคำสั่งซื้อ
   ========================================================================== */

/* >>> ใส่ URL ของ Google Apps Script (Web app) ตรงนี้ <<< */
const APPS_SCRIPT_URL = '[APPS_SCRIPT_URL]';

/* >>> ใส่ URL ของ CSV (Google Sheets > Publish to web > CSV) ตรงนี้ <<< */
const CSV_URL = '[CSV_URL]';

const MOODS = [
  { key: 'all',       label: 'ทั้งหมด' },
  { key: 'fresh',     label: 'Fresh' },
  { key: 'sweet',     label: 'Sweet' },
  { key: 'confident', label: 'Confident' },
  { key: 'romance',   label: 'Romance' }
];

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('product-list')) initProductPage();
  if (document.getElementById('orderForm'))   initOrderPage();
  if (document.querySelector('#ordersTable tbody')) initAdminPage();
});

/* ==========================================================================
   หน้า product.html
   ต้องมีใน HTML:  <div id="filter-bar" class="filters"></div>
                   <div id="product-list" class="product-grid"></div>
   ========================================================================== */
function initProductPage() {
  const grid = document.getElementById('product-list');
  const filtersEl = document.getElementById('filter-bar');
  let products = [];

  const params = new URLSearchParams(window.location.search);
  const requested = (params.get('mood') || 'all').toLowerCase();
  let currentMood = MOODS.some(m => m.key === requested) ? requested : 'all';

  renderFilters();

  fetch('products.json')
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      products = data;
      renderProducts();
    })
    .catch(error => {
      console.error(error);
      grid.innerHTML = '';
      const msg = document.createElement('p');
      msg.className = 'text-center';
      msg.textContent = 'ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง';
      grid.appendChild(msg);
    });

  /* ----- ปุ่มกรอง ----- */
  function renderFilters() {
    if (!filtersEl) return;
    filtersEl.innerHTML = '';
    MOODS.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter' + (m.key === currentMood ? ' is-active' : '');
      btn.dataset.mood = m.key;
      btn.setAttribute('aria-pressed', String(m.key === currentMood));

      if (m.key !== 'all') {
        const dot = document.createElement('span');
        dot.className = 'mood-dot mood-' + m.key;
        btn.appendChild(dot);
      }
      btn.appendChild(document.createTextNode(m.label));

      btn.addEventListener('click', () => {
        currentMood = m.key;
        updateUrl();
        renderFilters();
        renderProducts();
      });
      filtersEl.appendChild(btn);
    });
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    if (currentMood === 'all') url.searchParams.delete('mood');
    else url.searchParams.set('mood', currentMood);
    history.replaceState(null, '', url);
  }

  /* ----- การ์ดสินค้า ----- */
  function renderProducts() {
    grid.innerHTML = '';
    const list = currentMood === 'all'
      ? products
      : products.filter(p => p.mood === currentMood);

    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-center';
      empty.textContent = 'ยังไม่มีสินค้าในหมวดนี้';
      grid.appendChild(empty);
      return;
    }
    list.forEach(p => grid.appendChild(createCard(p)));
  }

  function createCard(p) {
    const card = document.createElement('article');
    card.className = 'card mood-' + p.mood;

    // รูป
    const media = document.createElement('div');
    media.className = 'card__media';
    const img = document.createElement('img');
    img.src = p.image;
    img.alt = p.name;
    img.loading = 'lazy';
    media.appendChild(img);

    // เนื้อหา
    const body = document.createElement('div');
    body.className = 'card__body';

    const label = document.createElement('span');
    label.className = 'mood-label';
    const dot = document.createElement('span');
    dot.className = 'mood-dot';
    label.appendChild(dot);
    label.appendChild(document.createTextNode(capitalize(p.mood)));

    const title = document.createElement('h3');
    title.className = 'card__title';
    title.textContent = p.name;

    body.appendChild(label);
    body.appendChild(title);

    if (p.size) {
      const meta = document.createElement('p');
      meta.className = 'card__meta';
      meta.textContent = p.size;
      body.appendChild(meta);
    }

    // ราคา + ปุ่มสั่งซื้อ
    const footer = document.createElement('div');
    footer.className = 'card__footer';

    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = formatPrice(p.price);
    const unit = document.createElement('small');
    unit.textContent = 'บาท';
    price.appendChild(unit);

    const order = document.createElement('a');
    order.className = 'btn btn--sm';
    order.textContent = 'สั่งซื้อ';
    order.href = buildOrderUrl(p);

    footer.appendChild(price);
    footer.appendChild(order);
    body.appendChild(footer);

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }
}

/* ส่ง item (ชื่อสินค้า + ไซส์) และ price ไปหน้า order.html */
function buildOrderUrl(p) {
  const itemName = p.size ? p.name + ' ' + p.size : p.name;
  return 'order.html?item=' + encodeURIComponent(itemName) +
         '&price=' + encodeURIComponent(p.price);
}

/* ==========================================================================
   หน้า order.html
   ต้องมีใน HTML: <form id="orderForm"> ที่มี input/textarea id =
   customerName, contact, items, total, note
   และปุ่ม "ยืนยันสั่งซื้อ" เป็น type="submit"
   ========================================================================== */
function initOrderPage() {
  const form = document.getElementById('orderForm');
  const itemsInput = document.getElementById('items');
  const totalInput = document.getElementById('total');

  // เติมค่าจาก URL ทันทีที่โหลดหน้า (ทั้ง items และ total)
  const params = new URLSearchParams(window.location.search);
  const item = params.get('item');
  const price = params.get('price');

  if (item && itemsInput) itemsInput.value = item;
  if (price && totalInput) totalInput.value = price;

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const payload = {
      customerName: document.getElementById('customerName').value.trim(),
      contact:      document.getElementById('contact').value.trim(),
      items:        document.getElementById('items').value.trim(),
      total:        document.getElementById('total').value.trim(),
      note:         document.getElementById('note').value.trim()
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;   // กันกดซ้ำ

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(() => { window.location.href = 'thankyou.html'; })
    .catch(error => {
      console.error(error);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      if (submitBtn) submitBtn.disabled = false;
    });
  });
}

/* ==========================================================================
   หน้า admin.html
   ต้องมีใน HTML: <table id="ordersTable"><thead>...</thead><tbody></tbody></table>
   คอลัมน์ในชีต (ตามลำดับ): วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line,
                            รายการสินค้า, จำนวนเงินรวม, หมายเหตุ
   แถวแรกของ CSV ถือเป็นหัวตาราง (ข้าม)
   ========================================================================== */
function initAdminPage() {
  const tbody = document.querySelector('#ordersTable tbody');

  showMessage('กำลังโหลดข้อมูล...');

  fetch(CSV_URL, { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(text => {
      const rows = parseCSV(text);
      rows.shift();                                   // ข้ามหัวตาราง
      const orders = rows
        .filter(r => r.some(cell => cell.trim() !== ''))  // ตัดแถวว่าง
        .reverse();                                   // ล่าสุดขึ้นก่อน (ชีตเพิ่มแถวต่อท้ายตามเวลา)

      if (orders.length === 0) {
        showMessage('ยังไม่มีคำสั่งซื้อ');
        return;
      }
      renderOrders(orders);
    })
    .catch(error => {
      console.error(error);
      showMessage('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    });

  function renderOrders(orders) {
    tbody.innerHTML = '';
    orders.forEach(row => {
      const tr = document.createElement('tr');
      for (let i = 0; i < 6; i++) {
        const td = document.createElement('td');
        let value = row[i] !== undefined ? row[i] : '';
        if (i === 4 && value.trim() !== '' && !isNaN(Number(value))) {
          value = formatPrice(value);                 // จำนวนเงินรวม
        }
        td.textContent = value;                       // textContent กัน HTML injection
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
  }

  function showMessage(msg) {
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'text-center';
    td.textContent = msg;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

/* ==========================================================================
   parseCSV — แปลงข้อความ CSV เป็น array ของแถว (ไม่ใช้ library)
   รองรับ: ฟิลด์ในเครื่องหมายคำพูด, "" แทน " ในฟิลด์,
           comma/ขึ้นบรรทัดใหม่ภายในฟิลด์, ท้ายบรรทัดแบบ \n \r\n \r, BOM
   ========================================================================== */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // ตัด BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }   // "" -> "
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;       // \r\n
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }

  // ฟิลด์/แถวสุดท้ายที่ไม่มีขึ้นบรรทัดใหม่ปิดท้าย
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* ==========================================================================
   Helpers
   ========================================================================== */
function formatPrice(n) {
  return Number(n).toLocaleString('th-TH');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
