// db/index.js — PostgreSQL connection and schema setup
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables if they don't exist
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
      id          SERIAL PRIMARY KEY,
      student_id  INT REFERENCES students(id) ON DELETE CASCADE,
      filename    VARCHAR(500),
      path        VARCHAR(10),
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      generated_by VARCHAR(255)
    );

    -- Add unique constraint so upserts work correctly
    -- (safe to run repeatedly — IF NOT EXISTS equivalent via DO block)
  `);

  // Add unique constraint on (name, path) if it doesn't already exist
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'students_name_path_unique'
      ) THEN
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
    SELECT * FROM generated_packages 
    WHERE student_id = $1 
    ORDER BY generated_at DESC
  `, [studentId]);
  return res.rows;
}

async function saveStudentPackage(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert student — ON CONFLICT now has a named constraint to target
    const stuRes = await client.query(`
      INSERT INTO students (name, email, center, path, path_label, course_count, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT ON CONSTRAINT students_name_path_unique
      DO UPDATE SET
        updated_at   = NOW(),
        course_count = EXCLUDED.course_count,
        center       = COALESCE(EXCLUDED.center, students.center),
        email        = COALESCE(EXCLUDED.email, students.email)
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

    // Replace certificates for this student (fresh re-run)
    await client.query('DELETE FROM certificates WHERE student_id = $1', [studentId]);

    for (const course of data.courses) {
      await client.query(`
        INSERT INTO certificates (student_id, course_name, subject_area, cert_date, status, area_index)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [studentId, course.course, course.area, course.date, course.status, course.areaIndex]);
    }

    // Log the generation event
    await client.query(`
      INSERT INTO generated_packages (student_id, filename, path, generated_by)
      VALUES ($1, $2, $3, $4)
    `, [studentId, data.filename, data.path, data.generatedBy || 'Admin']);

    await client.query('COMMIT');
    return { studentId };
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

module.exports = {
  pool,
  initDB,
  getAllStudents,
  searchStudents,
  getStudent,
  getStudentCertificates,
  getStudentHistory,
  saveStudentPackage,
  deleteStudent,
  getStats
};
