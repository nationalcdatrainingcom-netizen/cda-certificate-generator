// server.js — National CDA Training Certificate Generator
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('./db');
const { sendMagicLink } = require('./email');
const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── PORTAL: Request magic link ────────────────────────────────
app.post('/api/auth/request', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

    const emailLower = email.toLowerCase().trim();
    const students   = await db.findStudentsByEmail(emailLower);

    // Always respond OK — never reveal whether an email exists
    if (!students.length) {
      console.log(`Portal request: no student found for email=${emailLower}`);
      return res.json({ ok: true });
    }

    // Verify name loosely matches at least one record
    const nameLower = name.toLowerCase().trim();
    const matched = students.some(s =>
      s.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(s.name.toLowerCase().split(' ')[0])
    );
    if (!matched) {
      console.log(`Portal request: name mismatch for email=${emailLower}`);
      return res.json({ ok: true });
    }

    const token = await db.createMagicToken(emailLower);
    await sendMagicLink(emailLower, token, students[0].name);

    res.json({ ok: true });
  } catch (e) {
    console.error('Auth request error:', e);
    res.status(500).json({ error: 'Failed to send link. Please try again.' });
  }
});

// ── PORTAL: Verify token → return student data ────────────────
app.get('/api/auth/verify/:token', async (req, res) => {
  try {
    const row = await db.verifyMagicToken(req.params.token);
    if (!row) return res.status(401).json({ error: 'Link expired or already used.' });

    const students = await db.findStudentsByEmail(row.email);
    if (!students.length) return res.status(404).json({ error: 'No records found.' });

    const records = await Promise.all(students.map(async s => {
      const packages = await db.getStudentPackages(s.id);
      const certs    = await db.getStudentCertificates(s.id);
      return { ...s, packages, certificates: certs };
    }));

    res.json({ ok: true, email: row.email, students: records });
  } catch (e) {
    console.error('Verify error:', e);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ── PORTAL: Student downloads their own PDF ───────────────────
app.get('/api/portal/pdf/:packageId', async (req, res) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'Email required' });

    const students = await db.findStudentsByEmail(email);
    if (!students.length) return res.status(403).json({ error: 'Forbidden' });

    const ownerCheck = await db.pool.query(
      'SELECT student_id FROM generated_packages WHERE id = $1',
      [req.params.packageId]
    );
    if (!ownerCheck.rows.length) return res.status(404).json({ error: 'Not found' });

    const studentIds = students.map(s => s.id);
    if (!studentIds.includes(ownerCheck.rows[0].student_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const pkg = await db.getPackagePDF(req.params.packageId);
    if (!pkg || !pkg.pdf_data) return res.status(404).json({ error: 'PDF not stored for this package' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pkg.filename || 'CDA_Package.pdf'}"`);
    res.send(pkg.pdf_data);
  } catch (e) {
    console.error('PDF download error:', e);
    res.status(500).json({ error: 'Download failed.' });
  }
});

// ── ADMIN: View any stored PDF inline ────────────────────────
app.get('/api/packages/:packageId/pdf', async (req, res) => {
  try {
    const pkg = await db.getPackagePDF(req.params.packageId);
    if (!pkg || !pkg.pdf_data) return res.status(404).json({ error: 'PDF not stored' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pkg.filename || 'package.pdf'}"`);
    res.send(pkg.pdf_data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Student portal
app.get('/portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

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
