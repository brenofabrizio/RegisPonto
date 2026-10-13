import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { head, put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data', 'records.json');
const app = express();
const port = process.env.PORT || 3000;
const APP_TIME_ZONE = 'America/Sao_Paulo';

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
}

async function readRecords() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await head('records.json');
      const response = await fetch(blob.downloadUrl);
      if (!response.ok) throw new Error(`Falha ao ler armazenamento (HTTP ${response.status}).`);
      const parsed = await response.json();
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.status === 404 || error.code === 'blob_not_found' || error.name === 'BlobNotFoundError') return [];
      throw error;
    }
  }
  if (process.env.VERCEL) {
    const error = new Error('Armazenamento não configurado. Adicione um Blob Store e a variável BLOB_READ_WRITE_TOKEN na Vercel.');
    error.status = 503;
    throw error;
  }
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRecords(records) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put('records.json', JSON.stringify(records, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    return;
  }
  if (process.env.VERCEL) {
    const error = new Error('Armazenamento não configurado. Adicione um Blob Store e a variável BLOB_READ_WRITE_TOKEN na Vercel.');
    error.status = 503;
    throw error;
  }
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
}

function normalizeDateInput(value) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(date));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateBoundary(date, end = false) {
  const dayAfter = new Date(`${date}T00:00:00Z`);
  if (end) dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  return new Date(`${dayAfter.toISOString().slice(0, 10)}T00:00:00-03:00`).getTime();
}

function formatMinutes(minutes) {
  const totalMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins}m`;
}

function buildSummary(records, fromDate, toDate) {
  const filtered = records.filter((item) => {
    const date = new Date(item.observedAt);
    if (Number.isNaN(date.getTime())) return false;
    if (fromDate && date.getTime() < dateBoundary(fromDate)) return false;
    if (toDate && date.getTime() >= dateBoundary(toDate, true)) return false;
    return true;
  });

  const byDay = new Map();

  filtered.forEach((record) => {
    const dayKey = toDateKey(record.observedAt);
    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, { date: dayKey, totalMinutes: 0, records: [] });
    }

    byDay.get(dayKey).records.push(record);
  });

  const summary = [];
  for (const entry of byDay.values()) {
    const sorted = [...entry.records].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
    let openEntry = null;
    let totalMinutes = 0;

    for (const record of sorted) {
      const ts = new Date(record.observedAt).getTime();
      if (record.type === 'entrada') {
        openEntry = ts;
      }

      if (record.type === 'saida' && openEntry !== null) {
        totalMinutes += (ts - openEntry) / 60000;
        openEntry = null;
      }
    }

    summary.push({
      date: entry.date,
      totalMinutes,
      workLabel: formatMinutes(totalMinutes),
      records: sorted.length,
      lastRecord: sorted.at(-1)?.observedAt ?? null,
      status: openEntry ? 'em aberto' : 'fechado',
    });
  }

  summary.sort((a, b) => a.date.localeCompare(b.date));

  const totalMinutes = summary.reduce((sum, item) => sum + item.totalMinutes, 0);
  return {
    from: fromDate ?? null,
    to: toDate ?? null,
    totalDays: summary.length,
    totalMinutes,
    totalHours: formatMinutes(totalMinutes),
    entries: summary,
  };
}

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Registro de pontos online.', timestamp: new Date().toISOString() });
});

app.get('/api/records', async (req, res, next) => {
 try {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  let records = [...await readRecords()].sort((a, b) => new Date(b.observedAt) - new Date(a.observedAt));

  if (from) {
    records = records.filter((item) => new Date(item.observedAt).getTime() >= dateBoundary(from));
  }

  if (to) {
    records = records.filter((item) => new Date(item.observedAt).getTime() < dateBoundary(to, true));
  }

  res.json({ ok: true, data: records });
 } catch (error) { next(error); }
});

app.post('/api/records', async (req, res, next) => {
 try {
  const { type, observedAt, note } = req.body ?? {};
  const allowedTypes = ['entrada', 'saida', 'pausa'];

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ ok: false, message: 'Tipo de ponto inválido.' });
  }

  if (observedAt && Number.isNaN(new Date(observedAt).getTime())) {
    return res.status(400).json({ ok: false, message: 'Data e hora inválidas.' });
  }
  const itemDate = normalizeDateInput(observedAt);
  const record = {
    id: crypto.randomUUID(),
    type,
    observedAt: new Date(itemDate).toISOString(),
    note: typeof note === 'string' ? note.trim() : '',
    createdAt: new Date().toISOString(),
  };

  const records = await readRecords();
  records.push(record);
  await writeRecords(records);

  return res.status(201).json({ ok: true, data: record });
 } catch (error) { next(error); }
});

app.get('/api/summary', async (req, res, next) => {
 try {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const records = await readRecords();
  const summary = buildSummary(records, from || null, to || null);
  res.json({ ok: true, data: summary });
 } catch (error) { next(error); }
});

app.delete('/api/records/:id', async (req, res, next) => {
 try {
  const { id } = req.params;
  const records = await readRecords();
  const index = records.findIndex((item) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ ok: false, message: 'Registro não encontrado.' });
  }

  const [removed] = records.splice(index, 1);
  await writeRecords(records);
  return res.json({ ok: true, data: removed });
 } catch (error) { next(error); }
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, message: 'Endpoint da API não encontrado.' }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({
    ok: false,
    message: error.status === 503 ? error.message : 'Erro interno ao processar a solicitação.',
  });
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`Registro de pontos rodando em http://localhost:${port}`));
}

export default app;
