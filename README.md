# HRM Workspace - Hệ thống quản lý nhân sự

## 1. Giới thiệu

Dự án triển khai hệ thống quản lý nhân sự HRM bằng Docker Compose, tích hợp cơ sở dữ liệu PostgreSQL, Nginx Reverse Proxy, hệ thống giám sát Prometheus + Grafana và hệ thống log tập trung Loki + Promtail.

**Môn học:** Triển khai và Quản trị Hệ thống Phần mềm.

**Mục tiêu:** Triển khai, quản trị, giám sát và bảo mật cơ bản cho hệ thống phần mềm chạy trên Docker.

## 2. Công nghệ sử dụng

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js
- Database: PostgreSQL 16
- Quản lý cơ sở dữ liệu: pgAdmin 4
- Reverse Proxy: Nginx
- Monitoring: Prometheus, Grafana, cAdvisor
- Exporters: PostgreSQL Exporter, Nginx Exporter
- Logging: Loki, Promtail
- Containerization: Docker Compose
- Quản lý mã nguồn: Git và GitHub

## 3. Kiến trúc hệ thống

```text
Người dùng
    |
    v
Nginx (Port 8080)
    |
    +----> Frontend (HTML/CSS/JS)
    |
    v
Backend Node.js
    |
    v
PostgreSQL <---- pgAdmin


cAdvisor / Nginx Exporter / PostgreSQL Exporter
                 |
                 v
             Prometheus
                 |
                 v
               Grafana


Docker Container Logs
        |
        v
     Promtail
        |
        v
       Loki
        |
        v
  Grafana Explore
```

Hệ thống được chia thành ba mạng Docker:

- `hrm-frontend`: Kết nối Nginx và Backend.
- `hrm-database`: Kết nối Backend, PostgreSQL và các dịch vụ cần truy cập cơ sở dữ liệu.
- `hrm-monitoring`: Kết nối những dịch vụ giám sát.

## 4. Hướng dẫn triển khai

### 4.1. Yêu cầu

- Windows có Docker Desktop
- Docker Compose
- Git
- VS Code (khuyến nghị)

### 4.2. Tải mã nguồn

```bash
git clone https://github.com/DTC245200616/HRM-Project.git
cd HRM-Project
```

### 4.3. Thiết lập môi trường

Tạo file `.env` từ `.env.example`:

```powershell
Copy-Item .env.example .env
```

Mở `.env` và thay các giá trị mẫu bằng mật khẩu và JWT secret đủ mạnh.

### 4.4. Khởi động hệ thống

```powershell
docker compose up -d --build
```

Kiểm tra trạng thái container:

```powershell
docker compose ps
```

Dự án có 11 dịch vụ Docker.

**Lưu ý:** Không chạy `docker compose down -v` nếu cần giữ dữ liệu PostgreSQL, Grafana và Loki.

## 5. Địa chỉ truy cập

**Quan trọng:** Các đường dẫn dưới đây chỉ hoạt động trên máy tính đang chạy dự án bằng Docker Compose. Chúng không phải website được triển khai công khai trên Internet.

| Dịch vụ | Địa chỉ |
|---|---|
| HRM Website | http://localhost:8080/login.html |
| pgAdmin | http://localhost:5050 |
| Prometheus Targets | http://localhost:9090/targets |
| Grafana | http://localhost:3001 |
| Loki Health Check | http://localhost:3100/ready |

Loki không có giao diện web tại `http://localhost:3100`. Truy cập đường dẫn gốc có thể nhận `404 page not found`, đây là hiện tượng bình thường.

**Để xem log Loki:** Mở Grafana → Explore → Chọn Loki.

Backend không được công khai trực tiếp qua cổng máy chủ mà được truy cập thông qua Nginx.

## 6. Monitoring - Prometheus và Grafana

Prometheus thu thập dữ liệu từ bốn nhóm:

1. cAdvisor: Theo dõi CPU và RAM container.
2. Nginx Exporter: Theo dõi thông số Nginx.
3. PostgreSQL Exporter: Theo dõi hoạt động database.
4. Prometheus: Tự giám sát.

Dashboard Grafana có tên **HRM Monitoring**, bao gồm bốn biểu đồ:

- Trạng thái dịch vụ
- CPU Container
- RAM Container
- PostgreSQL Connections

**Kết quả kiểm thử:** 4/4 Prometheus Targets ở trạng thái UP.

Cấu hình:

- `prometheus/prometheus.yml`
- `grafana/hrm-monitoring.json`

## 7. Logging - Loki và Promtail

Promtail thu thập log của các container HRM và gửi đến Loki để lưu trữ, truy vấn tập trung.

Các truy vấn LogQL phục vụ demo:

### Truy vấn 1: Xem toàn bộ log HRM

```logql
{job="hrm-docker"}
```

### Truy vấn 2: Xem log Backend

```logql
{job="hrm-docker", container="hrm-backend"}
```

### Truy vấn 3: Tìm dòng log chứa từ khóa lỗi

```logql
{job="hrm-docker"} |~ "(?i)error|failed|exception"
```

Đây là bộ lọc theo từ khóa; không phải mọi kết quả đều là lỗi thực sự.

Chi tiết xem tại `promtail/logql-queries.md`.

## 8. Hardening bảo mật

### 8.1. Các biện pháp đã áp dụng

- Backend chạy bằng user `node`, không phải root.
- Giới hạn Backend sử dụng tối đa 512 MB RAM.
- Giới hạn Backend sử dụng 1 CPU.
- Bật `no-new-privileges`.
- Phân tách mạng thành `hrm-frontend`, `hrm-database` và `hrm-monitoring`.
- Chỉ publish các cổng cần dùng trên `127.0.0.1`.
- Sử dụng Security Headers trong Nginx.
- Đưa `.env` vào `.gitignore` để tránh commit mật khẩu.
- Tạo `.env.example` làm cấu hình mẫu.

### 8.2. Giới hạn bảo mật

- cAdvisor vẫn có `privileged: true`.
- Promtail vẫn truy cập Docker socket.
- Secrets được truyền qua biến môi trường, chưa sử dụng secret manager chuyên dụng.
- Cấu hình dành cho môi trường thực hành cục bộ, chưa đạt đầy đủ yêu cầu production.

## 9. Kiểm thử hệ thống

### 9.1. Kiểm tra API

Mở PowerShell và chạy:

```powershell
cd D:\HRM-Project
Invoke-RestMethod http://localhost:8080/api/health
```

Kết quả kiểm thử:

```text
status   database
------   --------
ok       connected
```

### 9.2. Kiểm tra Docker

```powershell
docker compose ps
```

Kết quả: 11 container chạy, PostgreSQL Healthy.

### 9.3. Kiểm tra Non-root

```powershell
docker compose exec backend id
```

Kết quả:

```text
uid=1000(node) gid=1000(node) groups=1000(node)
```

### 9.4. Kiểm tra giới hạn tài nguyên

```powershell
docker inspect hrm-backend --format '{{.HostConfig.Memory}}'
docker inspect hrm-backend --format '{{.HostConfig.NanoCpus}}'
```

Kết quả:

```text
536870912
1000000000
```

Tương đương 512 MB RAM và 1 CPU.

### 9.5. Kiểm tra mạng Docker

```powershell
docker network ls
```

Các mạng được sử dụng:

- `hrm-project_hrm-frontend`
- `hrm-project_hrm-database`
- `hrm-project_hrm-monitoring`

### 9.6. Kết quả giám sát và Logging

- Prometheus: 4/4 Targets UP.
- Grafana: Dashboard hiển thị dữ liệu.
- Loki: Truy vấn LogQL trả về log container.

## 10. Lịch sử commit

| Commit | Nội dung |
|---|---|
| `caa24b1` | Triển khai Docker + Nginx |
| `a9e69f4` | Tích hợp Prometheus + Grafana |
| `052d985` | Tích hợp Loki + Promtail |
| `7c34033` | Hardening bảo mật |
| `450ed3e` | Bổ sung README hướng dẫn dự án |

Các thay đổi README về sau được ghi nhận bằng những commit tài liệu bổ sung.

## 11. Thông tin dự án

**Tên dự án:** HRM Workspace - Hệ thống quản lý nhân sự

**Môn học:** Triển khai và Quản trị Hệ thống Phần mềm

**Mã sinh viên:** DTC245200616

**GitHub:** https://github.com/DTC245200616/HRM-Project

## 12. Kết luận

Dự án đã triển khai hệ thống HRM với Docker Compose, PostgreSQL, Nginx, Prometheus, Grafana, Loki và Promtail.

Hệ thống đã được kiểm thử các chức năng triển khai, giám sát, thu thập log và bảo mật cơ bản. Mã nguồn và cấu hình được quản lý trên GitHub với lịch sử commit rõ ràng, phục vụ quá trình thực hành và demo môn học.