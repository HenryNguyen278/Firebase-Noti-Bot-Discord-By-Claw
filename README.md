# Firebase Remote Config → Discord Notifier

Auto-send Discord notifications when Firebase Remote Config changes, including parameter-level diff (`old -> new`).

## Architecture (stable mode)

This version uses **Cloud Scheduler polling** (recommended):

1. Cloud Scheduler calls an HTTP Cloud Function every minute.
2. Function fetches latest Remote Config template.
3. Function compares with previous snapshot in GCS.
4. If changed, send diff to Discord.

No dependency on Audit Logs sink.

## Quick start (PowerShell)

1) Fill `.env` (from `.env.example`).

2) Run once:

```powershell
cd C:\Users\Admin\.openclaw\workspace\firebase-remoteconfig-discord-notifier
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
