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
