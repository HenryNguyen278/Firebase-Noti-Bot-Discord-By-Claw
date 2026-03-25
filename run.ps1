$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "Starting deploy: Firebase Remote Config -> Discord notifier"
.\deploy.ps1
