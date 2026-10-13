import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data', 'records.json');
const app = express();
const port = process.env.PORT || 3000;

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
}

function readRecords() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
}

function normalizeDateInput(value) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toDateKey(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
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
    if (fromDate && date < new Date(fromDate + 'T00:00:00')) return false;
    if (toDate && date > new Date(toDate + 'T23:59:59')) return false;
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

app.get('/api/records', (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  let records = [...readRecords()].sort((a, b) => new Date(b.observedAt) - new Date(a.observedAt));

  if (from) {
    records = records.filter((item) => new Date(item.observedAt) >= new Date(`${from}T00:00:00`));
  }

  if (to) {
    records = records.filter((item) => new Date(item.observedAt) <= new Date(`${to}T23:59:59`));
  }

  res.json({ ok: true, data: records });
});

app.post('/api/records', (req, res) => {
  const { type, observedAt, note } = req.body ?? {};
  const allowedTypes = ['entrada', 'saida', 'pausa'];

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ ok: false, message: 'Tipo de ponto inválido.' });
  }

  const itemDate = normalizeDateInput(observedAt);
  const record = {
    id: crypto.randomUUID(),
    type,
    observedAt: new Date(itemDate).toISOString(),
    note: typeof note === 'string' ? note.trim() : '',
    createdAt: new Date().toISOString(),
  };

  const records = readRecords();
  records.push(record);
  writeRecords(records);

  return res.status(201).json({ ok: true, data: record });
});

app.get('/api/summary', (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const records = readRecords();
  const summary = buildSummary(records, from || null, to || null);
  res.json({ ok: true, data: summary });
});

app.delete('/api/records/:id', (req, res) => {
  const { id } = req.params;
  const records = readRecords();
  const index = records.findIndex((item) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ ok: false, message: 'Registro não encontrado.' });
  }

  const [removed] = records.splice(index, 1);
  writeRecords(records);
  return res.json({ ok: true, data: removed });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Registro de pontos rodando em http://localhost:${port}`);
});
