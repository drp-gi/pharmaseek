document.addEventListener('DOMContentLoaded', () => {
  // Keeps a quantity input's max in sync with the selected medicine's
  // current stock, so the browser blocks an over-sell/over-dispose before
  // it ever reaches the server (the server still enforces this too).
  function wireStockLimit(selectId, quantityId) {
    const select  = document.getElementById(selectId);
    const quantity = document.getElementById(quantityId);
    if (!select || !quantity) return;

    select.addEventListener('change', () => {
      const option = select.options[select.selectedIndex];
      const stock = option ? option.dataset.stock : null;
      if (stock) {
        quantity.max = stock;
        quantity.placeholder = `Max ${stock}`;
      } else {
        quantity.removeAttribute('max');
        quantity.placeholder = '0';
      }
    });
  }

  wireStockLimit('sale_medicine_id', 'sale_quantity');
  wireStockLimit('disposal_medicine_id', 'disposal_quantity');

  // ── Confirm Delivery modal (Delivery Check-in tab) ───────
  const confirmDeliveryOverlay      = document.getElementById('confirmDeliveryOverlay');
  const confirmDeliveryForm         = document.getElementById('confirmDeliveryForm');
  const confirmDeliveryTitle        = document.getElementById('confirmDeliveryTitle');
  const confirmDeliveryRequestedQty = document.getElementById('confirmDeliveryRequestedQty');
  const quantityReceivedInput       = document.getElementById('quantity_received');
  const deliveryNotesInput          = document.getElementById('delivery_notes');
  const closeConfirmDeliveryBtn     = document.getElementById('closeConfirmDelivery');
  const cancelConfirmDeliveryBtn    = document.getElementById('cancelConfirmDelivery');

  if (confirmDeliveryOverlay) {
    function openConfirmDeliveryModal(trigger) {
      confirmDeliveryTitle.textContent = 'Confirm Delivery — ' + trigger.dataset.medicine;
      confirmDeliveryRequestedQty.textContent = trigger.dataset.requestedQty;
      confirmDeliveryForm.action = '/staff/transactions/delivery-checkin/' + trigger.dataset.requestId;
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
    confirmDeliveryOverlay.addEventListener('click', (e) => {
      if (e.target === confirmDeliveryOverlay) closeConfirmDeliveryModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeConfirmDeliveryModal();
    });
  }
});
