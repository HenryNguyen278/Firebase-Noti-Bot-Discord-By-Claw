# Firebase Remote Config → Discord Notifier

A lightweight auto-bot that checks Firebase Remote Config every **60 seconds** and posts change diffs to Discord.

> Built with OpenClaw Code support. You **do not** need OpenClaw to run this project.

**Demo:** https://youtu.be/xN7IySsxPiM

---

## What this project does

- Runs on a fixed schedule (every 1 minute)
- Fetches the latest Remote Config template
- Compares it with the previous snapshot in Google Cloud Storage
- Sends a Discord notification only when changes are detected

It tracks:
- Parameter default value changes
- Parameter conditional value changes
- Top-level condition changes (add/remove/expression updates)

---

## Architecture

1. **Cloud Scheduler** triggers the function every 60 seconds
2. **Cloud Function (Gen2)** fetches the current Remote Config template
3. Function compares it with the previous snapshot stored in **GCS**
4. If changed, function sends diff output to **Discord Webhook**

This mode does **not** depend on Cloud Logging audit sinks.

---

## Requirements

- Google Cloud project with billing enabled
- Firebase project with Remote Config enabled
- Discord webhook URL
- `gcloud` CLI installed

---

## Quick Start (PowerShell)

### 1) Configure environment

Create `.env` from `.env.example` and fill real values:

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

### 2) Run one command

```powershell
cd <YOUR_LOCAL_PATH>\firebase-remoteconfig-discord-notifier
.\run.ps1
```

`run.ps1` will:
- enable required APIs
- create bucket (if needed)
- deploy function `onRemoteConfigScheduler`
- create/update Cloud Scheduler job

If prompted with `Would you like to enable and retry (y/N)?`, choose `y`.

---

## Setup on a New Machine

### 1) Install gcloud (Windows)

```powershell
winget install Google.CloudSDK
```

Then verify:

```powershell
gcloud --version
```

### 2) Authenticate

```powershell
gcloud auth login
gcloud auth application-default login
```

### 3) Get source code

```powershell
git clone https://github.com/HenryNguyen278/Firebase-Noti-Bot-Discord.git
cd Firebase-Noti-Bot-Discord
```

### 4) Configure `.env` and deploy

Fill `.env`, then run:

```powershell
.\run.ps1
```

---

## Operations

### Check current status

```powershell
.\status.ps1
```

### Read runtime logs

```powershell
gcloud run services logs read onremoteconfigscheduler --region=$env:REGION --project=$env:PROJECT_ID --limit=100
```

### Quick functional test

1. Open Firebase Remote Config
2. Change one value
3. Publish changes
4. Wait 1–2 minutes
5. Check Discord + logs

---

## Cost Control

Pause scheduler:

```powershell
gcloud scheduler jobs pause remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
```

Resume scheduler:

```powershell
gcloud scheduler jobs resume remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
```

Delete all runtime components:

```powershell
gcloud scheduler jobs delete remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
gcloud functions delete onRemoteConfigScheduler --gen2 --region=asia-southeast1 --project=your-gcp-project-id
```

---

## Console Links (UI Management)

- Cloud Scheduler: https://console.cloud.google.com/cloudscheduler
- Cloud Functions: https://console.cloud.google.com/functions
- Cloud Run: https://console.cloud.google.com/run
- Logs Explorer: https://console.cloud.google.com/logs/query
- Billing: https://console.cloud.google.com/billing

---

## Security Notes

- Never publish real Discord webhook URLs
- If a webhook is exposed, rotate it immediately and redeploy

---

## Runtime

- Node.js runtime: `nodejs22`
- First execution creates an initial snapshot and may send `Initial snapshot created`
