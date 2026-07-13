document.addEventListener('DOMContentLoaded', () => {
  const overlay      = document.getElementById('logDetailOverlay');
  const closeBtn      = document.getElementById('closeLogDetail');
  const closeBtnFooter = document.getElementById('closeLogDetailBtn');

  const openModal  = () => overlay.classList.add('is-open');
  const closeModal = () => overlay.classList.remove('is-open');

  function openLogDetail(row) {
    const d = row.dataset;

    document.getElementById('logDetailDate').textContent = d.date;
    document.getElementById('logDetailMedicine').textContent = d.medicine || '—';
    document.getElementById('logDetailFindings').textContent = d.findings || '—';
    document.getElementById('logDetailAction').textContent = d.action || '—';

    document.getElementById('logDetailFiledBy').innerHTML =
      '<div class="log-avatar log-avatar--' + d.filerColor + '">' + d.filerInitial + '</div>' + d.filerName;

    openModal();
  }

  document.querySelectorAll('[data-log-trigger]').forEach((row) => {
    row.addEventListener('click', () => openLogDetail(row));
  });

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (closeBtnFooter) closeBtnFooter.addEventListener('click', closeModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});
