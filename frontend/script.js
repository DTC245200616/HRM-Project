
const API_URL = "/api";
const $ = id => document.getElementById(id);

let employees = [];
let departments = [];
let attendanceRecords = [];

const statusLabels = {
  present: "Có mặt",
  late: "Đi muộn",
  absent: "Vắng mặt"
};

const sectionTitles = {
  dashboard: "Tổng quan",
  employees: "Nhân viên",
  departments: "Phòng ban",
  attendance: "Chấm công"
};

// ========================================
// ĐĂNG NHẬP VÀ ĐĂNG XUẤT
// ========================================

if (!sessionStorage.getItem("hrm_token")) {
  window.location.replace("./login.html");
}

function logout() {
  sessionStorage.removeItem("hrm_token");
  sessionStorage.removeItem("hrm_user");
  window.location.replace("./login.html");
}

// ========================================
// API QUA NGINX
// ========================================

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(API_URL + path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization:
          "Bearer " + sessionStorage.getItem("hrm_token")
      }
    });
  } catch {
    throw new Error(
      "Không kết nối được Backend qua Nginx"
    );
  }

  if (response.status === 401) {
    logout();
    throw new Error("Phiên đăng nhập không hợp lệ");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "Yêu cầu thất bại");
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
// POPUP THÔNG BÁO
// ========================================

function showPopup(message, isConfirm = false) {
  return new Promise(resolve => {
    const popup = $("customPopup");
    const title = $("popupTitle");
    const msg = $("popupMessage");
    const ok = $("popupOk");
    const cancel = $("popupCancel");

    if (!popup) {
      if (isConfirm) {
        resolve(confirm(message));
      } else {
        alert(message);
        resolve(true);
      }
      return;
    }

    title.textContent = isConfirm
      ? "Xác nhận thao tác"
      : "Thông báo";

    msg.textContent = message;
    cancel.hidden = !isConfirm;
    popup.hidden = false;

    const previous = document.activeElement;
    let finished = false;

    function finish(value) {
      if (finished) return;

      finished = true;
      popup.hidden = true;

      ok.removeEventListener("click", yes);
      cancel.removeEventListener("click", no);
      document.removeEventListener("keydown", onKey);

      if (previous?.isConnected) {
        previous.focus();
      }

      resolve(value);
    }

    function yes() {
      finish(true);
    }

    function no() {
      finish(false);
    }

    function onKey(event) {
      if (event.key === "Escape") {
        finish(false);
      }
    }

    ok.addEventListener("click", yes);
    cancel.addEventListener("click", no);
    document.addEventListener("keydown", onKey);

    ok.focus();
  });
}

// ========================================
// HÀM HỖ TRỢ
// ========================================

function localISODate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function tableMessage(id, columns, message) {
  const body = $(id);

  body.replaceChildren();

  const cell = body.insertRow().insertCell();

  cell.colSpan = columns;
  cell.textContent = message;
  cell.style.textAlign = "center";
  cell.style.padding = "30px";
}

function addValues(row, values) {
  values.forEach((value, index) => {
    const cell = row.insertCell();

    if (index === 0) {
      const span = document.createElement("span");

      span.className = "id-chip";
      span.textContent = "#" + value;

      cell.append(span);
    } else {
      cell.textContent = value ?? "—";
    }
  });
}

function rowActions(row, onEdit, onDelete) {
  const cell = row.insertCell();
  const group = document.createElement("div");

  group.className = "row-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "action-btn";
  edit.textContent = "Sửa";
  edit.onclick = onEdit;

  const del = document.createElement("button");
  del.type = "button";
  del.className = "action-btn danger";
  del.textContent = "Xóa";
  del.onclick = onDelete;

  group.append(edit, del);
  cell.append(group);
}

// ========================================
// THỐNG KÊ DASHBOARD
// ========================================

function refreshStats() {
  $("statEmployees").textContent = employees.length;
  $("statDepartments").textContent = departments.length;

  const today = localISODate();

  $("statToday").textContent = attendanceRecords.filter(
    a => a.work_date === today
  ).length;

  $("statLate").textContent = attendanceRecords.filter(
    a => a.work_date === today && a.status === "late"
  ).length;
}

// ========================================
// CHUYỂN MỤC DASHBOARD
// ========================================

function showSection(id) {
  if (!sectionTitles[id]) return;

  document.querySelectorAll(".page-section").forEach(el => {
    el.hidden = el.id !== id;
  });

  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle(
      "active",
      el.dataset.section === id
    );
  });

  $("pageTitle").textContent = sectionTitles[id];
  $("sidebar").classList.remove("open");

  if (id === "employees") {
    loadDepartments().then(() => loadEmployees());
  } else if (id === "departments") {
    loadDepartments();
  } else if (id === "attendance") {
    loadAttendance();
  } else {
    loadAll();
  }
}

// ========================================
// QUẢN LÝ NHÂN VIÊN
// ========================================

async function loadEmployees() {
  try {
    const data = await apiRequest("/employees");

    if (!Array.isArray(data)) {
      throw new Error(
        "Dữ liệu nhân viên không hợp lệ"
      );
    }

    employees = data;
    renderEmployees();
    refreshStats();

    return true;
  } catch (error) {
    tableMessage(
      "employeeTable",
      8,
      "Lỗi tải nhân viên: " + error.message
    );

    return false;
  }
}

function renderEmployees() {
  const search = $("searchInput").value
    .trim()
    .toLowerCase();

  const list = employees.filter(employee =>
    [employee.full_name, employee.email].some(value =>
      String(value || "")
        .toLowerCase()
        .includes(search)
    )
  );

  $("employeeCount").textContent =
    list.length + " nhân viên";

  $("employeeTable").replaceChildren();

  if (!list.length) {
    tableMessage(
      "employeeTable",
      8,
      search
        ? "Không tìm thấy nhân viên"
        : "Không có nhân viên"
    );
    return;
  }

  list.forEach(employee => {
    const row = $("employeeTable").insertRow();

    addValues(row, [
      employee.id,
      employee.full_name,
      employee.email,
      employee.phone,
      employee.position,
      Number(employee.salary || 0)
        .toLocaleString("vi-VN") + " đ",
      employee.department
    ]);

    row.cells[1].classList.add("name-cell");

    rowActions(
      row,
      () => openEditForm(employee.id),
      () => deleteEmployee(employee.id)
    );
  });
}

function openAddForm() {
  $("employeeForm").reset();
  $("employeeId").value = "";

  $("formTitle").textContent = "Thêm nhân viên";
  $("formContainer").hidden = false;

  $("fullName").focus();
}

async function openEditForm(id) {
  const employee = employees.find(
    item => Number(item.id) === Number(id)
  );

  if (!employee) return;

  try {
    await loadDepartments();

    $("employeeId").value = employee.id;
    $("fullName").value = employee.full_name;
    $("email").value = employee.email;
    $("phone").value = employee.phone || "";
    $("position").value = employee.position || "";
    $("salary").value = employee.salary;

    $("departmentId").value =
      employee.department_id ?? "";

    $("formTitle").textContent = "Sửa nhân viên";
    $("formContainer").hidden = false;

    $("formContainer").scrollIntoView({
      behavior: "smooth"
    });
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

function closeForm() {
  $("formContainer").hidden = true;
}

async function saveEmployee(event) {
  event.preventDefault();

  const id = $("employeeId").value;

  const data = {
    full_name: $("fullName").value.trim(),
    email: $("email").value.trim(),
    phone: $("phone").value.trim(),
    position: $("position").value.trim(),
    salary: $("salary").value,
    department_id: $("departmentId").value
  };

  try {
    await apiRequest(
      id ? `/employees/${id}` : "/employees",
      jsonOptions(
        id ? "PUT" : "POST",
        data
      )
    );

    closeForm();
    await loadEmployees();

    await showPopup(
      id
        ? "Sửa nhân viên thành công!"
        : "Thêm nhân viên thành công!"
    );
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

async function deleteEmployee(id) {
  const confirmed = await showPopup(
    "Bạn chắc chắn muốn xóa nhân viên?",
    true
  );

  if (!confirmed) return;

  try {
    await apiRequest(
      `/employees/${id}`,
      { method: "DELETE" }
    );

    await loadEmployees();
    await showPopup("Đã xóa nhân viên");
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

// ========================================
// QUẢN LÝ PHÒNG BAN
// ========================================

async function loadDepartments() {
  try {
    const data = await apiRequest("/departments");

    if (!Array.isArray(data)) {
      throw new Error(
        "Dữ liệu phòng ban không hợp lệ"
      );
    }

    departments = data;

    const select = $("departmentId");
    const selected = select.value;

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Chọn phòng ban";

    select.append(placeholder);

    data.forEach(department => {
      const option = document.createElement("option");

      option.value = department.id;
      option.textContent = department.name;

      select.append(option);
    });

    if (data.some(
      d => String(d.id) === selected
    )) {
      select.value = selected;
    }

    renderDepartments();
    refreshStats();

    return true;
  } catch (error) {
    tableMessage(
      "departmentTable",
      4,
      "Lỗi tải phòng ban: " + error.message
    );

    return false;
  }
}

function renderDepartments() {
  const search = $("departmentSearch").value
    .trim()
    .toLowerCase();

  const list = departments.filter(department =>
    [department.name, department.description].some(value =>
      String(value || "")
        .toLowerCase()
        .includes(search)
    )
  );

  $("departmentCount").textContent =
    list.length + " phòng ban";

  $("departmentTable").replaceChildren();

  if (!list.length) {
    tableMessage(
      "departmentTable",
      4,
      search
        ? "Không tìm thấy phòng ban"
        : "Không có phòng ban"
    );
    return;
  }

  list.forEach(department => {
    const row = $("departmentTable").insertRow();

    addValues(row, [
      department.id,
      department.name,
      department.description
    ]);

    row.cells[1].classList.add("name-cell");

    rowActions(
      row,
      () => openEditDepartment(department.id),
      () => deleteDepartment(department.id)
    );
  });
}

function openAddDepartment() {
  $("departmentForm").reset();

  $("editDepartmentId").value = "";
  $("departmentFormTitle").textContent =
    "Thêm phòng ban";

  $("departmentFormContainer").hidden = false;
  $("departmentName").focus();
}

function openEditDepartment(id) {
  const department = departments.find(
    item => Number(item.id) === Number(id)
  );

  if (!department) return;

  $("editDepartmentId").value = department.id;
  $("departmentName").value = department.name;

  $("departmentDescription").value =
    department.description || "";

  $("departmentFormTitle").textContent =
    "Sửa phòng ban";

  $("departmentFormContainer").hidden = false;

  $("departmentFormContainer").scrollIntoView({
    behavior: "smooth"
  });
}

function closeDepartmentForm() {
  $("departmentFormContainer").hidden = true;
}

async function saveDepartment(event) {
  event.preventDefault();

  const id = $("editDepartmentId").value;

  const data = {
    name: $("departmentName").value.trim(),
    description: $("departmentDescription").value.trim()
  };

  try {
    await apiRequest(
      id ? `/departments/${id}` : "/departments",
      jsonOptions(
        id ? "PUT" : "POST",
        data
      )
    );

    closeDepartmentForm();

    await loadDepartments();
    await loadEmployees();

    await showPopup(
      id
        ? "Sửa phòng ban thành công!"
        : "Thêm phòng ban thành công!"
    );
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

async function deleteDepartment(id) {
  const confirmed = await showPopup(
    "Bạn chắc chắn muốn xóa phòng ban?",
    true
  );

  if (!confirmed) return;

  try {
    await apiRequest(
      `/departments/${id}`,
      { method: "DELETE" }
    );

    await loadDepartments();
    await loadEmployees();

    await showPopup("Đã xóa phòng ban");
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

// ========================================
// QUẢN LÝ CHẤM CÔNG
// ========================================

async function loadAttendance() {
  try {
    const data = await apiRequest("/attendance");

    if (!Array.isArray(data)) {
      throw new Error(
        "Dữ liệu chấm công không hợp lệ"
      );
    }

    attendanceRecords = data;

    renderAttendance();
    refreshStats();

    return true;
  } catch (error) {
    tableMessage(
      "attendanceTable",
      7,
      "Lỗi tải chấm công: " + error.message
    );

    return false;
  }
}

function renderAttendance() {
  const search = $("attendanceSearch").value
    .trim()
    .toLowerCase();

  const month = $("attendanceMonth").value;

  const list = attendanceRecords.filter(record =>
    String(record.employee_name || "")
      .toLowerCase()
      .includes(search) &&
    (
      !month ||
      String(record.work_date).startsWith(month)
    )
  );

  $("attendanceCount").textContent =
    list.length + " bản ghi";

  $("attendanceTable").replaceChildren();

  if (!list.length) {
    tableMessage(
      "attendanceTable",
      7,
      "Không có dữ liệu chấm công"
    );
    return;
  }

  list.forEach(record => {
    const row = $("attendanceTable").insertRow();

    addValues(row, [
      record.id,
      record.employee_name,
      record.work_date,
      record.check_in || "—",
      record.check_out || "—"
    ]);

    row.cells[1].classList.add("name-cell");

    const statusCell = row.insertCell();
    const badge = document.createElement("span");

    badge.className =
      "status-badge " + record.status;

    badge.textContent =
      statusLabels[record.status] ||
      record.status;

    statusCell.append(badge);

    rowActions(
      row,
      () => openEditAttendance(record.id),
      () => deleteAttendance(record.id)
    );
  });
}

function clearAttendanceFilter() {
  $("attendanceSearch").value = "";
  $("attendanceMonth").value = "";

  renderAttendance();
}

async function updateAttendanceEmployeeSelect() {
  const data = await apiRequest("/employees");
  const select = $("attendanceEmployee");

  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Chọn nhân viên";

  select.append(placeholder);

  data.forEach(employee => {
    const option = document.createElement("option");

    option.value = employee.id;
    option.textContent = employee.full_name;

    select.append(option);
  });
}

function updateAttendanceTimeInputs() {
  const absent = $("attendanceStatus").value === "absent";

  $("checkIn").disabled = absent;
  $("checkOut").disabled = absent;

  if (absent) {
    $("checkIn").value = "";
    $("checkOut").value = "";
  }
}

async function openAddAttendance() {
  $("attendanceForm").reset();

  $("attendanceId").value = "";
  $("attendanceFormTitle").textContent =
    "Thêm chấm công";

  try {
    await updateAttendanceEmployeeSelect();

    $("workDate").value = localISODate();
    $("attendanceStatus").value = "present";

    updateAttendanceTimeInputs();

    $("attendanceFormContainer").hidden = false;
    $("attendanceEmployee").focus();
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

async function openEditAttendance(id) {
  const record = attendanceRecords.find(
    item => Number(item.id) === Number(id)
  );

  if (!record) return;

  try {
    await updateAttendanceEmployeeSelect();

    $("attendanceId").value = record.id;
    $("attendanceEmployee").value = record.employee_id;
    $("workDate").value = record.work_date;
    $("checkIn").value = record.check_in || "";
    $("checkOut").value = record.check_out || "";
    $("attendanceStatus").value = record.status;

    updateAttendanceTimeInputs();

    $("attendanceFormTitle").textContent =
      "Sửa chấm công";

    $("attendanceFormContainer").hidden = false;

    $("attendanceFormContainer").scrollIntoView({
      behavior: "smooth"
    });
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

function closeAttendanceForm() {
  $("attendanceFormContainer").hidden = true;
}

async function saveAttendance(event) {
  event.preventDefault();

  const id = $("attendanceId").value;

  const data = {
    employee_id: $("attendanceEmployee").value,
    work_date: $("workDate").value,

    check_in: $("checkIn").disabled
      ? null
      : ($("checkIn").value || null),

    check_out: $("checkOut").disabled
      ? null
      : ($("checkOut").value || null),

    status: $("attendanceStatus").value
  };

  try {
    await apiRequest(
      id ? `/attendance/${id}` : "/attendance",
      jsonOptions(
        id ? "PUT" : "POST",
        data
      )
    );

    closeAttendanceForm();
    await loadAttendance();

    await showPopup(
      id
        ? "Sửa chấm công thành công!"
        : "Thêm chấm công thành công!"
    );
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

async function deleteAttendance(id) {
  const confirmed = await showPopup(
    "Bạn chắc chắn muốn xóa chấm công?",
    true
  );

  if (!confirmed) return;

  try {
    await apiRequest(
      `/attendance/${id}`,
      { method: "DELETE" }
    );

    await loadAttendance();
    await showPopup("Đã xóa chấm công");
  } catch (error) {
    await showPopup("Lỗi: " + error.message);
  }
}

// ========================================
// TẢI TOÀN BỘ DỮ LIỆU
// ========================================

async function loadAll() {
  const results = await Promise.allSettled([
    loadEmployees(),
    loadDepartments(),
    loadAttendance()
  ]);

  const success = results.every(
    item =>
      item.status === "fulfilled" &&
      item.value === true
  );

  $("apiStatus").textContent =
    success ? "Đã kết nối" : "Cần kiểm tra";
}

// ========================================
// KHỞI TẠO VÀ PHÂN QUYỀN
// ========================================

async function init() {
  let user;

  try {
    user = await apiRequest("/auth/me");
  } catch (error) {
    console.error(
      "Không kiểm tra được tài khoản:",
      error
    );

    $("apiStatus").textContent =
      "Lỗi xác thực: " + error.message;

    return;
  }

  // Nhân viên chỉ được vào trang cá nhân
  if (user.role === "employee") {
    window.location.replace("./accounts.html");
    return;
  }

  // Dashboard chỉ dành cho Admin và HR
  if (!["admin", "hr"].includes(user.role)) {
    logout();
    return;
  }

  sessionStorage.setItem(
    "hrm_user",
    JSON.stringify(user)
  );

  // Chỉ Admin nhìn thấy Quản lý tài khoản
  const menu = $("adminAccountsMenu");

  if (menu) {
    const isAdmin = user.role === "admin";

    menu.hidden = !isAdmin;
    menu.style.display = isAdmin ? "flex" : "none";
  }

  // Hiển thị thông tin người dùng
  const name = user.email.split("@")[0];
  const avatar = name.charAt(0).toUpperCase();

  $("sidebarUser").textContent = name;

  $("sidebarRole").textContent =
    user.role === "admin"
      ? "Quản trị viên"
      : "Nhân sự";

  $("sidebarAvatar").textContent = avatar;
  $("topAvatar").textContent = avatar;

  // Sự kiện biểu mẫu
  $("employeeForm").addEventListener(
    "submit",
    saveEmployee
  );

  $("departmentForm").addEventListener(
    "submit",
    saveDepartment
  );

  $("attendanceForm").addEventListener(
    "submit",
    saveAttendance
  );

  // Sự kiện tìm kiếm
  $("searchInput").addEventListener(
    "input",
    renderEmployees
  );

  $("departmentSearch").addEventListener(
    "input",
    renderDepartments
  );

  $("attendanceSearch").addEventListener(
    "input",
    renderAttendance
  );

  // Bộ lọc chấm công
  $("attendanceMonth").addEventListener(
    "change",
    renderAttendance
  );

  $("attendanceStatus").addEventListener(
    "change",
    updateAttendanceTimeInputs
  );

  // Menu trên điện thoại
  $("menuToggle").addEventListener(
    "click",
    () => {
      $("sidebar").classList.toggle("open");
    }
  );

  // Tải dữ liệu sau khi xác thực
  await loadAll();
}

// ========================================
// CHẠY KHI TRANG ĐÃ TẢI
// ========================================

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
} else {
  init();
}
