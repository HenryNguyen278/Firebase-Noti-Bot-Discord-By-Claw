# Setup trên máy mới (đã có sẵn project)

Tài liệu này dành cho trường hợp đã có project `firebase-remoteconfig-discord-notifier` và muốn chạy lại trên máy khác.

---

## 1) Cài công cụ cần thiết

### Windows (PowerShell)
```powershell
winget install Google.CloudSDK
```

Mở PowerShell mới, kiểm tra:
```powershell
gcloud --version
```

---

## 2) Đăng nhập Google Cloud

```powershell
gcloud auth login
gcloud auth application-default login
```

> `auth login` cho CLI, `application-default` cho code/thư viện Google khi cần.

---

## 3) Mở project và chuẩn bị `.env`

```powershell
cd C:\Users\Admin\.openclaw\workspace\firebase-remoteconfig-discord-notifier
```

Tạo/cập nhật file `.env`:

```env
PROJECT_ID=your-gcp-project-id
REGION=asia-southeast1
BUCKET=your-gcp-project-id-rc-snapshots
WEBHOOK=https://discord.com/api/webhooks/xxx/yyy

# Optional
SCHEDULER_JOB=remote-config-poll-job
SCHEDULER_CRON=*/1 * * * *
SCHEDULER_TZ=Asia/Ho_Chi_Minh
```

---

## 4) Deploy một lệnh

```powershell
.\run.ps1
```

Script sẽ tự:
- enable các API cần thiết
- tạo bucket (nếu chưa có)
- deploy function `onRemoteConfigScheduler`
- tạo/cập nhật Cloud Scheduler job chạy định kỳ

> Nếu thấy prompt `Would you like to enable and retry (y/N)?` thì chọn `y`.

---

## 5) Kiểm tra hệ thống đang chạy

```powershell
.\status.ps1
```

Hoặc xem log trực tiếp:
```powershell
gcloud run services logs read onremoteconfigscheduler --region=$env:REGION --project=$env:PROJECT_ID --limit=100
```

---

## 6) Test nhanh

1. Vào Firebase Remote Config
2. Đổi 1 parameter value
3. Publish changes
4. Chờ 1-2 phút (theo lịch scheduler)
5. Kiểm tra Discord + logs

---

## 7) Quản lý chi phí / tắt tạm

### Tắt tạm scheduler
```powershell
gcloud scheduler jobs pause remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
```

### Bật lại
```powershell
gcloud scheduler jobs resume remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
```

### Xóa hẳn
```powershell
gcloud scheduler jobs delete remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
gcloud functions delete onRemoteConfigScheduler --gen2 --region=asia-southeast1 --project=your-gcp-project-id
```

---

## 8) Xem trực quan trên Google Cloud Console (không dùng terminal)

- Cloud Scheduler: https://console.cloud.google.com/cloudscheduler
- Cloud Functions: https://console.cloud.google.com/functions
- Cloud Run: https://console.cloud.google.com/run
- Logs Explorer: https://console.cloud.google.com/logs/query
- Billing: https://console.cloud.google.com/billing

---

## 9) Lưu ý bảo mật

- Không paste Discord webhook công khai.
- Nếu lỡ lộ webhook, hãy **rotate** (xóa webhook cũ, tạo webhook mới, cập nhật `.env`, deploy lại).

---

## 10) Ý tưởng hoạt động (dễ hiểu)

- Cloud Scheduler chạy mỗi 1 phút trên Google Cloud
- Function lấy Remote Config mới nhất
- So sánh với snapshot cũ trong GCS
- Nếu có thay đổi thì gửi diff lên Discord

=> Máy local có thể tắt, hệ thống vẫn chạy trên cloud bình thường.
