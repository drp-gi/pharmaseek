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

  // ── Modal open/close helpers ─────────────────────────────
  const detailOverlay = document.getElementById('detailOverlay');
  const formOverlay    = document.getElementById('medicineFormOverlay');

  const openDetail  = () => detailOverlay.classList.add('is-open');
  const closeDetail = () => detailOverlay.classList.remove('is-open');
  const openForm     = () => formOverlay.classList.add('is-open');
  const closeForm    = () => formOverlay.classList.remove('is-open');

  document.getElementById('closeDetail').addEventListener('click', closeDetail);
  detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) closeDetail(); });

  document.getElementById('closeMedicineForm').addEventListener('click', closeForm);
  document.getElementById('cancelMedicineForm').addEventListener('click', closeForm);
  formOverlay.addEventListener('click', (e) => { if (e.target === formOverlay) closeForm(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeDetail();
    closeForm();
  });

  // ── Detail modal population ──────────────────────────────
  const money = (v) => '₱' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

    document.getElementById('deleteForm').action = '/pharmacist/inventory/' + d.id + '/delete';

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

  // ── Delete confirmation ──────────────────────────────────
  document.getElementById('deleteForm').addEventListener('submit', (e) => {
    const name = document.getElementById('detailName').textContent;
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) {
      e.preventDefault();
    }
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

  function openAddForm() {
    resetFormFields();
    medicineForm.action = '/pharmacist/inventory';
    formTitle.textContent = 'Add New Medicine';
    formSubmitBtn.textContent = 'Save Medicine';
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
    document.getElementById('stock_quantity').value = d.stockQuantity;
    document.getElementById('stock_threshold').value = d.stockThreshold;
    document.getElementById('expiration_date').value = d.expirationDate;
    document.getElementById('category_id').value = d.categoryId;
    document.getElementById('supplier_id').value = d.supplierId;

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
