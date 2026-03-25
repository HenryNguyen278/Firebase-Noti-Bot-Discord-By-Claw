# Firebase Remote Config → Discord Notifier

Auto-send Discord notifications when Firebase Remote Config changes, including parameter-level diff (`old -> new`).

> This project was built with OpenClaw Code support, but **you do NOT need to install OpenClaw** (or any OpenClaw tools) to use it.

Demo video: https://youtu.be/xN7IySsxPiM

## Architecture (stable mode)

This project runs as an **auto bot** with a fixed schedule:

- Every **60 seconds (1 minute)**, Cloud Scheduler triggers the function.
- The function fetches Firebase Remote Config data.
- It compares the latest template with the previous snapshot in GCS.
- If there is any change, it sends a diff notification to Discord.

No dependency on Audit Logs sink.

## Quick start (PowerShell)

1) Fill `.env` (from `.env.example`).

2) Run once (replace with your real local path):

```powershell
cd <YOUR_LOCAL_PATH>\firebase-remoteconfig-discord-notifier
.\run.ps1
```

That command will:
- Enable required Google APIs
- Create bucket (if needed)
- Deploy Cloud Function (`onRemoteConfigScheduler`)
- Create/update Cloud Scheduler job (default every 1 minute)

## Check what is running

```powershell
.\status.ps1
```

It prints:
- Function state
- Scheduler job state + last attempt
- Recent service logs

## Tail logs manually

```powershell
gcloud run services logs read onremoteconfigscheduler --region=asia-southeast1 --project=<PROJECT_ID> --limit=100
```

## Notes

- First run creates initial snapshot and sends "Initial snapshot created".
- Diff compares parameter default values, conditional values, and top-level condition rules (add/remove/expression changes).
- Runtime uses `nodejs22`.

---

## Setup on a new machine

### 1) Install required tools

#### Windows (PowerShell)
```powershell
winget install Google.CloudSDK
```

Open a new PowerShell and verify:
```powershell
gcloud --version
```

### 2) Login to Google Cloud

```powershell
gcloud auth login
gcloud auth application-default login
```

> `auth login` is for gcloud CLI, `application-default` is for Google SDK calls used by the app.

### 3) Get source code and prepare `.env`

If you don't have the source on this machine yet:

```powershell
git clone https://github.com/HenryNguyen278/Firebase-Noti-Bot-Discord.git
cd Firebase-Noti-Bot-Discord
```

If you already have source locally, just `cd` to your real local folder:

```powershell
cd <YOUR_LOCAL_PATH>\firebase-remoteconfig-discord-notifier
```

Create/update `.env`:

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

### 4) One-command deploy

```powershell
.\run.ps1
```

The script will:
- enable required APIs
- create bucket (if needed)
- deploy `onRemoteConfigScheduler`
- create/update Cloud Scheduler job

If prompted `Would you like to enable and retry (y/N)?`, choose `y`.

### 5) Check running status

```powershell
.\status.ps1
```

Or read logs directly:
```powershell
gcloud run services logs read onremoteconfigscheduler --region=$env:REGION --project=$env:PROJECT_ID --limit=100
```

### 6) Quick test

1. Open Firebase Remote Config
2. Change one parameter value
3. Publish changes
4. Wait 1-2 minutes
5. Check Discord + logs

### 7) Cost control / pause

Pause scheduler:
```powershell
gcloud scheduler jobs pause remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
```

Resume scheduler:
```powershell
gcloud scheduler jobs resume remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
```

Delete completely:
```powershell
gcloud scheduler jobs delete remote-config-poll-job --location=asia-southeast1 --project=your-gcp-project-id
gcloud functions delete onRemoteConfigScheduler --gen2 --region=asia-southeast1 --project=your-gcp-project-id
```

### 8) Manage via Google Cloud Console (no terminal)

- Cloud Scheduler: https://console.cloud.google.com/cloudscheduler
- Cloud Functions: https://console.cloud.google.com/functions
- Cloud Run: https://console.cloud.google.com/run
- Logs Explorer: https://console.cloud.google.com/logs/query
- Billing: https://console.cloud.google.com/billing

### 9) Security notes

- Never post real Discord webhook URLs publicly.
- If leaked, rotate webhook immediately and redeploy.

### 10) How it works (simple)

- Cloud Scheduler runs every 1 minute
- Function fetches latest Remote Config template
- Compares with snapshot in GCS
- Sends Discord diff when changed

Your local machine can be turned off; cloud still runs.
