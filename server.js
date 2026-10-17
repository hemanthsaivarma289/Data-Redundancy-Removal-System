require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'codealpha_data_cleaner';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
let records;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function cleanText(value) { return String(value ?? '').trim(); }
function normalizedEmail(value) { return cleanText(value).toLowerCase(); }
function normalizedName(value) { return cleanText(value).toLowerCase().replace(/\s+/g, ' '); }
function digits(value) { return cleanText(value).replace(/\D/g, ''); }
function duplicateKey(record) {
  const email = normalizedEmail(record.email);
  if (email) return `email:${email}`;
  const name = normalizedName(record.name);
  const phone = digits(record.phone);
  if (name && phone) return `name-phone:${name}|${phone}`;
  return null;
}
function publicRecord(doc) {
  return { ...doc, _id: String(doc._id), createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt };
}
async function getDuplicateGroups() {
  const all = await records.find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  const groups = new Map();
  for (const doc of all) {
    const key = duplicateKey(doc);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, count: items.length, keep: publicRecord(items[0]), duplicates: items.slice(1).map(publicRecord) }));
}

app.get('/api/health', (req, res) => res.json({ ok: true, database: 'connected' }));

app.get('/api/records', async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    const query = search ? { $or: [
      { name: { $regex: escapeRegex(search), $options: 'i' } },
      { email: { $regex: escapeRegex(search), $options: 'i' } },
      { phone: { $regex: escapeRegex(search), $options: 'i' } },
      { department: { $regex: escapeRegex(search), $options: 'i' } }
    ] } : {};
    const docs = await records.find(query).sort({ createdAt: -1 }).limit(500).toArray();
    res.json(docs.map(publicRecord));
  } catch (err) { next(err); }
});

app.post('/api/records', async (req, res, next) => {
  try {
    const name = cleanText(req.body.name);
    const email = cleanText(req.body.email);
    const phone = cleanText(req.body.phone);
    const department = cleanText(req.body.department);
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const doc = { name, email, phone, department, createdAt: new Date() };
    const result = await records.insertOne(doc);
    res.status(201).json(publicRecord({ ...doc, _id: result.insertedId }));
  } catch (err) { next(err); }
});

app.post('/api/records/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a CSV file first.' });
    const rows = parse(req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
    const docs = rows.map(row => ({
      name: cleanText(row.name || row.Name), email: cleanText(row.email || row.Email),
      phone: cleanText(row.phone || row.Phone), department: cleanText(row.department || row.Department),
      createdAt: new Date()
    })).filter(row => row.name);
    if (!docs.length) return res.status(400).json({ error: 'No valid rows found. CSV needs a name column.' });
    const result = await records.insertMany(docs);
    res.json({ imported: result.insertedCount, message: `Imported ${result.insertedCount} records.` });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'CSV file must be 5 MB or smaller.' });
    next(err);
  }
});

app.get('/api/duplicates', async (req, res, next) => {
  try { res.json(await getDuplicateGroups()); } catch (err) { next(err); }
});

app.delete('/api/duplicates', async (req, res, next) => {
  try {
    if (req.body.confirm !== true) return res.status(400).json({ error: 'Confirmation is required before deleting duplicates.' });
    const groups = await getDuplicateGroups();
    const ids = groups.flatMap(group => group.duplicates.map(doc => new ObjectId(doc._id)));
    if (!ids.length) return res.json({ deleted: 0, message: 'No duplicate records found.' });
    const result = await records.deleteMany({ _id: { $in: ids } });
    res.json({ deleted: result.deletedCount, message: `Removed ${result.deletedCount} duplicate records. The oldest record in each group was kept.` });
  } catch (err) { next(err); }
});

app.delete('/api/records/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid record ID.' });
    const result = await records.deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: 'Record not found.' });
    res.json({ message: 'Record deleted.' });
  } catch (err) { next(err); }
});

app.get('/api/stats', async (req, res, next) => {
  try {
    const total = await records.countDocuments({});
    const groups = await getDuplicateGroups();
    const extraDuplicates = groups.reduce((sum, group) => sum + group.duplicates.length, 0);
    res.json({ total, duplicateGroups: groups.length, extraDuplicates, uniqueAfterCleanup: total - extraDuplicates });
  } catch (err) { next(err); }
});

app.get('/api/sample.csv', (req, res) => {
  res.type('text/csv').attachment('sample-records.csv').send('name,email,phone,department\nAsha Rao,asha@example.com,9876543210,IT\nRavi Kumar,ravi@example.com,9876501234,HR\nAsha Rao,ASHA@example.com,9876543210,IT\n');
});

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error. Check that MongoDB is running and the .env settings are correct.' });
});

async function start() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is missing. Copy .env.example to .env and set MONGODB_URI.');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  records = db.collection('records');
  await records.createIndex({ createdAt: 1 });
  app.listen(PORT, () => console.log(`Data Redundancy Removal app running at http://localhost:${PORT}`));
}
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
