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

async function fetchRecords() {
  const params = new URLSearchParams();
  if (fromDate.value) params.set('from', fromDate.value);
  if (toDate.value) params.set('to', toDate.value);

  const response = await fetch(`/api/records?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || 'Erro ao buscar registros.');
  }

  return payload.data || [];
}

async function fetchSummary() {
  const params = new URLSearchParams();
  if (fromDate.value) params.set('from', fromDate.value);
  if (toDate.value) params.set('to', toDate.value);

  const response = await fetch(`/api/summary?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || 'Erro ao buscar resumo.');
  }

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
          <td><span class="badge ${record.type}">${typeLabels[record.type] || record.type}</span></td>
          <td>${formatDateTime(record.observedAt)}</td>
          <td>${record.note || '-'}</td>
          <td>
            <button class="secondary delete-btn" data-id="${record.id}">Excluir</button>
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
  const response = await fetch(`/api/records/${id}`, { method: 'DELETE' });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    alert(payload.message || 'Erro ao excluir registro.');
    return;
  }

  await loadData();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    type: formData.get('type'),
    observedAt: formData.get('observedAt') || new Date().toISOString(),
    note: formData.get('note') || '',
  };

  const response = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    alert(result.message || 'Erro ao registrar ponto.');
    return;
  }

  form.reset();
  document.getElementById('observedAt').value = new Date().toISOString().slice(0, 16);
  await loadData();
});

applyFilterBtn.addEventListener('click', loadData);

window.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  fromDate.value = firstDay;
  toDate.value = lastDay;
  document.getElementById('observedAt').value = new Date().toISOString().slice(0, 16);
  loadData();
});
