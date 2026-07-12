document.addEventListener('DOMContentLoaded', () => {
  // ── Search + category filter (client-side, live) ────────
  const searchBox      = document.getElementById('medicineSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const items           = Array.from(document.querySelectorAll('.medicine-item'));
  const groupEls         = Array.from(document.querySelectorAll('[data-category-group]'));

  function applyFilters() {
    const query = (searchBox.value || '').trim().toLowerCase();
    const category = categoryFilter.value;

    items.forEach((item) => {
      const matchesQuery    = !query || item.dataset.name.includes(query);
      const matchesCategory = category === 'All' || item.dataset.categoryId === category;
      item.style.display = (matchesQuery && matchesCategory) ? '' : 'none';
    });

    groupEls.forEach((group) => {
      const groupItems = Array.from(group.querySelectorAll('.medicine-item'));
      const hasVisible = groupItems.some((item) => item.style.display !== 'none');
      group.style.display = hasVisible ? '' : 'none';
    });
  }

  if (searchBox) searchBox.addEventListener('input', applyFilters);
  if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);

  // ── Detail modal open/close ──────────────────────────────
  const detailOverlay = document.getElementById('detailOverlay');
  const openDetail  = () => detailOverlay.classList.add('is-open');
  const closeDetail = () => detailOverlay.classList.remove('is-open');

  document.getElementById('closeDetail').addEventListener('click', closeDetail);
  detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) closeDetail(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  // ── Detail modal population ──────────────────────────────
  const money = (v) => '₱' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (iso) => {
    if (!iso) return '—';
    // Parsed as UTC (not the browser's own local time) so the calendar
    // date it displays is never off by a day for a viewer in a different
    // timezone than Manila.
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  };

  function openDetailFor(card) {
    const d = card.dataset;

    document.getElementById('detailName').textContent = d.medicineName;
    document.getElementById('detailBrand').textContent = d.brandName || '';
    document.getElementById('detailBrand').style.display = d.brandName ? '' : 'none';

    const metaParts = [d.medicineType, d.dose].filter(Boolean);
    document.getElementById('detailMeta').textContent = metaParts.join(' | ');
    document.getElementById('detailMeta').style.display = metaParts.length ? '' : 'none';

    document.getElementById('detailDescription').textContent = d.description || 'No description provided.';

    document.getElementById('detailPrice').textContent = money(d.unitPrice);

    const isLow = Number(d.stockQuantity) < Number(d.stockThreshold);
    const stockEl = document.getElementById('detailStock');
    stockEl.textContent = Number(d.stockQuantity).toLocaleString();
    stockEl.classList.toggle('text-low-stock', isLow);

    document.getElementById('detailThreshold').textContent = Number(d.stockThreshold).toLocaleString();
    document.getElementById('detailExpiration').textContent = formatDate(d.expirationDate);

    const statusBadge = document.getElementById('detailStatusBadge');
    if (d.statusClass) {
      statusBadge.textContent = d.statusLabel;
      statusBadge.className = 'badge badge--' + d.statusClass;
      statusBadge.hidden = false;
    } else {
      statusBadge.hidden = true;
    }

    const categoryEl = document.getElementById('detailCategory');
    categoryEl.textContent = d.categoryName || 'Uncategorized';

    const supplierBlock = document.getElementById('detailSupplierBlock');
    if (d.supplierName) {
      supplierBlock.style.display = '';
      document.getElementById('detailSupplierName').textContent = d.supplierName;
      document.getElementById('detailSupplierPhone').textContent = d.supplierPhone || '';
    } else {
      supplierBlock.style.display = 'none';
    }

    const detailImage = document.getElementById('detailImage');
    const detailImageIcon = document.getElementById('detailImageIcon');
    if (d.imagePath) {
      detailImage.src = d.imagePath;
      detailImage.alt = d.medicineName;
      detailImage.hidden = false;
      detailImageIcon.style.display = 'none';
    } else {
      detailImage.hidden = true;
      detailImage.removeAttribute('src');
      detailImageIcon.style.display = '';
    }

    openDetail();
  }

  items.forEach((card) => {
    card.addEventListener('click', () => openDetailFor(card));
  });
});
