
# LogQL Queries - HRM Project

## 1. Xem toàn bộ log hệ thống HRM

```logql
{job="hrm-docker"}
```

Mục đích: Kiểm tra log của các container HRM.

## 2. Xem log Backend Node.js

```logql
{job="hrm-docker", container="hrm-backend"}
```

Mục đích: Theo dõi hoạt động Backend HRM.

## 3. Tìm log có từ khóa lỗi

```logql
{job="hrm-docker"} |~ "(?i)error|failed|exception"
```

Mục đích: Tìm các dòng log chứa từ khóa error, failed hoặc exception.

Lưu ý: Đây là bộ lọc từ khóa, không phải tất cả kết quả đều là lỗi thực sự.
