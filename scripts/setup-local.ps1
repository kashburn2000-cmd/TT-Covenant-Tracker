# ─── One-shot local setup for the Covenant Dashboard (Windows) ───────────────
#
# Does everything in docs/LOCAL_DEV.md steps 1-4:
#   1. Installs Node.js and Git if they're missing (via winget)
#   2. Downloads the project from GitHub
#   3. Installs the project's components
#   4. Installs Claude Code
#
# Safe to re-run: it checks before installing anything, and updates the
# project instead of re-downloading it.
#
# Run it by pasting this one line into PowerShell:
#   irm https://raw.githubusercontent.com/kashburn2000-cmd/TT-Covenant-Tracker/claude/desktop-local-dev-setup-29f4y5/scripts/setup-local.ps1 | iex
#
# (That URL points at the branch this script lives on. Once the branch is
#  merged into main, swap 'claude/desktop-local-dev-setup-29f4y5' for 'main'.)
#
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

$RepoUrl = 'https://github.com/kashburn2000-cmd/TT-Covenant-Tracker.git'
$Target  = Join-Path $HOME 'TT-Covenant-Tracker'

function Say([string]$msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok([string]$msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "    !   $msg" -ForegroundColor Yellow }

# Pull the freshly-installed tools into this session's PATH without a reboot.
function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Have([string]$name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# $ErrorActionPreference does not apply to external programs like git and npm,
# so their exit codes have to be checked by hand. Without this, a failed
# download would sail on and fail confusingly several steps later.
function Assert-Ok([string]$what) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host "    FAILED: $what (exit code $LASTEXITCODE)" -ForegroundColor Red
        Write-Host '    Nothing further was changed. Send the message above to Claude.' -ForegroundColor Red
        Write-Host ''
        exit 1
    }
}

Write-Host ''
Write-Host '  Covenant Dashboard - local setup' -ForegroundColor White
Write-Host '  --------------------------------' -ForegroundColor DarkGray

# ─── Step 1: Node.js and Git ─────────────────────────────────────────────────
Say 'Checking for Node.js and Git'

$hasWinget = Have 'winget'
$missing = @()
if (-not (Have 'node')) { $missing += 'OpenJS.NodeJS.LTS' }
if (-not (Have 'git'))  { $missing += 'Git.Git' }

if ($missing.Count -eq 0) {
    Ok "Node.js $(node --version) and $(git --version)"
} elseif (-not $hasWinget) {
    Warn 'Node.js and/or Git are missing, and winget is not available.'
    Write-Host ''
    Write-Host '    Install these by hand, then re-run this script:' -ForegroundColor Yellow
    Write-Host '      Node.js (take the LTS button):  https://nodejs.org'
    Write-Host '      Git:                            https://git-scm.com/download/win'
    Write-Host ''
    return
} else {
    foreach ($pkg in $missing) {
        Say "Installing $pkg (this takes a few minutes)"
        winget install --id $pkg --silent --accept-source-agreements --accept-package-agreements
    }
    Refresh-Path
    if (-not (Have 'node') -or -not (Have 'git')) {
        Warn 'Installed, but this window cannot see them yet.'
        Write-Host '    Close PowerShell, open a new one, and run this script again.' -ForegroundColor Yellow
        return
    }
    Ok "Node.js $(node --version) and $(git --version)"
}

# ─── Step 2: the project ─────────────────────────────────────────────────────
if (Test-Path (Join-Path $Target '.git')) {
    Say 'Project already downloaded - updating it'
    Push-Location $Target
    git pull
    Assert-Ok 'updating the project'
    Pop-Location
    Ok $Target
} else {
    Say 'Downloading the project from GitHub'
    Write-Host '    A browser may open asking you to sign in to GitHub. That is expected.' -ForegroundColor DarkGray
    git clone $RepoUrl $Target
    Assert-Ok 'downloading the project from GitHub'
    Ok $Target
}

Push-Location $Target

# ─── Step 3: project components ──────────────────────────────────────────────
Say 'Installing the project components (a few minutes the first time)'
npm install --no-audit --no-fund
Assert-Ok 'installing the project components'
Ok 'Components installed'

# ─── Step 4: Claude Code ─────────────────────────────────────────────────────
if (Have 'claude') {
    Ok 'Claude Code is already installed'
} else {
    Say 'Installing Claude Code'
    npm install -g @anthropic-ai/claude-code --no-audit --no-fund
    Assert-Ok 'installing Claude Code'
    Refresh-Path
    if (Have 'claude') { Ok 'Claude Code installed' }
    else { Warn 'Installed, but not visible until you open a new PowerShell window.' }
}

# ─── Quick proof it all works ────────────────────────────────────────────────
Say 'Checking the project is healthy (running its built-in tests)'
npm test
if ($LASTEXITCODE -ne 0) {
    Warn 'Some tests did not pass. Setup is still fine - mention this to Claude.'
}

Pop-Location

Write-Host ''
Write-Host '  Done.' -ForegroundColor Green
Write-Host ''
Write-Host '  Next, run these two lines:' -ForegroundColor White
Write-Host ''
Write-Host "      cd `"$Target`"" -ForegroundColor Cyan
Write-Host '      claude' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Then type this to Claude:' -ForegroundColor White
Write-Host ''
Write-Host '      Read docs/LOCAL_DEV.md and start the site so I can look at it.' -ForegroundColor Cyan
Write-Host ''
