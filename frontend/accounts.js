
// ========================================
// CẤU HÌNH API QUA NGINX
// ========================================

const API = "/api";
const $ = id => document.getElementById(id);

let currentUser = null;
let users = [];

// ========================================
// ĐĂNG XUẤT
// ========================================

function logout() {
  sessionStorage.removeItem("hrm_token");
  sessionStorage.removeItem("hrm_user");
  window.location.replace("./login.html");
}

// ========================================
// GỌI API BACKEND QUA NGINX
// ========================================

async function request(path, options = {}) {
  const token = sessionStorage.getItem("hrm_token");

  if (!token) {
    logout();
    throw new Error("Bạn chưa đăng nhập");
  }

  let response;

  try {
    response = await fetch(API + path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: "Bearer " + token
      },
      cache: "no-store"
    });
  } catch {
    throw new Error(
      "Không kết nối được Backend qua Nginx"
    );
  }

  if (response.status === 401) {
    logout();
    throw new Error("Phiên đăng nhập đã hết hạn");
  }

  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "Máy chủ trả về dữ liệu không hợp lệ. Kiểm tra Docker và Nginx."
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error || "Yêu cầu thất bại"
    );
  }

  return data;
}

function jsonOptions(method, data) {
  return {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  };
}

// ========================================
// HÀM HIỂN THỊ
// ========================================

function notice(id, message) {
  const element = $(id);

  if (element) {
    element.textContent = message;
  }
}

function textCell(row, value) {
  const cell = row.insertCell();
  cell.textContent = value ?? "—";
  return cell;
}

function profileField(parent, label, value) {
  const box = document.createElement("div");
  const caption = document.createElement("span");
  const strong = document.createElement("strong");

  caption.textContent = label;
  strong.textContent = value || "Chưa cập nhật";

  box.append(caption, strong);
  parent.append(box);
}

// ========================================
// ADMIN: DANH SÁCH TÀI KHOẢN
// ========================================

async function loadUsers() {
  const data = await request("/auth/users");

  if (!Array.isArray(data)) {
    throw new Error("Dữ liệu tài khoản không hợp lệ");
  }

  users = data;

  const body = $("usersTable");
  body.replaceChildren();

  if (!users.length) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = 6;
    cell.textContent = "Chưa có tài khoản";
    return;
  }

  for (const user of users) {
    const row = body.insertRow();

    textCell(row, user.id);
    textCell(row, user.email);

    textCell(
      row,
      {
        admin: "Admin",
        hr: "Nhân sự",
        employee: "Nhân viên"
      }[user.role] || user.role
    );

    textCell(row, user.employee_name);
    textCell(
      row,
      user.is_active ? "Hoạt động" : "Đã khóa"
    );

    const actions = row.insertCell();

    // KHÓA / MỞ KHÓA TÀI KHOẢN
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent =
      user.is_active ? "Khóa" : "Mở khóa";

    if (user.is_active) {
      toggle.className = "warning";
    }

    if (user.id === currentUser.id) {
      toggle.disabled = true;
      toggle.title = "Không thể tự khóa tài khoản";
    }

    toggle.onclick = async () => {
      const action = user.is_active
        ? "khóa"
        : "mở khóa";

      if (!confirm(
        `Bạn có chắc muốn ${action} tài khoản ${user.email}?`
      )) {
        return;
      }

      try {
        await request(
          `/auth/users/${user.id}/status`,
          jsonOptions("PATCH", {
            is_active: !user.is_active
          })
        );

        await loadUsers();

        notice(
          "usersNotice",
          "Cập nhật trạng thái tài khoản thành công!"
        );
      } catch (error) {
        notice(
          "usersNotice",
          "Lỗi: " + error.message
        );
      }
    };

    // ĐẶT LẠI MẬT KHẨU
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Đặt lại mật khẩu";

    reset.onclick = async () => {
      const password = prompt(
        "Nhập mật khẩu mới (12–128 ký tự):"
      );

      if (password === null) return;

      if (
        password.length < 12 ||
        password.length > 128
      ) {
        notice(
          "usersNotice",
          "Mật khẩu phải có từ 12 đến 128 ký tự."
        );
        return;
      }

      if (!confirm(
        `Đặt lại mật khẩu cho ${user.email}?`
      )) {
        return;
      }

      try {
        await request(
          `/auth/users/${user.id}/reset-password`,
          jsonOptions("PUT", {
            new_password: password
          })
        );

        notice(
          "usersNotice",
          "Đặt lại mật khẩu thành công!"
        );

        if (user.id === currentUser.id) {
          alert(
            "Mật khẩu của bạn đã thay đổi. Vui lòng đăng nhập lại."
          );
          logout();
        }
      } catch (error) {
        notice(
          "usersNotice",
          "Lỗi: " + error.message
        );
      }
    };

    actions.append(toggle, reset);
  }
}

// ========================================
// ADMIN: TẢI DANH SÁCH NHÂN VIÊN
// ========================================

async function loadEmployees() {
  const employees = await request("/employees");
  const select = $("newEmployee");

  if (!Array.isArray(employees)) {
    throw new Error("Dữ liệu nhân viên không hợp lệ");
  }

  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Không liên kết";

  select.append(placeholder);

  employees.forEach(employee => {
    const option = document.createElement("option");

    option.value = employee.id;
    option.textContent =
      `${employee.full_name} (ID: ${employee.id})`;

    select.append(option);
  });
}

// ========================================
// ADMIN: PHÂN QUYỀN TÀI KHOẢN
// ========================================

function changeRole() {
  const isEmployee =
    $("newRole").value === "employee";

  $("newEmployee").required = isEmployee;

  const firstOption = $("newEmployee").options[0];

  if (firstOption) {
    firstOption.textContent = isEmployee
      ? "Chọn nhân viên"
      : "Không liên kết";
  }
}

// ========================================
// ADMIN: TẠO TÀI KHOẢN
// ========================================

async function createUser(event) {
  event.preventDefault();

  notice("createNotice", "");

  const data = {
    email: $("newEmail").value.trim().toLowerCase(),
    password: $("newPassword").value,
    role: $("newRole").value,
    employee_id: $("newEmployee").value || null
  };

  if (
    data.password.length < 12 ||
    data.password.length > 128
  ) {
    notice(
      "createNotice",
      "Mật khẩu phải có từ 12 đến 128 ký tự."
    );
    return;
  }

  if (
    data.role === "employee" &&
    !data.employee_id
  ) {
    notice(
      "createNotice",
      "Vui lòng liên kết tài khoản với một nhân viên."
    );
    return;
  }

  try {
    await request(
      "/auth/users",
      jsonOptions("POST", data)
    );

    $("createUserForm").reset();
    changeRole();

    await loadUsers();

    notice(
      "createNotice",
      "Tạo tài khoản thành công!"
    );
  } catch (error) {
    notice(
      "createNotice",
      "Lỗi: " + error.message
    );
  }
}

// ========================================
// ĐỔI MẬT KHẨU CÁ NHÂN
// ========================================

async function changePassword(event) {
  event.preventDefault();

  notice("passwordNotice", "");

  const oldPassword = $("oldPassword").value;
  const newPassword = $("changePassword").value;
  const confirmPassword = $("confirmPassword").value;

  if (
    newPassword.length < 12 ||
    newPassword.length > 128
  ) {
    notice(
      "passwordNotice",
      "Mật khẩu mới phải có từ 12 đến 128 ký tự."
    );
    return;
  }

  if (newPassword !== confirmPassword) {
    notice(
      "passwordNotice",
      "Mật khẩu nhập lại không khớp."
    );
    return;
  }

  try {
    await request(
      "/auth/change-password",
      jsonOptions("PUT", {
        old_password: oldPassword,
        new_password: newPassword
      })
    );

    $("passwordForm").reset();

    alert(
      "Đổi mật khẩu thành công. Vui lòng đăng nhập lại."
    );

    logout();
  } catch (error) {
    notice(
      "passwordNotice",
      "Lỗi: " + error.message
    );
  }
}

// ========================================
// HỒ SƠ VÀ CHẤM CÔNG CÁ NHÂN
// ========================================

async function loadMyProfile() {
  const profile = await request("/auth/my-profile");

  const content = $("profileContent");
  content.replaceChildren();

  $("profileArea").hidden = false;

  if (!profile) {
    profileField(
      content,
      "Hồ sơ",
      "Tài khoản chưa liên kết với nhân viên"
    );

    return;
  }

  profileField(
    content,
    "Họ và tên",
    profile.full_name
  );

  profileField(
    content,
    "Email",
    profile.email
  );

  profileField(
    content,
    "Số điện thoại",
    profile.phone
  );

  profileField(
    content,
    "Chức vụ",
    profile.position
  );

  profileField(
    content,
    "Phòng ban",
    profile.department
  );

  // CHẤM CÔNG CÁ NHÂN
  const records = await request(
    "/auth/my-attendance"
  );

  const body = $("myAttendanceTable");
  body.replaceChildren();

  $("myAttendanceArea").hidden = false;

  if (!records.length) {
    const cell = body.insertRow().insertCell();

    cell.colSpan = 4;
    cell.textContent =
      "Chưa có dữ liệu chấm công";

    return;
  }

  const labels = {
    present: "Có mặt",
    late: "Đi muộn",
    absent: "Vắng mặt"
  };

  records.forEach(record => {
    const row = body.insertRow();

    textCell(row, record.work_date);
    textCell(row, record.check_in || "—");
    textCell(row, record.check_out || "—");

    textCell(
      row,
      labels[record.status] || record.status
    );
  });
}

// ========================================
// KHỞI TẠO TRANG TÀI KHOẢN
// ========================================

async function init() {
  const token = sessionStorage.getItem(
    "hrm_token"
  );

  if (!token) {
    logout();
    return;
  }

  // SỰ KIỆN CHUNG
  $("logoutButton").addEventListener(
    "click",
    logout
  );

  $("passwordForm").addEventListener(
    "submit",
    changePassword
  );

  $("backButton").addEventListener(
    "click",
    () => {
      window.location.href = "./index.html";
    }
  );

  // Mặc định ẩn khu vực quản lý Admin
  $("adminArea").hidden = true;

  try {
    // Lấy vai trò từ Backend
    currentUser = await request("/auth/me");

    const roleNames = {
      admin: "Quản trị viên",
      hr: "Nhân sự",
      employee: "Nhân viên"
    };

    $("currentUser").textContent =
      `${currentUser.email} | Vai trò: ${
        roleNames[currentUser.role] || currentUser.role
      }`;

    // ADMIN: ĐƯỢC QUẢN LÝ TÀI KHOẢN
    if (currentUser.role === "admin") {
      $("adminArea").hidden = false;

      $("createUserForm").addEventListener(
        "submit",
        createUser
      );

      $("newRole").addEventListener(
        "change",
        changeRole
      );

      await Promise.all([
        loadUsers(),
        loadEmployees()
      ]);

      changeRole();
    }

    // HIỂN THỊ HỒ SƠ CÁ NHÂN
    if (currentUser.employee_id) {
      await loadMyProfile();
    }

    // NHÂN VIÊN KHÔNG ĐƯỢC VỀ DASHBOARD
    if (currentUser.role === "employee") {
      $("backButton").hidden = true;

      if (!currentUser.employee_id) {
        $("profileArea").hidden = false;

        $("profileContent").replaceChildren();

        profileField(
          $("profileContent"),
          "Thông báo",
          "Chưa liên kết hồ sơ nhân viên"
        );
      }
    }

    // HR: CHỈ ĐỔI MẬT KHẨU TẠI ĐÂY
    // Không hiển thị khu vực quản lý tài khoản

  } catch (error) {
    console.error(
      "Lỗi tải trang tài khoản:",
      error
    );

    notice(
      "passwordNotice",
      "Lỗi tải dữ liệu: " + error.message
    );
  }
}

// ========================================
// CHẠY SAU KHI TRANG TẢI XONG
// ========================================

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
} else {
  init();
}
