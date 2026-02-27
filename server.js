// server.js — National CDA Training Certificate Generator
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer — CSV uploads stored in memory
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── API ROUTES ────────────────────────────────────────────────

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// All students
app.get('/api/students', async (req, res) => {
  try {
    const q = req.query.q || '';
    const students = q ? await db.searchStudents(q) : await db.getAllStudents();
    res.json(students);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Single student + their certificates
app.get('/api/students/:id', async (req, res) => {
  try {
    const student = await db.getStudent(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const certs   = await db.getStudentCertificates(req.params.id);
    const history = await db.getStudentHistory(req.params.id);
    res.json({ ...student, certificates: certs, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save a generated package record
app.post('/api/packages', async (req, res) => {
  try {
    const result = await db.saveStudentPackage(req.body);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('Save error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Delete student
app.delete('/api/students/:id', async (req, res) => {
  try {
    await db.deleteStudent(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve assets (signature, logo) as base64 for the frontend
app.get('/api/assets', (req, res) => {
  try {
    const assetsDir = path.join(__dirname, 'assets');
    const sig  = fs.readFileSync(path.join(assetsDir, 'signature.jpeg'));
    const logo = fs.readFileSync(path.join(assetsDir, 'logo.png'));
    res.json({
      signature: 'data:image/jpeg;base64,' + sig.toString('base64'),
      logo:      'data:image/png;base64,'  + logo.toString('base64'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check (Render uses this)
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Catch-all — serve the frontend app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────
async function start() {
  await db.initDB();
  app.listen(PORT, () => {
    console.log(`🎓 National CDA Training Generator running on port ${PORT}`);
  });
}

start().catch(console.error);
