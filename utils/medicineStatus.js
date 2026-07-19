// utils/medicineStatus.js
// Classifies a medicine into a single badge, most urgent first: Expired >
// Out of Stock > Expiring Soon (30 days) > Low Stock > In Stock (the
// healthy default). Shared by the Staff and Pharmacist Medicine Catalog
// pages so both badge display and the "Expired / Low Stock / Out of
// Stock" filter agree on the same classification.
const { manilaTodayISO, daysBetween } = require('./manilaTime');

function getStatusBadge(m) {
  const stockQty  = Number(m.stock_quantity);
  const threshold = Number(m.stock_threshold);
  let daysLeft = null;
  let isExpired = false;

  if (m.expiration_date) {
    daysLeft = daysBetween(manilaTodayISO(), m.expiration_date);
    isExpired = daysLeft < 0;
  }

  if (isExpired) return { cls: 'expired', label: 'Expired' };
  if (stockQty === 0) return { cls: 'out-of-stock', label: 'Out of Stock' };
  if (daysLeft !== null && daysLeft <= 30) return { cls: 'expiring', label: 'Expiring Soon' };
  if (stockQty < threshold) return { cls: 'low-stock', label: 'Low Stock' };
  return { cls: 'in-stock', label: 'In Stock' };
}

module.exports = { getStatusBadge };
