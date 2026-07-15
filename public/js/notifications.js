// Forces a real reload when this page is restored from the browser's
// back/forward cache (e.g. pressing Back after Logout). Modern Chrome will
// bfcache a page even with Cache-Control: no-store, so the server-side
// header alone isn't enough — this is what actually re-triggers the
// isAuthenticated check and bounces back to /login if the session is gone.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload();
});

// Wires the notification bell present in every page's topbar. The role
// (admin/pharmacist/staff) is inferred from the URL prefix, since routes
// are already cleanly split that way — no per-page config needed. The
// dropdown panel itself is built and inserted here rather than in every
// view template, since the bell markup is identical everywhere.
document.addEventListener('DOMContentLoaded', () => {
  const bell = document.querySelector('.bell');
  const main = document.querySelector('.main');
  if (!bell || !main) return;

  const roleMatch = window.location.pathname.match(/^\/(admin|pharmacist|staff)(\/|$)/);
  if (!roleMatch) return;
  const endpoint = '/' + roleMatch[1] + '/notifications';

  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.innerHTML = `
    <div class="notif-panel__header">Notifications</div>
    <div class="notif-panel__list"></div>
  `;
  main.appendChild(panel);
  const listEl = panel.querySelector('.notif-panel__list');
  const dot = bell.querySelector('.dot');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  let current = [];

  function render(notifications) {
    current = notifications;
    if (dot) dot.style.display = notifications.length > 0 ? '' : 'none';

    if (notifications.length === 0) {
      listEl.innerHTML = '<div class="notif-empty">You’re all caught up.</div>';
      return;
    }

    listEl.innerHTML = notifications.map((n, i) => `
      <button type="button" class="notif-item notif-item--${n.type}" data-index="${i}">
        <span class="notif-item__icon"><i data-lucide="${n.icon}" class="ic"></i></span>
        <span class="notif-item__body">
          <span class="notif-item__title">${escapeHtml(n.title)}</span>
          ${n.subtitle ? `<span class="notif-item__subtitle">${escapeHtml(n.subtitle)}</span>` : ''}
          ${n.time ? `<span class="notif-item__time">${timeAgo(n.time)}</span>` : ''}
        </span>
      </button>`).join('');

    if (window.lucide) lucide.createIcons();

    listEl.querySelectorAll('.notif-item').forEach((el) => {
      el.addEventListener('click', () => {
        const n = current[Number(el.dataset.index)];
        if (n && n.link) window.location.href = n.link;
      });
    });
  }

  function load() {
    fetch(endpoint)
      .then((res) => res.json())
      .then((data) => render(data.notifications || []))
      .catch(() => {
        listEl.innerHTML = '<div class="notif-empty">Could not load notifications.</div>';
      });
  }

  load(); // populates the red dot as soon as the page loads

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open');
    if (opening) load();
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !bell.contains(e.target)) {
      panel.classList.remove('is-open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') panel.classList.remove('is-open');
  });
});
