
# HRM Workspace - Hệ thống quản lý nhân sự

## 1. Giới thiệu

Dự án triển khai hệ thống quản lý nhân sự HRM bằng Docker Compose, tích hợp cơ sở dữ liệu, reverse proxy, giám sát và log tập trung.

Môn học: Triển khai và Quản trị Hệ thống Phần mềm.

## 2. Công nghệ sử dụng

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js
- Database: PostgreSQL 16
- Quản lý CSDL: pgAdmin 4
- Reverse Proxy: Nginx
- Monitoring: Prometheus, Grafana, cAdvisor
- Exporters: PostgreSQL Exporter, Nginx Exporter
- Logging: Loki, Promtail
- Containerization: Docker Compose

## 3. Kiến trúc hệ thống

```text
Người dùng
    |
    v
Nginx (Port 8080)
    |
    v
Frontend / Backend Node.js
               |
               v
          PostgreSQL
               |
               v
             pgAdmin

Prometheus <--- cAdvisor / Nginx Exporter / PostgreSQL Exporter
    |
    v
Grafana

Docker Logs ---> Promtail ---> Loki ---> Grafana
```

## 4. Hướng dẫn triển khai

Yêu cầu:
- Docker Desktop
- Docker Compose
- Git

Clone dự án:

```bash
git clone https://github.com/DTC245200616/HRM-Project.git
cd HRM-Project
```

Tạo file `.env` từ `.env.example` và thay các giá trị mẫu bằng mật khẩu và JWT secret đủ mạnh.

Trên PowerShell:

```powershell
Copy-Item .env.example .env
```

Khởi chạy hệ thống:

```bash
docker compose up -d --build
```

Kiểm tra:

```bash
docker compose ps
```

Lưu ý: Không sử dụng `docker compose down -v` nếu cần giữ dữ liệu.

## 5. Địa chỉ truy cập

| Dịch vụ | Địa chỉ |
|---|---|
| HRM Website | http://localhost:8080 |
| pgAdmin | http://localhost:5050 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Loki API | http://localhost:3100 |

Backend chỉ được Nginx truy cập nội bộ qua Docker network.

## 6. Monitoring

Prometheus thu thập dữ liệu từ:
- cAdvisor: CPU, RAM container
- Nginx Exporter: thông số Nginx
- PostgreSQL Exporter: thông số database
- Prometheus: tự giám sát

Dashboard Grafana: `HRM Monitoring`.

Các biểu đồ:
1. Trạng thái dịch vụ
2. CPU Container
3. RAM Container
4. PostgreSQL Connections

Cấu hình tại:
- `prometheus/prometheus.yml`
- `grafana/hrm-monitoring.json`

## 7. Logging

Promtail thu thập log của các container HRM và gửi đến Loki.

Truy vấn LogQL:

Xem toàn bộ log:

```logql
{job="hrm-docker"}
```

Xem Backend:

```logql
{job="hrm-docker", container="hrm-backend"}
```

Tìm các dòng chứa từ khóa lỗi:

```logql
{job="hrm-docker"} |~ "(?i)error|failed|exception"
```

Chi tiết: `promtail/logql-queries.md`.

## 8. Hardening bảo mật

Các biện pháp đã áp dụng:

- Backend chạy bằng user `node`, không phải root.
- Backend giới hạn RAM 512 MB và CPU 1.0.
- Bật `no-new-privileges`.
- Phân chia 3 Docker network:
  - `hrm-frontend`
  - `hrm-database`
  - `hrm-monitoring`
- Chỉ publish các cổng cần dùng trên `127.0.0.1`.
- Nginx sử dụng security headers.
- Không commit file `.env` lên GitHub.
- Cung cấp `.env.example` không chứa thông tin bí mật.

Giới hạn cần lưu ý:
- cAdvisor vẫn có `privileged: true` để phục vụ giám sát trong môi trường thực hành.
- Promtail được cấp quyền truy cập Docker socket.
- Secrets đang truyền bằng biến môi trường, chưa áp dụng secret manager chuyên dụng.
- Hệ thống cấu hình để chạy thử trên máy cục bộ, chưa phải môi trường production hoàn chỉnh.

## 9. Kiểm thử

Kiểm tra API:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
```

Kết quả đã kiểm tra:

```text
status   database
ok       connected
```

Prometheus: 4/4 Targets UP.

Grafana: Dashboard hiển thị dữ liệu CPU, RAM, trạng thái dịch vụ và kết nối PostgreSQL.

Loki: Truy vấn LogQL trả về log container.

## 10. Lịch sử commit

- Commit 1: Triển khai Docker + Nginx.
- Commit 2: Tích hợp Prometheus + Grafana.
- Commit 3: Tích hợp Loki + Promtail.
- Commit 4: Hardening bảo mật.

## 11. Thông tin dự án

GitHub: https://github.com/DTC245200616/HRM-Project

Mã sinh viên: DTC245200616
