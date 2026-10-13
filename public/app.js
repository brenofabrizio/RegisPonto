const form = document.getElementById('point-form');
const recordsTable = document.getElementById('recordsTable');
const summaryTable = document.getElementById('summaryTable');
const fromDate = document.getElementById('fromDate');
const toDate = document.getElementById('toDate');
const applyFilterBtn = document.getElementById('applyFilter');

const statDays = document.getElementById('stat-days');
const statHours = document.getElementById('stat-hours');
const statLast = document.getElementById('stat-last');

const typeLabels = {
  entrada: 'Entrada',
  saida: 'Saída',
  pausa: 'Pausa',
};

const formatDateTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const formatDate = (iso) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(year, month - 1, day));
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
};

const formatMinutes = (minutes) => {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours}h ${mins}m`;
};

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

async function readApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(response.ok ? fallbackMessage : `Servidor retornou erro HTTP ${response.status}.`);
  }
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || `Erro HTTP ${response.status}.`);
  }
  return payload;
}

async function fetchRecords() {
  const params = new URLSearchParams();
  if (fromDate.value) params.set('from', fromDate.value);
  if (toDate.value) params.set('to', toDate.value);

  const response = await fetch(`/api/records?${params.toString()}`);
  const payload = await readApiResponse(response, 'Resposta inválida ao buscar registros.');

  return payload.data || [];
}

async function fetchSummary() {
  const params = new URLSearchParams();
  if (fromDate.value) params.set('from', fromDate.value);
  if (toDate.value) params.set('to', toDate.value);

  const response = await fetch(`/api/summary?${params.toString()}`);
  const payload = await readApiResponse(response, 'Resposta inválida ao buscar resumo.');

  return payload.data || { totalDays: 0, totalHours: '0h 0m', entries: [] };
}

function renderSummary(summary) {
  const rows = summary.entries || [];

  if (!rows.length) {
    summaryTable.innerHTML = '<p class="empty">Nenhum dia com registros no período.</p>';
    return;
  }

  const html = `
    <table class="table">
      <thead>
        <tr>
          <th>Dia</th>
          <th>Horas</th>
          <th>Registros</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
            <tr>
              <td>${formatDate(row.date)}</td>
              <td>${row.workLabel}</td>
              <td>${row.records}</td>
              <td>${row.status}</td>
            </tr>
          `
          )
          .join('')}
      </tbody>
    </table>
  `;

  summaryTable.innerHTML = html;
}

function renderRecords(records) {
  if (!records.length) {
    recordsTable.innerHTML = '<p class="empty">Nenhum ponto registrado.</p>';
    return;
  }

  const rows = records
    .map(
      (record) => `
        <tr>
          <td><span class="badge ${escapeHTML(record.type)}">${escapeHTML(typeLabels[record.type] || record.type)}</span></td>
          <td>${formatDateTime(record.observedAt)}</td>
          <td>${escapeHTML(record.note || '-')}</td>
          <td>
            <button class="secondary delete-btn" data-id="${escapeHTML(record.id)}">Excluir</button>
          </td>
        </tr>
      `
    )
    .join('');

  recordsTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Data/Hora</th>
          <th>Observação</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  recordsTable.querySelectorAll('.delete-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      await deleteRecord(id);
    });
  });
}

function renderStats(summary, records) {
  statDays.textContent = String(summary.totalDays ?? 0);
  statHours.textContent = summary.totalHours || '0h 0m';
  statLast.textContent = records.length ? formatDateTime(records[0].observedAt) : '-';
}

async function loadData() {
  try {
    const [records, summary] = await Promise.all([fetchRecords(), fetchSummary()]);
    renderSummary(summary);
    renderRecords(records);
    renderStats(summary, records);
  } catch (error) {
    recordsTable.innerHTML = `<p class="empty">${error.message}</p>`;
    summaryTable.innerHTML = '<p class="empty">Não foi possível carregar o resumo.</p>';
  }
}

async function deleteRecord(id) {
  try {
    const response = await fetch(`/api/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await readApiResponse(response, 'Resposta inválida ao excluir registro.');
    await loadData();
  } catch (error) {
    alert(error.message || 'Erro ao excluir registro.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    type: formData.get('type'),
    observedAt: formData.get('observedAt') ? new Date(formData.get('observedAt')).toISOString() : new Date().toISOString(),
    note: formData.get('note') || '',
  };

  try {
    const response = await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await readApiResponse(response, 'Resposta inválida ao registrar ponto.');
    form.reset();
    setCurrentDateTime();
    await loadData();
  } catch (error) {
    alert(error.message || 'Erro ao registrar ponto.');
  }
});

applyFilterBtn.addEventListener('click', loadData);

window.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const toLocalDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const firstDay = toLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastDay = toLocalDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  fromDate.value = firstDay;
  toDate.value = lastDay;
  setCurrentDateTime();
  loadData();
});

function setCurrentDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  document.getElementById('observedAt').value = local.toISOString().slice(0, 16);
}
