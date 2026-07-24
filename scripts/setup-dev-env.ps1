# DailySnap 开发环境一键安装脚本 (Windows)
# 使用方式: 在 PowerShell 中执行 .\scripts\setup-dev-env.ps1
# 需要管理员权限（安装 VS Build Tools 时）

Write-Host "================================" -ForegroundColor Cyan
Write-Host " DailySnap 开发环境安装" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# ========================================
# 1. 检查并安装 Visual Studio Build Tools
# ========================================
Write-Host "[1/4] 检查 Visual Studio Build Tools..." -ForegroundColor Yellow

$vsInstalled = $false
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -property installationPath 2>$null
    if ($vsPath) { $vsInstalled = $true }
}

if (-not $vsInstalled) {
    Write-Host "  未检测到 VS Build Tools，正在下载安装..." -ForegroundColor Gray
    Write-Host "  (这是 Rust 在 Windows 上编译所需的 C++ 编译器)" -ForegroundColor Gray
    $vsUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    $vsInstaller = "$env:TEMP\vs_BuildTools.exe"
    Invoke-WebRequest -Uri $vsUrl -OutFile $vsInstaller
    Start-Process -FilePath $vsInstaller -ArgumentList "--quiet", "--wait", "--norestart", "--nocache", "--add", "Microsoft.VisualStudio.Workload.VCTools", "--includeRecommended" -Wait
    Remove-Item $vsInstaller -Force
    Write-Host "  VS Build Tools 安装完成!" -ForegroundColor Green
} else {
    Write-Host "  已安装，跳过。" -ForegroundColor Green
}

# ========================================
# 2. 安装 Rust (via rustup)
# ========================================
Write-Host ""
Write-Host "[2/4] 检查 Rust 工具链..." -ForegroundColor Yellow

$rustInstalled = $false
try {
    $rustVersion = rustc --version 2>$null
    if ($rustVersion) { $rustInstalled = $true }
} catch {}

if (-not $rustInstalled) {
    Write-Host "  正在安装 Rust..." -ForegroundColor Gray
    $rustupUrl = "https://win.rustup.rs/x86_64"
    $rustupExe = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupExe
    Start-Process -FilePath $rustupExe -ArgumentList "-y", "--default-toolchain", "stable" -Wait
    Remove-Item $rustupExe -Force
    
    # 刷新 PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $cargoPath = "$env:USERPROFILE\.cargo\bin"
    if ($env:Path -notlike "*$cargoPath*") {
        $env:Path += ";$cargoPath"
    }
    
    Write-Host "  Rust 安装完成! 版本: $(rustc --version)" -ForegroundColor Green
} else {
    Write-Host "  已安装: $rustVersion" -ForegroundColor Green
}

# ========================================
# 3. 安装 pnpm
# ========================================
Write-Host ""
Write-Host "[3/4] 检查 pnpm..." -ForegroundColor Yellow

$pnpmInstalled = $false
try {
    $pnpmVersion = pnpm --version 2>$null
    if ($pnpmVersion) { $pnpmInstalled = $true }
} catch {}

if (-not $pnpmInstalled) {
    Write-Host "  正在安装 pnpm..." -ForegroundColor Gray
    Invoke-WebRequest -Uri "https://get.pnpm.io/install.ps1" -UseBasicParsing | Invoke-Expression
    
    # 刷新 PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    Write-Host "  pnpm 安装完成! 版本: $(pnpm --version)" -ForegroundColor Green
} else {
    Write-Host "  已安装: v$pnpmVersion" -ForegroundColor Green
}

# ========================================
# 4. 安装项目依赖
# ========================================
Write-Host ""
Write-Host "[4/4] 安装项目依赖..." -ForegroundColor Yellow

$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectDir

if (Test-Path "package.json") {
    pnpm install
    Write-Host "  前端依赖安装完成!" -ForegroundColor Green
} else {
    Write-Host "  警告: 未找到 package.json，请确认在正确目录运行" -ForegroundColor Red
}

# ========================================
# 完成
# ========================================
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host " 安装完成!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "现在你可以运行以下命令启动开发:" -ForegroundColor White
Write-Host "  cd $projectDir" -ForegroundColor Gray
Write-Host "  pnpm tauri dev" -ForegroundColor Gray
Write-Host ""
Write-Host "首次编译 Rust 会比较慢 (需要下载依赖)，请耐心等待..." -ForegroundColor Yellow
Write-Host ""
