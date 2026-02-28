// db/index.js — PostgreSQL connection and schema setup
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      email       VARCHAR(255),
      center      VARCHAR(255),
      path        VARCHAR(10) NOT NULL,
      path_label  VARCHAR(100) NOT NULL,
      course_count INT DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id           SERIAL PRIMARY KEY,
      student_id   INT REFERENCES students(id) ON DELETE CASCADE,
      course_name  VARCHAR(500) NOT NULL,
      subject_area VARCHAR(500) NOT NULL,
      cert_date    DATE NOT NULL,
      status       VARCHAR(50) DEFAULT 'Pass',
      area_index   INT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS generated_packages (
      id           SERIAL PRIMARY KEY,
      student_id   INT REFERENCES students(id) ON DELETE CASCADE,
      filename     VARCHAR(500),
      path         VARCHAR(10),
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      generated_by VARCHAR(255),
      pdf_data     BYTEA
    );

    CREATE TABLE IF NOT EXISTS magic_tokens (
      id         SERIAL PRIMARY KEY,
      email      VARCHAR(255) NOT NULL,
      token      VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add pdf_data column to existing generated_packages if missing
  await pool.query(`
    ALTER TABLE generated_packages ADD COLUMN IF NOT EXISTS pdf_data BYTEA;
  `);

  // Add email column to students if missing
  await pool.query(`
    ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(255);
  `);

  // Deduplicate and add unique constraint on (name, path)
  await pool.query(`
    DO $$
    DECLARE
      dup RECORD;
      keep_id INT;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'students_name_path_unique'
      ) THEN
        FOR dup IN
          SELECT name, path FROM students GROUP BY name, path HAVING COUNT(*) > 1
        LOOP
          SELECT id INTO keep_id FROM students
          WHERE name = dup.name AND path = dup.path
          ORDER BY updated_at DESC, id DESC LIMIT 1;

          UPDATE certificates SET student_id = keep_id
          WHERE student_id IN (
            SELECT id FROM students WHERE name = dup.name AND path = dup.path AND id <> keep_id
          );
          UPDATE generated_packages SET student_id = keep_id
          WHERE student_id IN (
            SELECT id FROM students WHERE name = dup.name AND path = dup.path AND id <> keep_id
          );
          DELETE FROM students WHERE name = dup.name AND path = dup.path AND id <> keep_id;
        END LOOP;
        ALTER TABLE students ADD CONSTRAINT students_name_path_unique UNIQUE (name, path);
      END IF;
    END$$;
  `);

  console.log('✅ Database tables ready');
}

// ── STUDENT QUERIES ──────────────────────────────────────────

async function getAllStudents() {
  const res = await pool.query(`
    SELECT s.*,
      COUNT(c.id) as cert_count,
      MAX(gp.generated_at) as last_generated
    FROM students s
    LEFT JOIN certificates c ON c.student_id = s.id
    LEFT JOIN generated_packages gp ON gp.student_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `);
  return res.rows;
}

async function searchStudents(query) {
  const res = await pool.query(`
    SELECT s.*, COUNT(c.id) as cert_count
    FROM students s
    LEFT JOIN certificates c ON c.student_id = s.id
    WHERE LOWER(s.name) LIKE LOWER($1)
    GROUP BY s.id
    ORDER BY s.name ASC
  `, [`%${query}%`]);
  return res.rows;
}

async function getStudent(id) {
  const res = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
  return res.rows[0];
}

async function getStudentCertificates(studentId) {
  const res = await pool.query(`
    SELECT * FROM certificates
    WHERE student_id = $1
    ORDER BY cert_date ASC
  `, [studentId]);
  return res.rows;
}

async function getStudentHistory(studentId) {
  const res = await pool.query(`
    SELECT id, student_id, filename, path, generated_at, generated_by
    FROM generated_packages
    WHERE student_id = $1
    ORDER BY generated_at DESC
  `, [studentId]);
  return res.rows;
}

async function getPackagePDF(packageId) {
  const res = await pool.query(
    'SELECT pdf_data, filename FROM generated_packages WHERE id = $1',
    [packageId]
  );
  return res.rows[0];
}

async function saveStudentPackage(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert student using the unique constraint on (name, path)
    const stuRes = await client.query(`
      INSERT INTO students (name, email, center, path, path_label, course_count, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT ON CONSTRAINT students_name_path_unique
      DO UPDATE SET
        updated_at   = NOW(),
        course_count = EXCLUDED.course_count,
        email        = COALESCE(EXCLUDED.email, students.email),
        center       = COALESCE(EXCLUDED.center, students.center)
      RETURNING id
    `, [
      data.name,
      data.email   || null,
      data.center  || null,
      data.path,
      data.pathLabel,
      data.courses.length
    ]);

    const studentId = stuRes.rows[0].id;

    // Only replace certificates if course count or content has changed
    const existingRes = await client.query(
      `SELECT course_name, cert_date, status FROM certificates WHERE student_id = $1 ORDER BY course_name`,
      [studentId]
    );
    const existingKey = existingRes.rows.map(r => r.course_name + r.cert_date + r.status).sort().join('|');
    const incomingKey = data.courses.map(c => c.course + c.date + c.status).sort().join('|');

    if (existingKey !== incomingKey) {
      await client.query('DELETE FROM certificates WHERE student_id = $1', [studentId]);
      for (const course of data.courses) {
        await client.query(`
          INSERT INTO certificates (student_id, course_name, subject_area, cert_date, status, area_index)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [studentId, course.course, course.area, course.date, course.status, course.areaIndex]);
      }
    }

    // Store PDF bytes if provided
    const pdfBuffer = data.pdfBase64
      ? Buffer.from(data.pdfBase64, 'base64')
      : null;

    const pkgRes = await client.query(`
      INSERT INTO generated_packages (student_id, filename, path, generated_by, pdf_data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [studentId, data.filename, data.path, data.generatedBy || 'Admin', pdfBuffer]);

    await client.query('COMMIT');
    return { studentId, packageId: pkgRes.rows[0].id };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function deleteStudent(id) {
  await pool.query('DELETE FROM students WHERE id = $1', [id]);
}

// ── BULK DELETE ───────────────────────────────────────────────
// Deletes all students whose id is in the provided array.
// Cascades to certificates and generated_packages automatically.
async function deleteManyStudents(ids) {
  if (!ids || !ids.length) return { deleted: 0 };
  // Sanitise: ensure all values are integers
  const clean = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  if (!clean.length) return { deleted: 0 };
  const placeholders = clean.map((_, i) => `$${i + 1}`).join(', ');
  const res = await pool.query(
    `DELETE FROM students WHERE id IN (${placeholders})`,
    clean
  );
  return { deleted: res.rowCount };
}

async function getStats() {
  const res = await pool.query(`
    SELECT
      COUNT(DISTINCT s.id) as total_students,
      COUNT(DISTINCT CASE WHEN s.path='pre' THEN s.id END) as preschool,
      COUNT(DISTINCT CASE WHEN s.path='inf' THEN s.id END) as infant,
      COUNT(c.id) as total_certs,
      COUNT(DISTINCT gp.id) as total_packages
    FROM students s
    LEFT JOIN certificates c ON c.student_id = s.id
    LEFT JOIN generated_packages gp ON gp.student_id = s.id
  `);
  return res.rows[0];
}

// ── MAGIC LINK AUTH ──────────────────────────────────────────

async function createMagicToken(email) {
  const crypto = require('crypto');
  const token = crypto.randomBytes(48).toString('hex');
  const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  // Invalidate any previous unused tokens for this email
  await pool.query(
    `UPDATE magic_tokens SET used = TRUE WHERE email = $1 AND used = FALSE`,
    [email.toLowerCase()]
  );

  await pool.query(
    `INSERT INTO magic_tokens (email, token, expires_at) VALUES ($1, $2, $3)`,
    [email.toLowerCase(), token, expires]
  );
  return token;
}

async function verifyMagicToken(token) {
  const res = await pool.query(
    `SELECT * FROM magic_tokens
     WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
    [token]
  );
  if (!res.rows.length) return null;

  const row = res.rows[0];
  await pool.query(
    `UPDATE magic_tokens SET used = TRUE WHERE id = $1`,
    [row.id]
  );
  return row; // { email, ... }
}

async function findStudentsByEmail(email) {
  const res = await pool.query(
    `SELECT s.*,
       COUNT(c.id) as cert_count,
       MAX(gp.generated_at) as last_generated
     FROM students s
     LEFT JOIN certificates c ON c.student_id = s.id
     LEFT JOIN generated_packages gp ON gp.student_id = s.id
     WHERE LOWER(s.email) = LOWER($1)
     GROUP BY s.id
     ORDER BY s.path ASC`,
    [email]
  );
  return res.rows;
}

async function getStudentPackages(studentId) {
  const res = await pool.query(
    `SELECT id, filename, path, generated_at, generated_by,
       (pdf_data IS NOT NULL) as has_pdf
     FROM generated_packages
     WHERE student_id = $1
     ORDER BY generated_at DESC`,
    [studentId]
  );
  return res.rows;
}

module.exports = {
  pool,
  initDB,
  getAllStudents,
  searchStudents,
  getStudent,
  getStudentCertificates,
  getStudentHistory,
  getPackagePDF,
  saveStudentPackage,
  deleteStudent,
  deleteManyStudents,   // ← new
  getStats,
  createMagicToken,
  verifyMagicToken,
  findStudentsByEmail,
  getStudentPackages,
};
