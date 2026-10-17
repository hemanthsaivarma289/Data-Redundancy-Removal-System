const $ = (selector) => document.querySelector(selector);
const recordDialog = $('#record-dialog');
let toastTimer;

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.style.background = isError ? '#a83232' : '#20283a';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3300);
}
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}
async function loadStats() {
  const stats = await api('/api/stats');
  $('#total-count').textContent = stats.total;
  $('#group-count').textContent = stats.duplicateGroups;
  $('#duplicate-count').textContent = stats.extraDuplicates;
  $('#unique-count').textContent = stats.uniqueAfterCleanup;
}
async function loadRecords() {
  const search = $('#search-input').value.trim();
  const items = await api(`/api/records?search=${encodeURIComponent(search)}`);
  $('#record-total').textContent = `${items.length} record${items.length === 1 ? '' : 's'}${items.length === 500 ? ' (showing latest 500)' : ''}`;
  const body = $('#records-body');
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">No records found. Add a record or import a CSV file.</td></tr>';
    return;
  }
  body.innerHTML = items.map(item => `<tr>
    <td>${safe(item.name)}</td><td>${safe(item.email || '—')}</td><td>${safe(item.phone || '—')}</td><td>${safe(item.department || '—')}</td><td>${safe(formatDate(item.createdAt))}</td>
    <td><button class="delete-row" data-delete="${safe(item._id)}">Delete</button></td></tr>`).join('');
}
async function loadDuplicates() {
  const groups = await api('/api/duplicates');
  const container = $('#duplicate-content');
  if (!groups.length) {
    container.innerHTML = '<div class="empty">✓ No duplicate groups found. Your records look clean.</div>';
    $('#clean-button').disabled = true;
    $('#clean-button').style.opacity = '.55';
    return;
  }
  $('#clean-button').disabled = false;
  $('#clean-button').style.opacity = '1';
  container.innerHTML = groups.map((group, index) => {
    const keyText = group.key.startsWith('email:') ? group.key.slice(6) : group.key.slice(11).replace('|', ' + ');
    return `<div class="duplicate-group"><div class="duplicate-title"><div>Duplicate group ${index + 1}<br><small>${safe(keyText)}</small></div><span class="count-pill">${group.count} matching records</span></div>
      <div class="duplicate-record"><div><strong>${safe(group.keep.name)}</strong><small>${safe(group.keep.email || group.keep.phone || 'No email or phone')} · Added ${safe(formatDate(group.keep.createdAt))}</small></div><span class="keep-label">✓ Keep oldest</span></div>
      ${group.duplicates.map(item => `<div class="duplicate-record"><div><strong>${safe(item.name)}</strong><small>${safe(item.email || item.phone || 'No email or phone')} · Added ${safe(formatDate(item.createdAt))}</small></div><span class="count-pill">Extra copy</span></div>`).join('')}
    </div>`;
  }).join('');
}
async function refreshAll() {
  try {
    await Promise.all([loadStats(), loadRecords(), loadDuplicates()]);
    $('#db-status').textContent = 'Connected';
    $('.status-dot').style.background = '#29b77c';
  } catch (error) {
    $('#db-status').textContent = 'Connection problem';
    $('.status-dot').style.background = '#e35d5d';
    showToast(error.message, true);
  }
}
$('#top-add').addEventListener('click', () => recordDialog.showModal());
$('#close-dialog').addEventListener('click', () => recordDialog.close());
$('#cancel-dialog').addEventListener('click', () => recordDialog.close());
$('#refresh-button').addEventListener('click', refreshAll);
let searchTimer;
$('#search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadRecords().catch(error => showToast(error.message, true)), 250);
});
$('#csv-file').addEventListener('change', event => {
  $('#file-name').textContent = event.target.files[0]?.name || 'Choose a .csv file';
});
$('#record-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    await api('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    form.reset(); recordDialog.close(); showToast('Record added successfully.'); await refreshAll();
  } catch (error) { showToast(error.message, true); }
});
$('#import-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = $('#csv-file').files[0];
  if (!file) return showToast('Choose a CSV file first.', true);
  const formData = new FormData(); formData.append('file', file);
  try {
    const result = await api('/api/records/import', { method: 'POST', body: formData });
    showToast(result.message); event.currentTarget.reset(); $('#file-name').textContent = 'Choose a .csv file'; await refreshAll();
  } catch (error) { showToast(error.message, true); }
});
$('#records-body').addEventListener('click', async event => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  if (!confirm('Delete this record permanently?')) return;
  try { await api(`/api/records/${button.dataset.delete}`, { method: 'DELETE' }); showToast('Record deleted.'); await refreshAll(); }
  catch (error) { showToast(error.message, true); }
});
$('#clean-button').addEventListener('click', async () => {
  const count = Number($('#duplicate-count').textContent || 0);
  if (!count) return showToast('No duplicates to remove.');
  if (!confirm(`Remove ${count} extra duplicate record(s)? The oldest record in each group will be kept. This cannot be undone.`)) return;
  try {
    const result = await api('/api/duplicates', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    showToast(result.message); await refreshAll();
  } catch (error) { showToast(error.message, true); }
});
refreshAll();
