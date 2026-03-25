param(
  [switch]$SkipEnableApis
)

$ErrorActionPreference = 'Stop'

function Load-DotEnv {
  param([string]$Path = '.env')
  if (-not (Test-Path $Path)) {
    throw "Missing file: $Path"
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $name, $value = $line -split '=', 2
    [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), 'Process')
  }
}

function Require-Env {
  param([string[]]$Names)
  $missing = @()
  foreach ($n in $Names) {
    if (-not [Environment]::GetEnvironmentVariable($n, 'Process')) {
      $missing += $n
    }
  }
  if ($missing.Count -gt 0) {
    throw "Missing vars in .env: $($missing -join ', ')"
  }
}

Load-DotEnv
Require-Env -Names @('PROJECT_ID', 'REGION', 'BUCKET', 'WEBHOOK')

$PROJECT_ID = $env:PROJECT_ID
$REGION = $env:REGION
$BUCKET = $env:BUCKET
$WEBHOOK = $env:WEBHOOK
$JOB_NAME = if ($env:SCHEDULER_JOB) { $env:SCHEDULER_JOB } else { 'remote-config-poll-job' }
$SCHEDULE = if ($env:SCHEDULER_CRON) { $env:SCHEDULER_CRON } else { '*/1 * * * *' }
$TIMEZONE = if ($env:SCHEDULER_TZ) { $env:SCHEDULER_TZ } else { 'Asia/Ho_Chi_Minh' }

Write-Host "==> PROJECT_ID: $PROJECT_ID"
Write-Host "==> REGION: $REGION"
Write-Host "==> BUCKET: $BUCKET"
Write-Host "==> SCHEDULER_JOB: $JOB_NAME"
Write-Host "==> SCHEDULE: $SCHEDULE"

if (-not $SkipEnableApis) {
  gcloud services enable cloudfunctions.googleapis.com run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com logging.googleapis.com firebaseremoteconfig.googleapis.com storage.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com --project $PROJECT_ID
}

try { gcloud storage buckets create "gs://$BUCKET" --location=$REGION --project $PROJECT_ID | Out-Null } catch { Write-Host "Bucket already exists, skip." }

gcloud functions deploy onRemoteConfigScheduler --gen2 --runtime=nodejs22 --region=$REGION --source=. --entry-point=onRemoteConfigScheduler --trigger-http --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID,DISCORD_WEBHOOK_URL=$WEBHOOK,SNAPSHOT_BUCKET=$BUCKET,SNAPSHOT_OBJECT=remote-config/latest-template.json,MAX_DIFF_LINES=25" --project $PROJECT_ID

$FUNCTION_URL = gcloud functions describe onRemoteConfigScheduler --gen2 --region=$REGION --project=$PROJECT_ID --format='value(serviceConfig.uri)'
$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format='value(projectNumber)'
$SCHEDULER_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

# Allow scheduler service account to invoke function's Cloud Run service
$RUN_SERVICE_NAME = 'onremoteconfigscheduler'
try {
  gcloud run services add-iam-policy-binding $RUN_SERVICE_NAME --region=$REGION --member="serviceAccount:$SCHEDULER_SA" --role='roles/run.invoker' --project $PROJECT_ID | Out-Null
} catch {
  Write-Host "Run invoker binding maybe already exists, continue."
}

# Create or update scheduler job
$exists = $false
try {
  $null = gcloud scheduler jobs describe $JOB_NAME --location=$REGION --project=$PROJECT_ID 2>$null
  $exists = $true
} catch {
  $exists = $false
}

if ($exists) {
  gcloud scheduler jobs update http $JOB_NAME --location=$REGION --project=$PROJECT_ID --schedule="$SCHEDULE" --time-zone="$TIMEZONE" --uri="$FUNCTION_URL" --http-method=POST --oidc-service-account-email="$SCHEDULER_SA" | Out-Null
  Write-Host "Scheduler job updated."
} else {
  gcloud scheduler jobs create http $JOB_NAME --location=$REGION --project=$PROJECT_ID --schedule="$SCHEDULE" --time-zone="$TIMEZONE" --uri="$FUNCTION_URL" --http-method=POST --oidc-service-account-email="$SCHEDULER_SA" | Out-Null
  Write-Host "Scheduler job created."
}

Write-Host "Deploy done. Scheduler will check Remote Config automatically every minute."
Write-Host "To tail logs: gcloud run services logs read onremoteconfigscheduler --region=$REGION --project=$PROJECT_ID --limit=100"
