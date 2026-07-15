function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

document.addEventListener('DOMContentLoaded', () => {
  // ── Search + category filter (client-side, live) ────────
  const searchBox      = document.getElementById('medicineSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const items           = Array.from(document.querySelectorAll('.medicine-item'));
  const groupEls         = Array.from(document.querySelectorAll('[data-category-group]'));

  const filterNote     = document.getElementById('catalogFilterNote');
  const filterNoteText = document.getElementById('catalogFilterNoteText');
  const STATUS_FILTERS = ['out-of-stock', 'low-stock', 'expired'];
  const STATUS_NOTES = {
    'out-of-stock': 'Viewing out of stock medicines',
    'low-stock': 'Viewing low stock medicines',
    'expired': 'Viewing expired medicines',
    'Discontinued': 'Viewing discontinued medicines'
  };

  function applyFilters() {
    const query = (searchBox.value || '').trim().toLowerCase();
    const category = categoryFilter.value;
    const viewingDiscontinued = category === 'Discontinued';
    const viewingStatus = STATUS_FILTERS.includes(category) ? category : null;

    if (filterNote) {
      const noteKey = viewingDiscontinued ? 'Discontinued' : viewingStatus;
      if (noteKey) {
        filterNoteText.textContent = STATUS_NOTES[noteKey];
        filterNote.style.display = '';
      } else {
        filterNote.style.display = 'none';
      }
    }

    items.forEach((item) => {
      const matchesQuery  = !query || item.dataset.name.includes(query);
      const isDiscontinued = item.dataset.status === 'Discontinued';

      let visible;
      if (viewingDiscontinued) {
        visible = matchesQuery && isDiscontinued;
      } else if (viewingStatus) {
        visible = matchesQuery && !isDiscontinued && item.dataset.statusClass === viewingStatus;
      } else {
        const matchesCategory = category === 'All' || item.dataset.categoryId === category;
        visible = matchesQuery && matchesCategory && !isDiscontinued;
      }
      item.style.display = visible ? '' : 'none';
    });

    groupEls.forEach((group) => {
      const groupItems = Array.from(group.querySelectorAll('.medicine-item'));
      const visibleCount = groupItems.filter((item) => item.style.display !== 'none').length;
      group.style.display = visibleCount > 0 ? '' : 'none';

      const badge = group.querySelector('.count-badge');
      if (badge) badge.textContent = visibleCount;
    });
  }

  if (searchBox) searchBox.addEventListener('input', applyFilters);
  if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);

  // Establishes the default Active-only view on load (the grid otherwise
  // starts with Discontinued items mixed in, since both are server-rendered
  // together so the dropdown can toggle between them without a reload).
  applyFilters();

  // ── Modal open/close helpers ─────────────────────────────
  const detailOverlay = document.getElementById('detailOverlay');
  const formOverlay    = document.getElementById('medicineFormOverlay');
  const removeOverlay  = document.getElementById('removeOverlay');

  const openDetail  = () => detailOverlay.classList.add('is-open');
  const closeDetail = () => detailOverlay.classList.remove('is-open');
  const openForm     = () => formOverlay.classList.add('is-open');
  const closeForm    = () => formOverlay.classList.remove('is-open');
  const closeRemoveModal = () => removeOverlay.classList.remove('is-open');

  document.getElementById('closeDetail').addEventListener('click', closeDetail);
  detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) closeDetail(); });

  document.getElementById('closeMedicineForm').addEventListener('click', closeForm);
  document.getElementById('cancelMedicineForm').addEventListener('click', closeForm);
  formOverlay.addEventListener('click', (e) => { if (e.target === formOverlay) closeForm(); });

  document.getElementById('closeRemoveModal').addEventListener('click', closeRemoveModal);
  document.getElementById('cancelRemove').addEventListener('click', closeRemoveModal);
  removeOverlay.addEventListener('click', (e) => { if (e.target === removeOverlay) closeRemoveModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeDetail();
    closeForm();
    closeRemoveModal();
  });

  // The Reactivate button sits on top of a discontinued card that itself
  // opens the detail modal on click — stop that click from bubbling up to
  // the card so it doesn't also pop the detail modal open.
  document.querySelectorAll('.medicine-card__quick-actions').forEach((el) => {
    el.addEventListener('click', (e) => e.stopPropagation());
  });

  // ── Remove confirmation modal ─────────────────────────────
  const removeModalText = document.getElementById('removeModalText');
  const removeForm      = document.getElementById('removeForm');

  function openRemoveModal(id, name) {
    removeModalText.textContent = 'Remove "' + name + '" from the catalog? It will be hidden from active ' +
      'inventory but its transaction history will be preserved, and it can be reactivated later.';
    removeForm.action = '/pharmacist/inventory/' + id + '/discontinue';
    removeOverlay.classList.add('is-open');
  }

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

  let activeMedicineId = null;

  function openDetailFor(card) {
    const d = card.dataset;
    activeMedicineId = d.id;

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

    const isDiscontinued = d.status === 'Discontinued';
    document.getElementById('detailActionsActive').style.display = isDiscontinued ? 'none' : '';
    document.getElementById('detailActionsDiscontinued').style.display = isDiscontinued ? '' : 'none';
    document.getElementById('reactivateForm').action = '/pharmacist/inventory/' + d.id + '/reactivate';

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
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      openDetailFor(card);
    });
  });

  document.getElementById('detailRemoveBtn').addEventListener('click', () => {
    const card = items.find((item) => item.dataset.id === activeMedicineId);
    if (!card) return;
    closeDetail();
    openRemoveModal(activeMedicineId, card.dataset.medicineName);
  });

  // ── Add / Edit Medicine form ─────────────────────────────
  const medicineForm   = document.getElementById('medicineForm');
  const formTitle       = document.getElementById('medicineFormTitle');
  const formSubmitBtn   = document.getElementById('medicineFormSubmit');
  const imageFileInput  = document.getElementById('image_file');
  const existingImagePathInput = document.getElementById('existing_image_path');
  const uploadPreviewImg  = document.getElementById('uploadPreviewImg');
  const uploadPreviewIcon = document.getElementById('uploadPreviewIcon');
  const uploadDropzoneText = document.getElementById('uploadDropzoneText');

  function setImagePreview(src) {
    if (src) {
      uploadPreviewImg.src = src;
      uploadPreviewImg.hidden = false;
      uploadPreviewIcon.style.display = 'none';
    } else {
      uploadPreviewImg.hidden = true;
      uploadPreviewImg.removeAttribute('src');
      uploadPreviewIcon.style.display = '';
    }
  }

  imageFileInput.addEventListener('change', () => {
    const file = imageFileInput.files[0];
    if (!file) return;
    uploadDropzoneText.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  });

  function resetFormFields() {
    medicineForm.reset();
    existingImagePathInput.value = '';
    uploadDropzoneText.textContent = 'Click to upload or drag and drop';
    setImagePreview(null);
  }

  const stockQuantityField   = document.getElementById('stockQuantityField');
  const expirationDateField  = document.getElementById('expirationDateField');
  const batchSummaryField    = document.getElementById('batchSummaryField');
  const batchSummaryTotal    = document.getElementById('batchSummaryTotal');
  const batchSummaryTable    = document.getElementById('batchSummaryTable');
  const stockQuantityInput   = document.getElementById('stock_quantity');
  const expirationDateInput  = document.getElementById('expiration_date');

  function formatDateShort(iso) {
    if (!iso) return 'No expiration date';
    const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  }

  function openAddForm() {
    resetFormFields();
    medicineForm.action = '/pharmacist/inventory';
    formTitle.textContent = 'Add New Medicine';
    formSubmitBtn.textContent = 'Save Medicine';

    stockQuantityField.style.display = '';
    expirationDateField.style.display = '';
    batchSummaryField.style.display = 'none';
    stockQuantityInput.required = true;

    openForm();
  }

  function openEditForm(card) {
    const d = card.dataset;
    resetFormFields();
    medicineForm.action = '/pharmacist/inventory/' + d.id;
    formTitle.textContent = 'Edit Medicine';
    formSubmitBtn.textContent = 'Save Changes';

    document.getElementById('medicine_name').value = d.medicineName;
    document.getElementById('brand_name').value = d.brandName;
    document.getElementById('medicine_type').value = d.medicineType;
    document.getElementById('dose').value = d.dose;
    document.getElementById('description').value = d.description;
    document.getElementById('unit_price').value = d.unitPrice;
    document.getElementById('stock_threshold').value = d.stockThreshold;
    document.getElementById('category_id').value = d.categoryId;
    document.getElementById('supplier_id').value = d.supplierId;

    // Stock/expiry are no longer directly editable — a medicine can have
    // multiple batches, so this is a read-only summary instead. Delivery,
    // Sale, and Disposal (Transactions page) are what actually move stock.
    stockQuantityField.style.display = 'none';
    expirationDateField.style.display = 'none';
    stockQuantityInput.required = false;
    stockQuantityInput.value = '';
    expirationDateInput.value = '';

    const batches = JSON.parse(d.batches || '[]');
    batchSummaryField.style.display = '';
    const totalUnits = batches.reduce((sum, b) => sum + Number(b.quantity_on_hand), 0);
    batchSummaryTotal.textContent = totalUnits.toLocaleString() + ' unit' + (totalUnits === 1 ? '' : 's') +
      ' across ' + batches.length + ' batch' + (batches.length === 1 ? '' : 'es');
    batchSummaryTable.innerHTML = batches.length === 0
      ? '<p class="batch-summary-empty">No stock on hand.</p>'
      : batches.map((b) => `
          <div class="batch-summary-row">
            <span>${b.lot_number ? escapeHtml(b.lot_number) : 'Lot #' + b.batch_id}</span>
            <span>${Number(b.quantity_on_hand).toLocaleString()} units</span>
            <span>${formatDateShort(b.expiration_date)}</span>
          </div>`).join('');

    if (d.imagePath) {
      existingImagePathInput.value = d.imagePath;
      setImagePreview(d.imagePath);
    }

    openForm();
  }

  document.getElementById('openAddMedicine').addEventListener('click', openAddForm);

  document.getElementById('detailEditBtn').addEventListener('click', () => {
    const card = items.find((item) => item.dataset.id === activeMedicineId);
    if (card) {
      closeDetail();
      openEditForm(card);
    }
  });
});
