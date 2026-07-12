document.addEventListener('DOMContentLoaded', () => {
  const overlay   = document.getElementById('newRequestOverlay');
  const openBtn   = document.getElementById('openNewRequest');
  const closeBtn  = document.getElementById('closeNewRequest');
  const cancelBtn = document.getElementById('cancelNewRequest');

  const openModal  = () => overlay.classList.add('is-open');
  const closeModal = () => overlay.classList.remove('is-open');

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
  // ── Dismiss confirmation modal ───────────────────────────
  const dismissOverlay    = document.getElementById('dismissOverlay');
  const dismissMedicine   = document.getElementById('dismissMedicine');
  const dismissQuantity   = document.getElementById('dismissQuantity');
  const dismissDate       = document.getElementById('dismissDate');
  const confirmDismissBtn = document.getElementById('confirmDismiss');
  const cancelDismissBtn  = document.getElementById('cancelDismiss');
  const closeDismissBtn   = document.getElementById('closeDismissModal');

  let targetDismissFormId = null;

  function openDismissModal(trigger) {
    dismissMedicine.textContent = trigger.dataset.medicine;
    dismissQuantity.textContent = trigger.dataset.quantity;
    dismissDate.textContent = trigger.dataset.date;
    targetDismissFormId = trigger.dataset.formId;
    dismissOverlay.classList.add('is-open');
  }
  function closeDismissModal() {
    dismissOverlay.classList.remove('is-open');
    targetDismissFormId = null;
  }

  document.querySelectorAll('[data-dismiss-trigger]').forEach((btn) => {
    btn.addEventListener('click', () => openDismissModal(btn));
  });

  if (confirmDismissBtn) {
    confirmDismissBtn.addEventListener('click', () => {
      const form = targetDismissFormId && document.getElementById(targetDismissFormId);
      if (form) form.submit();
    });
  }
  if (cancelDismissBtn) cancelDismissBtn.addEventListener('click', closeDismissModal);
  if (closeDismissBtn) closeDismissBtn.addEventListener('click', closeDismissModal);
  if (dismissOverlay) {
    dismissOverlay.addEventListener('click', (e) => {
      if (e.target === dismissOverlay) closeDismissModal();
    });
  }

  // ── Confirm Delivery modal ───────────────────────────────
  const confirmDeliveryOverlay      = document.getElementById('confirmDeliveryOverlay');
  const confirmDeliveryForm         = document.getElementById('confirmDeliveryForm');
  const confirmDeliveryTitle        = document.getElementById('confirmDeliveryTitle');
  const confirmDeliveryRequestedQty = document.getElementById('confirmDeliveryRequestedQty');
  const confirmDeliveryReturnTo     = document.getElementById('confirmDeliveryReturnTo');
  const quantityReceivedInput       = document.getElementById('quantity_received');
  const deliveryNotesInput          = document.getElementById('delivery_notes');
  const closeConfirmDeliveryBtn     = document.getElementById('closeConfirmDelivery');
  const cancelConfirmDeliveryBtn    = document.getElementById('cancelConfirmDelivery');

  function openConfirmDeliveryModal(trigger) {
    confirmDeliveryTitle.textContent = 'Confirm Delivery — ' + trigger.dataset.medicine;
    confirmDeliveryRequestedQty.textContent = trigger.dataset.requestedQty;
    confirmDeliveryForm.action = '/pharmacist/restock-requests/' + trigger.dataset.requestId + '/confirm-delivery';
    confirmDeliveryReturnTo.value = window.location.pathname + window.location.search;
    quantityReceivedInput.value = '';
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
  if (confirmDeliveryOverlay) {
    confirmDeliveryOverlay.addEventListener('click', (e) => {
      if (e.target === confirmDeliveryOverlay) closeConfirmDeliveryModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeModal();
    closeDismissModal();
    closeConfirmDeliveryModal();
  });

  // Reopen automatically if the form was re-rendered with a validation error
  if (overlay && overlay.dataset.reopen === 'true') openModal();

  // ── Suggested quantity, New Request modal ────────────────
  // suggested_quantity = (stock_threshold * 2) - current_stock_quantity
  // Pre-fills Quantity Requested when a medicine is chosen; the
  // Pharmacist can still edit it before submitting.
  const medicineSelect = document.getElementById('medicine_id');
  const quantityInput  = document.getElementById('quantity_requested');

  if (medicineSelect && quantityInput) {
    medicineSelect.addEventListener('change', () => {
      const option = medicineSelect.options[medicineSelect.selectedIndex];
      const stock = Number(option.dataset.stock);
      const threshold = Number(option.dataset.threshold);
      if (!option.value || Number.isNaN(stock) || Number.isNaN(threshold)) return;

      const suggested = Math.max(0, (threshold * 2) - stock);
      quantityInput.value = suggested;
    });
  }
});
