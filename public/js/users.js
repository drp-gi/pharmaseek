document.addEventListener('DOMContentLoaded', () => {
  // ── Add User modal ──────────────────────────────────────
  const overlay   = document.getElementById('addUserOverlay');
  const openBtn   = document.getElementById('openAddUser');
  const closeBtn  = document.getElementById('closeAddUser');
  const cancelBtn = document.getElementById('cancelAddUser');

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
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeModal();
    if (editOverlay) closeEditModal();
  });

  // Reopen the modal automatically if the form was re-rendered with an error
  if (overlay && overlay.dataset.reopen === 'true') openModal();

  // ── Status switch helper, shared by the Add and Edit modals ─
  // Admin accounts are always Active, so selecting "Admin" locks
  // the switch on and disables it (mirrors the row toggle rule).
  function wireStatusSwitch(toggleEl, inputEl, labelEl, positionSelectEl) {
    function setStatus(value) {
      inputEl.value = value;
      labelEl.textContent = value;
      toggleEl.classList.toggle('switch__toggle--on', value === 'Active');
    }

    function applyPositionLock() {
      const isAdmin = positionSelectEl.value === 'Admin';
      toggleEl.disabled = isAdmin;
      toggleEl.classList.toggle('switch__toggle--locked', isAdmin);
      if (isAdmin) setStatus('Active');
    }

    toggleEl.addEventListener('click', () => {
      if (toggleEl.disabled) return;
      setStatus(inputEl.value === 'Active' ? 'Inactive' : 'Active');
    });

    positionSelectEl.addEventListener('change', applyPositionLock);

    return { setStatus, applyPositionLock };
  }

  const addStatusSwitch = wireStatusSwitch(
    document.getElementById('switchToggle'),
    document.getElementById('statusInput'),
    document.getElementById('switchLabel'),
    document.getElementById('position')
  );

  // ── Edit User modal ──────────────────────────────────────
  const editOverlay   = document.getElementById('editUserOverlay');
  const editForm      = document.getElementById('editUserForm');
  const closeEditBtn  = document.getElementById('closeEditUser');
  const cancelEditBtn = document.getElementById('cancelEditUser');

  const openEditModal  = () => editOverlay.classList.add('is-open');
  const closeEditModal = () => editOverlay.classList.remove('is-open');

  const editStatusSwitch = wireStatusSwitch(
    document.getElementById('editSwitchToggle'),
    document.getElementById('editStatusInput'),
    document.getElementById('editSwitchLabel'),
    document.getElementById('edit_position')
  );

  const editPositionSelect = document.getElementById('edit_position');
  const editRoleField      = document.getElementById('editRoleField');

  document.querySelectorAll('.edit-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      editForm.action = '/admin/users/' + btn.dataset.id;
      document.getElementById('edit_first_name').value = btn.dataset.firstName;
      document.getElementById('edit_last_name').value = btn.dataset.lastName;
      document.getElementById('edit_username').value = btn.dataset.username;
      document.getElementById('edit_email').value = btn.dataset.email;
      editPositionSelect.value = btn.dataset.position;
      editStatusSwitch.setStatus(btn.dataset.status === 'Inactive' ? 'Inactive' : 'Active');
      editStatusSwitch.applyPositionLock();

      const roleLocked = btn.dataset.roleLocked === 'true';
      editPositionSelect.disabled = roleLocked;
      if (roleLocked) {
        editRoleField.setAttribute('data-tooltip', btn.dataset.lockReason);
      } else {
        editRoleField.removeAttribute('data-tooltip');
      }

      openEditModal();
    });
  });

  if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModal);
  if (editOverlay) {
    editOverlay.addEventListener('click', (e) => {
      if (e.target === editOverlay) closeEditModal();
    });
    if (editOverlay.dataset.reopen === 'true') openEditModal();
  }

  // ── Tabs, search, pagination over the users table ───────
  const rows       = Array.from(document.querySelectorAll('.user-row'));
  const tabs       = Array.from(document.querySelectorAll('.tab'));
  const searchBox  = document.getElementById('userSearch');
  const pagination = document.getElementById('pagination');
  const tbody      = document.querySelector('#usersTable tbody');
  const emptyRow   = tbody ? tbody.querySelector('.empty-row') : null;
  const PAGE_SIZE  = 6;

  let activeRole  = 'All';
  let currentPage = 1;

  function getFiltered() {
    const query = (searchBox.value || '').trim().toLowerCase();
    return rows.filter((row) => {
      const matchesRole  = activeRole === 'All' || row.dataset.role === activeRole;
      const matchesQuery = !query || row.dataset.name.includes(query);
      return matchesRole && matchesQuery;
    });
  }

  function render() {
    const filtered   = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);

    rows.forEach((row) => { row.style.display = 'none'; });

    const start    = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);
    pageRows.forEach((row) => { row.style.display = ''; });

    if (emptyRow) emptyRow.style.display = filtered.length === 0 ? '' : 'none';

    renderPagination(pageRows.length, filtered.length, totalPages);
  }

  function renderPagination(shownCount, totalCount, totalPages) {
    if (!pagination) return;
    pagination.innerHTML = '';

    const summary = document.createElement('span');
    summary.className = 'pagination__summary';
    summary.textContent = `Showing ${shownCount} of ${totalCount} users`;
    pagination.appendChild(summary);

    const nav = document.createElement('div');
    nav.className = 'pagination__nav';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'page-btn page-btn--nav';
    prevBtn.innerHTML = '<i data-lucide="chevron-left" class="ic"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => { currentPage--; render(); });
    nav.appendChild(prevBtn);

    for (let p = 1; p <= totalPages; p++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'page-btn' + (p === currentPage ? ' page-btn--active' : '');
      btn.textContent = p;
      btn.addEventListener('click', () => { currentPage = p; render(); });
      nav.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'page-btn page-btn--nav';
    nextBtn.innerHTML = '<i data-lucide="chevron-right" class="ic"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => { currentPage++; render(); });
    nav.appendChild(nextBtn);

    pagination.appendChild(nav);

    if (window.lucide) lucide.createIcons();
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeRole = tab.dataset.role;
      currentPage = 1;
      render();
    });
  });

  if (searchBox) {
    searchBox.addEventListener('input', () => {
      currentPage = 1;
      render();
    });
  }

  if (rows.length) render();
});
