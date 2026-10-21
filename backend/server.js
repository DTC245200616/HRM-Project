
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { createAuth } = require("./auth");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// =====================================
// MIDDLEWARE
// =====================================

app.use(cors());
app.use(express.json({ limit: "100kb" }));

// =====================================
// KẾT NỐI POSTGRESQL
// =====================================

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "hrm_user",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "hrm_db"
});

// =====================================
// KIỂM TRA BACKEND
// =====================================

app.get("/", (req, res) => {
  res.json({
    message: "HRM Backend đang hoạt động!",
    status: "success"
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected"
    });
  } catch (error) {
    console.error("Lỗi PostgreSQL:", error.message);

    res.status(503).json({
      status: "error",
      database: "disconnected"
    });
  }
});

// =====================================
// ĐĂNG NHẬP VÀ PHÂN QUYỀN
// =====================================

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  throw new Error(
    "Chưa cấu hình JWT_SECRET tối thiểu 32 ký tự trong backend/.env"
  );
}

const {
  authRouter,
  requireLogin,
  allowRoles
} = createAuth(pool);

// Đường dẫn đăng nhập và thông tin tài khoản
app.use("/api/auth", authRouter);

// Từ đây các API nghiệp vụ yêu cầu đăng nhập
app.use(
  "/api",
  requireLogin,
  allowRoles("admin", "hr")
);

// =====================================
// HÀM HỖ TRỢ
// =====================================

function validId(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function validationError(message) {
  const error = new Error(message);
  error.isValidationError = true;
  return error;
}

function handleDbError(error, res) {
  if (error.isValidationError) {
    return res.status(400).json({
      error: error.message
    });
  }

  if (error.code === "23505") {
    return res.status(409).json({
      error: "Dữ liệu đã tồn tại"
    });
  }

  if (error.code === "23503") {
    return res.status(409).json({
      error: "Dữ liệu đang được sử dụng hoặc không tồn tại"
    });
  }

  if (
    ["23514", "23502", "22007", "22008", "22P02"]
      .includes(error.code)
  ) {
    return res.status(400).json({
      error: "Dữ liệu không hợp lệ"
    });
  }

  console.error("Lỗi database:", error);

  return res.status(500).json({
    error: "Lỗi máy chủ. Vui lòng thử lại"
  });
}

// =====================================
// QUẢN LÝ PHÒNG BAN
// =====================================

// Lấy danh sách phòng ban
app.get("/api/departments", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description
      FROM departments
      ORDER BY id
    `);

    res.json(result.rows);
  } catch (error) {
    handleDbError(error, res);
  }
});

// Kiểm tra phòng ban
function validateDepartment(body = {}) {
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();

  if (!name || name.length > 100) {
    throw validationError(
      "Tên phòng ban phải có từ 1 đến 100 ký tự"
    );
  }

  if (description.length > 5000) {
    throw validationError("Mô tả phòng ban quá dài");
  }

  return { name, description };
}

// Thêm phòng ban
app.post("/api/departments", async (req, res) => {
  try {
    const d = validateDepartment(req.body);

    const result = await pool.query(`
      INSERT INTO departments (name, description)
      VALUES ($1, $2)
      RETURNING *
    `, [d.name, d.description]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    handleDbError(error, res);
  }
});

// Sửa phòng ban
app.put("/api/departments/:id", async (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "ID phòng ban không hợp lệ"
    });
  }

  try {
    const d = validateDepartment(req.body);

    const result = await pool.query(`
      UPDATE departments
      SET name = $1, description = $2
      WHERE id = $3
      RETURNING *
    `, [d.name, d.description, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Không tìm thấy phòng ban"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    handleDbError(error, res);
  }
});

// Xóa phòng ban
app.delete("/api/departments/:id", async (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "ID phòng ban không hợp lệ"
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM departments
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Không tìm thấy phòng ban"
      });
    }

    res.json({
      message: "Xóa phòng ban thành công"
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        error: "Phòng ban đang có nhân viên, không thể xóa"
      });
    }

    handleDbError(error, res);
  }
});

// =====================================
// QUẢN LÝ NHÂN VIÊN
// =====================================

// Lấy danh sách nhân viên
app.get("/api/employees", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.full_name,
        e.email,
        e.phone,
        e.position,
        e.salary,
        e.department_id,
        d.name AS department
      FROM employees e
      LEFT JOIN departments d
        ON e.department_id = d.id
      ORDER BY e.id
    `);

    res.json(result.rows);
  } catch (error) {
    handleDbError(error, res);
  }
});

// Kiểm tra thông tin nhân viên
function validateEmployee(body = {}) {
  const fullName = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const position = String(body.position ?? "").trim();

  const salary = Number(body.salary);
  const departmentId = validId(body.department_id);

  if (!fullName || fullName.length > 150) {
    throw validationError(
      "Họ tên nhân viên không hợp lệ"
    );
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 150
  ) {
    throw validationError("Email không hợp lệ");
  }

  if (phone.length > 20) {
    throw validationError("Số điện thoại quá dài");
  }

  if (position.length > 100) {
    throw validationError("Chức vụ quá dài");
  }

  if (
    body.salary === "" ||
    body.salary === null ||
    body.salary === undefined ||
    !Number.isFinite(salary) ||
    salary < 0 ||
    salary > 9999999999.99
  ) {
    throw validationError("Lương không hợp lệ");
  }

  if (!departmentId) {
    throw validationError(
      "Vui lòng chọn phòng ban hợp lệ"
    );
  }

  return {
    fullName,
    email,
    phone,
    position,
    salary,
    departmentId
  };
}

// Thêm nhân viên
app.post("/api/employees", async (req, res) => {
  try {
    const e = validateEmployee(req.body);

    const result = await pool.query(`
      INSERT INTO employees
        (full_name, email, phone, position, salary, department_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      e.fullName,
      e.email,
      e.phone,
      e.position,
      e.salary,
      e.departmentId
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Email nhân viên đã tồn tại"
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        error: "Phòng ban không tồn tại"
      });
    }

    handleDbError(error, res);
  }
});

// Sửa nhân viên
app.put("/api/employees/:id", async (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "ID nhân viên không hợp lệ"
    });
  }

  try {
    const e = validateEmployee(req.body);

    const result = await pool.query(`
      UPDATE employees
      SET
        full_name = $1,
        email = $2,
        phone = $3,
        position = $4,
        salary = $5,
        department_id = $6
      WHERE id = $7
      RETURNING *
    `, [
      e.fullName,
      e.email,
      e.phone,
      e.position,
      e.salary,
      e.departmentId,
      id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Không tìm thấy nhân viên"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Email nhân viên đã tồn tại"
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        error: "Phòng ban không tồn tại"
      });
    }

    handleDbError(error, res);
  }
});

// Xóa nhân viên
app.delete("/api/employees/:id", async (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "ID nhân viên không hợp lệ"
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM employees
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Không tìm thấy nhân viên"
      });
    }

    res.json({
      message: "Xóa nhân viên thành công"
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        error: "Nhân viên đã có dữ liệu chấm công, không thể xóa"
      });
    }

    handleDbError(error, res);
  }
});

// =====================================
// QUẢN LÝ CHẤM CÔNG
// =====================================

// Lấy danh sách chấm công
app.get("/api/attendance", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.employee_id,
        e.full_name AS employee_name,
        TO_CHAR(a.work_date, 'YYYY-MM-DD') AS work_date,
        TO_CHAR(a.check_in, 'HH24:MI') AS check_in,
        TO_CHAR(a.check_out, 'HH24:MI') AS check_out,
        a.status
      FROM attendance a
      JOIN employees e
        ON a.employee_id = e.id
      ORDER BY a.work_date DESC, a.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    handleDbError(error, res);
  }
});

// Kiểm tra dữ liệu chấm công
function validateAttendance(body = {}) {
  const employeeId = validId(body.employee_id);
  const workDate = String(body.work_date ?? "");
  const checkIn = body.check_in || null;
  const checkOut = body.check_out || null;
  const status = String(body.status ?? "");

  if (!employeeId) {
    throw validationError(
      "Vui lòng chọn nhân viên hợp lệ"
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    throw validationError(
      "Ngày chấm công không hợp lệ"
    );
  }

  const date = new Date(workDate + "T00:00:00Z");

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== workDate
  ) {
    throw validationError(
      "Ngày chấm công không tồn tại"
    );
  }

  const validTime = value =>
    value === null ||
    (
      typeof value === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    );

  if (!validTime(checkIn) || !validTime(checkOut)) {
    throw validationError(
      "Giờ vào hoặc giờ ra không hợp lệ"
    );
  }

  if (
    !["present", "late", "absent"]
      .includes(status)
  ) {
    throw validationError(
      "Trạng thái chấm công không hợp lệ"
    );
  }

  if (
    status === "absent" &&
    (checkIn || checkOut)
  ) {
    throw validationError(
      "Vắng mặt không được có giờ vào hoặc giờ ra"
    );
  }

  if (checkOut && !checkIn) {
    throw validationError(
      "Cần nhập giờ vào trước giờ ra"
    );
  }

  if (checkIn && checkOut && checkOut < checkIn) {
    throw validationError(
      "Giờ ra phải từ giờ vào trở đi"
    );
  }

  return {
    employeeId,
    workDate,
    checkIn,
    checkOut,
    status
  };
}

// Thêm chấm công
app.post("/api/attendance", async (req, res) => {
  try {
    const a = validateAttendance(req.body);

    const result = await pool.query(`
      INSERT INTO attendance
        (employee_id, work_date, check_in, check_out, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      a.employeeId,
      a.workDate,
      a.checkIn,
      a.checkOut,
      a.status
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Nhân viên đã được chấm công trong ngày này"
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        error: "Nhân viên không tồn tại"
      });
    }

    handleDbError(error, res);
  }
});

// Sửa chấm công
app.put("/api/attendance/:id", async (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "ID chấm công không hợp lệ"
    });
  }

  try {
    const a = validateAttendance(req.body);

    const result = await pool.query(`
      UPDATE attendance
      SET
        employee_id = $1,
        work_date = $2,
        check_in = $3,
        check_out = $4,
        status = $5
      WHERE id = $6
      RETURNING *
    `, [
      a.employeeId,
      a.workDate,
      a.checkIn,
      a.checkOut,
      a.status,
      id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Không tìm thấy bản ghi chấm công"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Nhân viên đã được chấm công trong ngày này"
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        error: "Nhân viên không tồn tại"
      });
    }

    handleDbError(error, res);
  }
});

// Xóa chấm công
app.delete("/api/attendance/:id", async (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "ID chấm công không hợp lệ"
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM attendance
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Không tìm thấy bản ghi chấm công"
      });
    }

    res.json({
      message: "Xóa chấm công thành công"
    });
  } catch (error) {
    handleDbError(error, res);
  }
});

// =====================================
// API KHÔNG TỒN TẠI
// =====================================

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "Đường dẫn API không tồn tại"
  });
});

// =====================================
// KHỞI ĐỘNG SERVER
// =====================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HRM Server running on port ${PORT}`);
});
