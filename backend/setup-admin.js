
require("dotenv").config();

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "hrm_user",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "hrm_db"
});

async function main() {
  try {
    // Tạo bảng nếu chưa tồn tại
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Bổ sung các cột mới, không xóa tài khoản cũ
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS employee_id INTEGER,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0
    `);

    await pool.query(`
      UPDATE users
      SET is_active = TRUE
      WHERE is_active IS NULL
    `);

    await pool.query(`
      UPDATE users
      SET token_version = 0
      WHERE token_version IS NULL
    `);

    // Cập nhật giới hạn vai trò cũ
    await pool.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check
    `);

    await pool.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'hr', 'employee'))
    `);

    // Một nhân viên chỉ được liên kết một tài khoản
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      users_employee_unique
      ON users(employee_id)
      WHERE employee_id IS NOT NULL
    `);

    // Liên kết tài khoản với hồ sơ nhân viên
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'users_employee_fk'
            AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users
          ADD CONSTRAINT users_employee_fk
          FOREIGN KEY (employee_id)
          REFERENCES employees(id)
          ON DELETE RESTRICT;
        END IF;
      END $$
    `);

    console.log("Đã cập nhật bảng users thành công.");

    const email = String(process.env.ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();

    const password = process.env.ADMIN_PASSWORD;

    // Khi không nhập ADMIN_EMAIL, chỉ cập nhật CSDL
    if (!email) return;

    const existing = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = $1",
      [email]
    );

    if (existing.rowCount > 0) {
      console.log("Tài khoản đã tồn tại:", email);
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 12
    ) {
      throw new Error(
        "Email không hợp lệ hoặc mật khẩu dưới 12 ký tự"
      );
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'admin')`,
      [email, hash]
    );

    console.log("Đã tạo tài khoản Admin:", email);
  } catch (error) {
    console.error("Lỗi:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
