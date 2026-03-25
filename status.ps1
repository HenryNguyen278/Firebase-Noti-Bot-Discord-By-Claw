$ErrorActionPreference = 'Stop'

Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

Write-Host "== Cloud Function =="
gcloud functions describe onRemoteConfigScheduler --gen2 --region=$env:REGION --project=$env:PROJECT_ID --format="value(name,state,updateTime)"

Write-Host "`n== Cloud Scheduler Job =="
$job = if ($env:SCHEDULER_JOB) { $env:SCHEDULER_JOB } else { 'remote-config-poll-job' }
gcloud scheduler jobs describe $job --location=$env:REGION --project=$env:PROJECT_ID --format="value(name,state,schedule,timeZone,lastAttemptTime)"

Write-Host "`n== Recent Logs =="
gcloud run services logs read onremoteconfigscheduler --region=$env:REGION --project=$env:PROJECT_ID --limit=30
