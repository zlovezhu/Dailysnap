# DailySnap 环境安装与分发指南

## 📋 目录

- [给开发者：搭建开发环境](#给开发者搭建开发环境)
- [给使用者：如何打包分发](#给使用者如何打包分发)
- [常见问题](#常见问题)

---

## 给开发者：搭建开发环境

### 一键安装（推荐）

项目提供了自动化安装脚本，打开 PowerShell（管理员模式），执行：

```powershell
cd dailysnap
.\scripts\setup-dev-env.ps1
```

脚本会自动安装以下依赖：
1. Visual Studio Build Tools（C++ 编译器，Rust 需要）
2. Rust 工具链（rustup + cargo + rustc）
3. pnpm（Node.js 包管理器）
4. 项目前端依赖（node_modules）

### 手动安装（如果脚本有问题）

#### 前置条件

| 工具 | 版本要求 | 用途 |
|------|----------|------|
| Node.js | >= 18 | 前端构建 |
| Rust | >= 1.77 (stable) | Tauri 后端编译 |
| pnpm | >= 8 | 包管理 |
| VS Build Tools 2022 | - | Windows C++ 编译器 |

#### 步骤 1: 安装 Node.js

前往 https://nodejs.org 下载 LTS 版本安装。

或使用 winget：
```powershell
winget install OpenJS.NodeJS.LTS
```

#### 步骤 2: 安装 Rust

前往 https://rustup.rs 下载 rustup-init.exe 并运行。

或在 PowerShell 中执行：
```powershell
winget install Rustlang.Rustup
```

安装完成后验证：
```bash
rustc --version    # 应输出 rustc 1.xx.x
cargo --version    # 应输出 cargo 1.xx.x
```

#### 步骤 3: 安装 Visual Studio Build Tools

Rust 在 Windows 上编译需要 MSVC C++ 编译器。

方式一（推荐）：Rust 安装时会提示安装，选 "Yes" 即可。

方式二：手动安装
1. 下载 [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. 安装时勾选 **"使用 C++ 的桌面开发"** 工作负载

#### 步骤 4: 安装 pnpm

```powershell
npm install -g pnpm
```

或：
```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

#### 步骤 5: 安装项目依赖

```bash
cd dailysnap
pnpm install
```

### 启动开发

```bash
pnpm tauri dev
```

首次运行会编译 Rust 代码，需要 3-5 分钟下载 crates 和编译。之后热更新只需几秒。

---

## 给使用者：如何打包分发

### 核心概念

> **其他人使用 DailySnap 不需要安装任何开发环境！**
>
> 你打包出来的是一个标准的 Windows 安装程序（.msi / .exe），别人下载后双击安装即可使用，就像安装微信、Chrome 一样。

### 打包命令

```bash
pnpm tauri build
```

打包产物在 `src-tauri/target/release/bundle/` 目录下：

```
bundle/
├── msi/
│   └── DailySnap_0.1.0_x64_en-US.msi    # Windows 安装包 (~5-15MB)
└── nsis/
    └── DailySnap_0.1.0_x64-setup.exe     # NSIS 安装包 (备选)
```

### 分发给别人

| 分发方式 | 说明 |
|----------|------|
| 直接发 .msi 文件 | 最简单，别人双击安装即可 |
| 上传到网盘/GitHub Releases | 提供下载链接 |
| 上传到 Microsoft Store | 需要开发者账号，但最正规 |

### 打包产物对比

| 项目 | 开发时 | 打包后 |
|------|--------|--------|
| 需要 Rust? | 是 | **否** |
| 需要 Node.js? | 是 | **否** |
| 需要 pnpm? | 是 | **否** |
| 体积 | node_modules 几百 MB | **安装包 5-15 MB** |
| 使用方式 | `pnpm tauri dev` | **双击安装，开始菜单启动** |

### macOS 打包

如果你有 Mac，在 Mac 上执行同样的命令：
```bash
pnpm tauri build
```

产物是 `.dmg` 文件，用户拖进 Applications 即可。

### 跨平台打包（CI/CD）

如果你需要在一台机器上同时打包 Windows + macOS，可以用 GitHub Actions：

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        platform: [windows-latest, macos-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

推送 tag 时自动打包并发布到 GitHub Releases。

---

## 常见问题

### Q: 首次 `pnpm tauri dev` 非常慢？
**A:** 正常现象。首次需要下载并编译所有 Rust 依赖（约 200+ 个 crate），通常需要 3-10 分钟。之后的增量编译只需几秒。

### Q: 报错 "linker 'link.exe' not found"？
**A:** VS Build Tools 没装或没装对。确保安装了 "使用 C++ 的桌面开发" 工作负载。

### Q: 报错 "error: could not find `Cargo.toml`"？
**A:** 确保在 `dailysnap` 目录下运行命令，不要在 `src-tauri` 里运行。

### Q: 我可以只改前端不编译 Rust 吗？
**A:** 可以。`pnpm tauri dev` 启动后，前端代码修改会热更新。只有 Rust 代码变动才需要重新编译。

### Q: 打包后的安装包能在 Windows 7 上运行吗？
**A:** Tauri 2 使用 WebView2（基于 Chromium），支持 Windows 10 1803+ 和 Windows 11。不支持 Windows 7/8。

### Q: 安装包为什么这么小（10MB 左右）？
**A:** 因为 Tauri 使用系统自带的 WebView2 渲染网页，不像 Electron 那样打包一个完整的 Chromium（100MB+）。

### Q: 我想加一个自动更新功能？
**A:** Tauri 内置了 updater 插件（`tauri-plugin-updater`），配合 GitHub Releases 可以实现静默自动更新。MVP 验证后再加即可。
