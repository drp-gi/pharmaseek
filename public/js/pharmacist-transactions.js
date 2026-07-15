document.addEventListener('DOMContentLoaded', () => {
  // ── Sale tab: cart-style entry ───────────────────────────
  // Search box + suggestions replace the old <select>; items get queued
  // into a client-side cart and only hit the server when "Record Sale"
  // is clicked, one POST per item, via wireSaleCart() below.
  wireSaleCart({
    dataElId: 'saleMedicinesData',
    searchInputId: 'sale_medicine_search',
    suggestionsId: 'saleMedicineSuggestions',
    quantityInputId: 'sale_quantity',
    addBtnId: 'saleAddToCartBtn',
    addErrorId: 'saleCartAddError',
    cartSectionId: 'saleCartSection',
    cartBodyId: 'saleCartBody',
    cartTotalId: 'saleCartTotal',
    submitErrorId: 'saleCartSubmitError',
    recordBtnId: 'saleRecordBtn',
    endpoint: '/pharmacist/transactions/sale'
  });

  // ── Disposal tab: same cart-style entry, plus a shared reason ────
  wireDisposalCart({
    dataElId: 'disposalMedicinesData',
    searchInputId: 'disposal_medicine_search',
    suggestionsId: 'disposalMedicineSuggestions',
    quantityInputId: 'disposal_quantity',
    addBtnId: 'disposalAddToCartBtn',
    addErrorId: 'disposalCartAddError',
    cartSectionId: 'disposalCartSection',
    cartBodyId: 'disposalCartBody',
    reasonInputId: 'disposal_reason',
    submitErrorId: 'disposalCartSubmitError',
    recordBtnId: 'disposalRecordBtn',
    endpoint: '/pharmacist/transactions/disposal'
  });

  // ── Confirm Delivery modal (Delivery Check-in tab) ───────
  const confirmDeliveryOverlay      = document.getElementById('confirmDeliveryOverlay');
  const confirmDeliveryForm         = document.getElementById('confirmDeliveryForm');
  const confirmDeliveryTitle        = document.getElementById('confirmDeliveryTitle');
  const confirmDeliveryRequestedQty = document.getElementById('confirmDeliveryRequestedQty');
  const quantityReceivedInput       = document.getElementById('quantity_received');
  const expirationDateInput         = document.getElementById('expiration_date');
  const lotNumberInput              = document.getElementById('lot_number');
  const deliveryNotesInput          = document.getElementById('delivery_notes');
  const closeConfirmDeliveryBtn     = document.getElementById('closeConfirmDelivery');
  const cancelConfirmDeliveryBtn    = document.getElementById('cancelConfirmDelivery');

  if (confirmDeliveryOverlay) {
    function openConfirmDeliveryModal(trigger) {
      confirmDeliveryTitle.textContent = 'Confirm Delivery — ' + trigger.dataset.medicine;
      confirmDeliveryRequestedQty.textContent = trigger.dataset.requestedQty;
      confirmDeliveryForm.action = '/pharmacist/transactions/checkin/' + trigger.dataset.requestId;
      quantityReceivedInput.value = '';
      if (expirationDateInput) expirationDateInput.value = '';
      if (lotNumberInput) lotNumberInput.value = '';
      deliveryNotesInput.value = '';
      confirmDeliveryOverlay.classList.add('is-open');
    }
    function closeConfirmDeliveryModal() {
      confirmDeliveryOverlay.classList.remove('is-open');
    }

    document.querySelectorAll('[data-confirm-delivery-trigger]').forEach((btn) => {
      btn.addEventListener('click', () => openConfirmDeliveryModal(btn));
    });

    if (closeConfirmDeliveryBtn) closeConfirmDeliveryBtn.addEventListener('click', closeConfirmDeliveryModal);
    if (cancelConfirmDeliveryBtn) cancelConfirmDeliveryBtn.addEventListener('click', closeConfirmDeliveryModal);
    confirmDeliveryOverlay.addEventListener('click', (e) => {
      if (e.target === confirmDeliveryOverlay) closeConfirmDeliveryModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeConfirmDeliveryModal();
    });
  }
});

// ── Shared helpers ──────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function formatMoney(n) {
  return '₱' + Number(n).toFixed(2);
}

// Wires a search input + rich suggestions dropdown against a `medicines`
// list (matches medicine name, brand, or type). Shared by the Sale and
// Disposal carts, which each layer their own cart/submit logic on top via
// the onSelect callback.
function wireMedicineSearch({ searchInput, suggestionsBox, quantityInput, medicines, onSelect }) {
  let currentMatches = [];

  function render(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      suggestionsBox.innerHTML = '';
      suggestionsBox.style.display = 'none';
      return;
    }

    currentMatches = medicines.filter((m) => (
      (m.medicine_name && m.medicine_name.toLowerCase().includes(q)) ||
      (m.brand_name && m.brand_name.toLowerCase().includes(q)) ||
      (m.medicine_type && m.medicine_type.toLowerCase().includes(q))
    )).slice(0, 8);

    if (currentMatches.length === 0) {
      suggestionsBox.innerHTML = '<div class="medicine-suggestion medicine-suggestion--empty">No medicines found.</div>';
      suggestionsBox.style.display = 'block';
      return;
    }

    suggestionsBox.innerHTML = currentMatches.map((m, i) => {
      const colorIndex = m.medicine_name.charCodeAt(0) % 5;
      const initial = m.medicine_name.charAt(0).toUpperCase();
      const avatarInner = m.image_path
        ? `<img src="${escapeHtml(m.image_path)}" alt="">`
        : initial;
      const metaParts = [m.brand_name, Number(m.stock_quantity).toLocaleString() + ' units available'].filter(Boolean);
      return `
        <button type="button" class="medicine-suggestion" data-index="${i}">
          <span class="medicine-suggestion__avatar avatar--${colorIndex}">${avatarInner}</span>
          <span class="medicine-suggestion__body">
            <span class="medicine-suggestion__name">${escapeHtml(m.medicine_name)}</span>
            <span class="medicine-suggestion__meta">${escapeHtml(metaParts.join(' · '))}</span>
          </span>
          ${m.medicine_type ? `<span class="badge badge--category">${escapeHtml(m.medicine_type)}</span>` : ''}
        </button>`;
    }).join('');
    suggestionsBox.style.display = 'block';

    suggestionsBox.querySelectorAll('.medicine-suggestion[data-index]').forEach((el) => {
      el.addEventListener('click', () => {
        const m = currentMatches[Number(el.dataset.index)];
        searchInput.value = m.medicine_name;
        suggestionsBox.innerHTML = '';
        suggestionsBox.style.display = 'none';
        if (quantityInput) {
          quantityInput.max = m.stock_quantity;
          quantityInput.placeholder = `Max ${m.stock_quantity}`;
          quantityInput.focus();
        }
        onSelect(m);
      });
    });
  }

  searchInput.addEventListener('input', () => {
    onSelect(null);
    render(searchInput.value);
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) render(searchInput.value);
  });
  document.addEventListener('click', (e) => {
    if (e.target !== searchInput && !suggestionsBox.contains(e.target)) {
      suggestionsBox.style.display = 'none';
    }
  });
}

// Cart-style entry for the Sale tab: "Add to List" queues items client-side;
// nothing is sent to the server until "Record Sale" fires one POST per
// queued item.
function wireSaleCart(opts) {
  const dataEl = document.getElementById(opts.dataElId);
  const searchInput = document.getElementById(opts.searchInputId);
  const suggestionsBox = document.getElementById(opts.suggestionsId);
  const quantityInput = document.getElementById(opts.quantityInputId);
  const addBtn = document.getElementById(opts.addBtnId);
  const addErrorEl = document.getElementById(opts.addErrorId);
  const cartSection = document.getElementById(opts.cartSectionId);
  const cartBody = document.getElementById(opts.cartBodyId);
  const cartTotalEl = document.getElementById(opts.cartTotalId);
  const submitErrorEl = document.getElementById(opts.submitErrorId);
  const recordBtn = document.getElementById(opts.recordBtnId);

  if (!dataEl || !searchInput || !quantityInput || !addBtn) return;

  const medicines = JSON.parse(dataEl.textContent || '[]');
  const cart = [];
  let selectedMedicine = null;

  function hideAddError() {
    if (addErrorEl) addErrorEl.style.display = 'none';
  }
  function showAddError(msg) {
    if (!addErrorEl) return;
    addErrorEl.textContent = msg;
    addErrorEl.style.display = '';
  }

  wireMedicineSearch({
    searchInput, suggestionsBox, quantityInput, medicines,
    onSelect: (m) => { selectedMedicine = m; hideAddError(); }
  });

  // ── Add to List ────────────────────────────────────────────
  function addToCart() {
    hideAddError();

    if (!selectedMedicine) {
      showAddError('Please select a medicine from the suggestions.');
      return;
    }
    const qty = Number(quantityInput.value);
    if (!qty || qty <= 0) {
      showAddError('Please enter a valid quantity.');
      return;
    }
    if (qty > selectedMedicine.stock_quantity) {
      showAddError(`Only ${selectedMedicine.stock_quantity} units in stock — can't add ${qty}.`);
      return;
    }

    cart.push({
      medicine_id: selectedMedicine.medicine_id,
      medicine_name: selectedMedicine.medicine_name,
      unit_price: Number(selectedMedicine.unit_price),
      quantity: qty
    });

    searchInput.value = '';
    quantityInput.value = '';
    quantityInput.removeAttribute('max');
    quantityInput.placeholder = 'Enter quantity';
    selectedMedicine = null;
    renderCart();
    searchInput.focus();
  }

  addBtn.addEventListener('click', addToCart);
  quantityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addToCart(); }
  });

  // ── Cart table ─────────────────────────────────────────────
  function renderCart() {
    if (cart.length === 0) {
      cartSection.style.display = 'none';
      return;
    }
    cartSection.style.display = '';

    cartBody.innerHTML = cart.map((item, i) => {
      const subtotal = item.unit_price * item.quantity;
      return `
        <tr>
          <td class="medicine-name">${escapeHtml(item.medicine_name)}</td>
          <td>${item.quantity}</td>
          <td>${formatMoney(item.unit_price)}</td>
          <td>${formatMoney(subtotal)}</td>
          <td>
            <button type="button" class="icon-btn cart-remove-btn" data-index="${i}" title="Remove">
              <i data-lucide="x" class="ic"></i>
            </button>
          </td>
        </tr>`;
    }).join('');

    const total = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    cartTotalEl.textContent = formatMoney(total);

    if (window.lucide) lucide.createIcons();

    cartBody.querySelectorAll('.cart-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        cart.splice(Number(btn.dataset.index), 1);
        renderCart();
      });
    });
  }

  // ── Record Sale: one POST per cart item, stops on first failure ────
  if (recordBtn) {
    recordBtn.addEventListener('click', async () => {
      if (cart.length === 0) return;

      // Clicking Record Sale always empties "Items to Record" right away —
      // take a snapshot to submit from, then clear the visible cart.
      const itemsToSubmit = cart.slice();
      cart.length = 0;
      renderCart();

      submitErrorEl.style.display = 'none';
      recordBtn.disabled = true;
      recordBtn.textContent = 'Recording...';

      for (const item of itemsToSubmit) {
        try {
          const res = await fetch(opts.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ medicine_id: item.medicine_id, quantity: item.quantity })
          });

          if (!res.ok) {
            throw new Error(`Server error (${res.status}).`);
          }

          // The route re-renders the page inline with a #pageErrorAlert
          // banner on failure (still a 200 response) rather than a non-2xx
          // status — checked by ID, not class, since the cart's own hidden
          // error placeholders share the .alert--error class and are
          // always present in the DOM.
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const errorBanner = doc.querySelector('#pageErrorAlert');
          if (errorBanner) {
            throw new Error(errorBanner.textContent.trim());
          }
        } catch (err) {
          submitErrorEl.textContent = `Could not record "${item.medicine_name}": ${err.message} Remaining items were not submitted.`;
          submitErrorEl.style.display = '';
          recordBtn.disabled = false;
          recordBtn.textContent = 'Record Sale';
          return;
        }
      }

      window.location.reload();
    });
  }
}

// Cart-style entry for the Disposal tab — identical search/queue pattern to
// the Sale cart, but with one shared Reason field applied to every item in
// the batch instead of per-item pricing.
function wireDisposalCart(opts) {
  const dataEl = document.getElementById(opts.dataElId);
  const searchInput = document.getElementById(opts.searchInputId);
  const suggestionsBox = document.getElementById(opts.suggestionsId);
  const quantityInput = document.getElementById(opts.quantityInputId);
  const addBtn = document.getElementById(opts.addBtnId);
  const addErrorEl = document.getElementById(opts.addErrorId);
  const cartSection = document.getElementById(opts.cartSectionId);
  const cartBody = document.getElementById(opts.cartBodyId);
  const reasonInput = document.getElementById(opts.reasonInputId);
  const submitErrorEl = document.getElementById(opts.submitErrorId);
  const recordBtn = document.getElementById(opts.recordBtnId);

  if (!dataEl || !searchInput || !quantityInput || !addBtn) return;

  const medicines = JSON.parse(dataEl.textContent || '[]');
  const cart = [];
  let selectedMedicine = null;

  function hideAddError() {
    if (addErrorEl) addErrorEl.style.display = 'none';
  }
  function showAddError(msg) {
    if (!addErrorEl) return;
    addErrorEl.textContent = msg;
    addErrorEl.style.display = '';
  }

  wireMedicineSearch({
    searchInput, suggestionsBox, quantityInput, medicines,
    onSelect: (m) => { selectedMedicine = m; hideAddError(); }
  });

  // ── Add to List ────────────────────────────────────────────
  function addToCart() {
    hideAddError();

    if (!selectedMedicine) {
      showAddError('Please select a medicine from the suggestions.');
      return;
    }
    const qty = Number(quantityInput.value);
    if (!qty || qty <= 0) {
      showAddError('Please enter a valid quantity.');
      return;
    }
    if (qty > selectedMedicine.stock_quantity) {
      showAddError(`Only ${selectedMedicine.stock_quantity} units in stock — can't add ${qty}.`);
      return;
    }

    cart.push({
      medicine_id: selectedMedicine.medicine_id,
      medicine_name: selectedMedicine.medicine_name,
      quantity: qty
    });

    searchInput.value = '';
    quantityInput.value = '';
    quantityInput.removeAttribute('max');
    quantityInput.placeholder = 'Enter quantity';
    selectedMedicine = null;
    renderCart();
    searchInput.focus();
  }

  addBtn.addEventListener('click', addToCart);
  quantityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addToCart(); }
  });

  // ── Cart table ─────────────────────────────────────────────
  function renderCart() {
    if (cart.length === 0) {
      cartSection.style.display = 'none';
      return;
    }
    cartSection.style.display = '';

    cartBody.innerHTML = cart.map((item, i) => `
      <tr>
        <td class="medicine-name">${escapeHtml(item.medicine_name)}</td>
        <td>${item.quantity}</td>
        <td>
          <button type="button" class="icon-btn cart-remove-btn" data-index="${i}" title="Remove">
            <i data-lucide="x" class="ic"></i>
          </button>
        </td>
      </tr>`).join('');

    if (window.lucide) lucide.createIcons();

    cartBody.querySelectorAll('.cart-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        cart.splice(Number(btn.dataset.index), 1);
        renderCart();
      });
    });
  }

  // ── Record Disposal: one POST per cart item, stops on first failure ──
  if (recordBtn) {
    recordBtn.addEventListener('click', async () => {
      if (cart.length === 0) return;

      const reason = (reasonInput.value || '').trim();
      if (!reason) {
        submitErrorEl.textContent = 'Please enter a reason before recording these disposals.';
        submitErrorEl.style.display = '';
        return;
      }

      // Clicking Record Disposal always empties "Items to Record" right
      // away — take a snapshot to submit from, then clear the visible cart.
      const itemsToSubmit = cart.slice();
      cart.length = 0;
      renderCart();

      submitErrorEl.style.display = 'none';
      recordBtn.disabled = true;
      recordBtn.textContent = 'Recording...';

      for (const item of itemsToSubmit) {
        try {
          const res = await fetch(opts.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ medicine_id: item.medicine_id, quantity: item.quantity, disposal_reason: reason })
          });

          if (!res.ok) {
            throw new Error(`Server error (${res.status}).`);
          }

          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const errorBanner = doc.querySelector('#pageErrorAlert');
          if (errorBanner) {
            throw new Error(errorBanner.textContent.trim());
          }
        } catch (err) {
          submitErrorEl.textContent = `Could not record "${item.medicine_name}": ${err.message} Remaining items were not submitted.`;
          submitErrorEl.style.display = '';
          recordBtn.disabled = false;
          recordBtn.textContent = 'Record Disposal';
          return;
        }
      }

      window.location.reload();
    });
  }
}
