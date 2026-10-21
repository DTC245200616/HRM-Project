
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function createAuth(pool) {
  const router = express.Router();

  // =====================================
  // HÀM HỖ TRỢ
  // =====================================

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validPassword(password) {
    return typeof password === "string" &&
      password.length >= 12 &&
      password.length <= 128;
  }

  function validId(value) {
    if (value === "" || value == null) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0
      ? id
      : null;
  }

  function errorResponse(res, error) {
    console.error("Lỗi tài khoản:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Email hoặc nhân viên đã được sử dụng"
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        error: "Nhân viên không tồn tại"
      });
    }

    if (error.code === "23514" || error.code === "23502") {
      return res.status(400).json({
        error: "Thông tin tài khoản không hợp lệ"
      });
    }

    return res.status(500).json({
      error: "Lỗi máy chủ"
    });
  }

  // =====================================
  // GIỚI HẠN THỬ ĐĂNG NHẬP
  // =====================================

  const loginAttempts = new Map();
  const WINDOW_MS = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 10;

  // =====================================
  // ĐĂNG NHẬP
  // =====================================

  router.post("/login", async (req, res) => {
    const ip = req.ip || "unknown";
    const now = Date.now();

    let attempt = loginAttempts.get(ip);

    if (attempt && now >= attempt.until) {
      loginAttempts.delete(ip);
      attempt = null;
    }

    if (attempt && attempt.count >= MAX_ATTEMPTS) {
      return res.status(429).json({
        error: "Thử quá nhiều lần. Vui lòng thử lại sau 15 phút"
      });
    }

    try {
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();

      const password = req.body?.password;

      if (
        !email ||
        email.length > 150 ||
        typeof password !== "string" ||
        password.length > 1024
      ) {
        return res.status(400).json({
          error: "Email hoặc mật khẩu không hợp lệ"
        });
      }

      const result = await pool.query(
        `SELECT id, email, password_hash, role,
                is_active, token_version
         FROM users
         WHERE LOWER(email) = $1`,
        [email]
      );

      const user = result.rows[0];

      const valid = user
        ? await bcrypt.compare(password, user.password_hash)
        : false;

      if (!user || !valid || !user.is_active) {
        const current = loginAttempts.get(ip);
        loginAttempts.set(ip, {
          count: (current?.count || 0) + 1,
          until: current?.until || now + WINDOW_MS
        });

        return res.status(401).json({
          error: "Email hoặc mật khẩu không chính xác"
        });
      }

      loginAttempts.delete(ip);

      const token = jwt.sign(
        {
          id: user.id,
          version: user.token_version
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "8h",
          algorithm: "HS256"
        }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // =====================================
  // KIỂM TRA JWT
  // =====================================

  async function requireLogin(req, res, next) {
    const authorization = req.headers.authorization || "";
    const match = /^Bearer (.+)$/i.exec(authorization);

    if (!match) {
      return res.status(401).json({
        error: "Bạn chưa đăng nhập"
      });
    }

    try {
      const payload = jwt.verify(
        match[1],
        process.env.JWT_SECRET,
        { algorithms: ["HS256"] }
      );

      const result = await pool.query(
        `SELECT id, email, role, employee_id,
                is_active, token_version
         FROM users
         WHERE id = $1`,
        [payload.id]
      );

      const user = result.rows[0];

      if (
        !user ||
        !user.is_active ||
        user.token_version !== payload.version
      ) {
        return res.status(401).json({
          error: "Phiên đăng nhập không còn hợp lệ"
        });
      }

      req.user = user;
      next();
    } catch {
      return res.status(401).json({
        error: "Phiên đăng nhập hết hạn hoặc không hợp lệ"
      });
    }
  }

  function allowRoles(...roles) {
    return (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
          error: "Bạn không có quyền thực hiện thao tác này"
        });
      }
      next();
    };
  }

  // =====================================
  // THÔNG TIN TÀI KHOẢN
  // =====================================

  router.get("/me", requireLogin, (req, res) => {
    res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      employee_id: req.user.employee_id
    });
  });

  // =====================================
  // ĐỔI MẬT KHẨU CỦA MÌNH
  // =====================================

  router.put("/change-password", requireLogin, async (req, res) => {
    const oldPassword = req.body?.old_password;
    const newPassword = req.body?.new_password;

    if (
      typeof oldPassword !== "string" ||
      !validPassword(newPassword)
    ) {
      return res.status(400).json({
        error: "Mật khẩu mới phải từ 12 đến 128 ký tự"
      });
    }

    try {
      const result = await pool.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [req.user.id]
      );

      const correct = await bcrypt.compare(
        oldPassword,
        result.rows[0].password_hash
      );

      if (!correct) {
        return res.status(400).json({
          error: "Mật khẩu hiện tại không chính xác"
        });
      }

      if (oldPassword === newPassword) {
        return res.status(400).json({
          error: "Mật khẩu mới phải khác mật khẩu cũ"
        });
      }

      const hash = await bcrypt.hash(newPassword, 12);

      await pool.query(
        `UPDATE users
         SET password_hash = $1,
             token_version = token_version + 1
         WHERE id = $2`,
        [hash, req.user.id]
      );

      res.json({
        message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại"
      });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // =====================================
  // NHÂN VIÊN XEM HỒ SƠ CỦA MÌNH
  // =====================================

  router.get("/my-profile", requireLogin, async (req, res) => {
    if (!req.user.employee_id) {
      return res.json(null);
    }

    try {
      const result = await pool.query(
        `SELECT e.id, e.full_name, e.email, e.phone,
                e.position, d.name AS department
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE e.id = $1`,
        [req.user.employee_id]
      );

      res.json(result.rows[0] || null);
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // Nhân viên chỉ xem chấm công của mình
  router.get("/my-attendance", requireLogin, async (req, res) => {
    if (!req.user.employee_id) {
      return res.json([]);
    }

    try {
      const result = await pool.query(
        `SELECT id,
                TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date,
                TO_CHAR(check_in, 'HH24:MI') AS check_in,
                TO_CHAR(check_out, 'HH24:MI') AS check_out,
                status
         FROM attendance
         WHERE employee_id = $1
         ORDER BY work_date DESC`,
        [req.user.employee_id]
      );

      res.json(result.rows);
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // =====================================
  // ADMIN: DANH SÁCH TÀI KHOẢN
  // =====================================

  router.get(
    "/users",
    requireLogin,
    allowRoles("admin"),
    async (req, res) => {
      try {
        const result = await pool.query(`
          SELECT u.id, u.email, u.role, u.employee_id,
                 u.is_active, u.created_at,
                 e.full_name AS employee_name
          FROM users u
          LEFT JOIN employees e ON e.id = u.employee_id
          ORDER BY u.id
        `);

        res.json(result.rows);
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  // =====================================
  // ADMIN: TẠO TÀI KHOẢN
  // =====================================

  router.post(
    "/users",
    requireLogin,
    allowRoles("admin"),
    async (req, res) => {
      const email = String(req.body?.email || "")
        .trim().toLowerCase();

      const password = req.body?.password;
      const role = String(req.body?.role || "");
      const employeeId = validId(req.body?.employee_id);

      if (!emailRegex.test(email) || email.length > 150) {
        return res.status(400).json({
          error: "Email không hợp lệ"
        });
      }

      if (!validPassword(password)) {
        return res.status(400).json({
          error: "Mật khẩu cần từ 12 đến 128 ký tự"
        });
      }

      if (!["admin", "hr", "employee"].includes(role)) {
        return res.status(400).json({
          error: "Vai trò không hợp lệ"
        });
      }

      if (role === "employee" && !employeeId) {
        return res.status(400).json({
          error: "Tài khoản nhân viên phải liên kết hồ sơ nhân viên"
        });
      }

      if (
        req.body.employee_id != null &&
        req.body.employee_id !== "" &&
        !employeeId
      ) {
        return res.status(400).json({
          error: "ID nhân viên không hợp lệ"
        });
      }

      try {
        const hash = await bcrypt.hash(password, 12);

        const result = await pool.query(
          `INSERT INTO users
             (email, password_hash, role, employee_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, role, employee_id, is_active`,
          [email, hash, role, employeeId]
        );

        res.status(201).json(result.rows[0]);
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  // =====================================
  // ADMIN: KHÓA / MỞ KHÓA
  // =====================================

  router.patch(
    "/users/:id/status",
    requireLogin,
    allowRoles("admin"),
    async (req, res) => {
      const id = validId(req.params.id);
      const active = req.body?.is_active;

      if (!id || typeof active !== "boolean") {
        return res.status(400).json({
          error: "Dữ liệu không hợp lệ"
        });
      }

      if (id === req.user.id && !active) {
        return res.status(400).json({
          error: "Không thể tự khóa tài khoản của mình"
        });
      }

      try {
        const result = await pool.query(
          `UPDATE users
           SET is_active = $1,
               token_version = token_version + 1
           WHERE id = $2
           RETURNING id, email, is_active`,
          [active, id]
        );

        if (!result.rowCount) {
          return res.status(404).json({
            error: "Không tìm thấy tài khoản"
          });
        }

        res.json(result.rows[0]);
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  // =====================================
  // ADMIN: ĐẶT LẠI MẬT KHẨU
  // =====================================

  router.put(
    "/users/:id/reset-password",
    requireLogin,
    allowRoles("admin"),
    async (req, res) => {
      const id = validId(req.params.id);
      const password = req.body?.new_password;

      if (!id || !validPassword(password)) {
        return res.status(400).json({
          error: "Mật khẩu mới phải từ 12 đến 128 ký tự"
        });
      }

      try {
        const hash = await bcrypt.hash(password, 12);

        const result = await pool.query(
          `UPDATE users
           SET password_hash = $1,
               token_version = token_version + 1
           WHERE id = $2
           RETURNING id`,
          [hash, id]
        );

        if (!result.rowCount) {
          return res.status(404).json({
            error: "Không tìm thấy tài khoản"
          });
        }

        res.json({
          message: "Đặt lại mật khẩu thành công"
        });
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  return {
    authRouter: router,
    requireLogin,
    allowRoles
  };
}

module.exports = { createAuth };
