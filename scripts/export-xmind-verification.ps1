# Export executable A/B/C sources and the explicitly approved public read-only database.
# Never copies user state, credentials, reports, original imports or shared dependencies.
[CmdletBinding()]
param(
    [string]$SourceRoot = '',
    [ValidateRange(1024, 65535)][int]$DefaultPort = 3321
)
$ErrorActionPreference = 'Stop'
if (-not $SourceRoot) { $SourceRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
$source = (Resolve-Path -LiteralPath $SourceRoot).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
$workspace = [IO.Path]::GetFullPath((Split-Path -Parent $source)).TrimEnd([IO.Path]::DirectorySeparatorChar)
$destination = [IO.Path]::GetFullPath((Join-Path $workspace 'xray-xmind-verification'))
if (Test-Path -LiteralPath $destination) {
    $suffix = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6)
    $destination = [IO.Path]::GetFullPath((Join-Path $workspace ('xray-xmind-verification-' + $suffix)))
}
if ((Split-Path -Parent $destination) -ne $workspace -or $destination -eq $source) {
    throw 'Export destination must be a new sibling directory inside the current workspace.'
}
if (Test-Path -LiteralPath $destination) { throw 'Export destination already exists; nothing was changed.' }

function Read-GitText([string]$Arguments) {
    $git = (Get-Command git -ErrorAction Stop).Source
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $git
    $start.Arguments = $Arguments
    $start.WorkingDirectory = $source
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $process = [Diagnostics.Process]::Start($start)
    $output = $process.StandardOutput.ReadToEnd()
    $errors = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'Cannot enumerate the current Git checkout.' }
    $process.Dispose()
    return $output
}

# Validate approved database bytes before creating the export folder.
$databaseRelative = '.data/company-database/xray-v3-20261003.sqlite'
$manifestRelative = '.data/company-database/manifest.json'
$databaseSource = Join-Path $source $databaseRelative
$manifestSource = Join-Path $source $manifestRelative
$databaseManifest = Get-Content -LiteralPath $manifestSource -Raw -Encoding UTF8 | ConvertFrom-Json
$databaseHash = (Get-FileHash -LiteralPath $databaseSource -Algorithm SHA256).Hash.ToLowerInvariant()
if ($databaseHash -ne [string]$databaseManifest.sha256 -or (Get-Item -LiteralPath $databaseSource).Length -lt 1000000) {
    throw 'The public database is missing, changed, or still an LFS pointer. Export was not created.'
}
$stream = [IO.File]::OpenRead($databaseSource)
try {
    $signature = New-Object byte[] 16
    if ($stream.Read($signature, 0, 16) -ne 16 -or [Text.Encoding]::ASCII.GetString($signature) -ne "SQLite format 3`0") {
        throw 'The approved public file is not an expanded SQLite database.'
    }
} finally { $stream.Dispose() }

$tracked = @(Read-GitText 'ls-files -z --cached')
$newFiles = @(Read-GitText 'ls-files -z --others --exclude-standard')
$sourceFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($name in ($tracked -join '').Split([char]0)) { if ($name) { [void]$sourceFiles.Add($name) } }
$newRoots = @('app', 'modules', 'packages', 'public', 'scripts')
$sourceExtensions = @('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.json', '.css', '.scss', '.html', '.svg', '.md', '.txt', '.yaml', '.yml', '.toml', '.ps1', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.ttf')
foreach ($name in ($newFiles -join '').Split([char]0)) {
    if (-not $name) { continue }
    $normalized = $name.Replace('\', '/')
    $rootName = $normalized.Split('/')[0]
    $sourceLike = $sourceExtensions -contains [IO.Path]::GetExtension($normalized).ToLowerInvariant() -or [IO.Path]::GetFileName($normalized) -match '^(?:LICENSE|LICENCE|COPYING|NOTICE|AUTHORS)(?:\.|$)'
    if (($newRoots -contains $rootName -or $normalized.StartsWith('docs/agent-v3/')) -and $sourceLike) {
        [void]$sourceFiles.Add($normalized)
    }
}
$blockedParts = @('.git', '.data', 'node_modules', '.venv', '.next', '__pycache__', '.pytest_cache', '.cache', 'coverage')
$blockedExtensions = @('.pyc', '.log', '.tmp', '.tsbuildinfo', '.pem', '.key', '.pfx', '.p12', '.sqlite', '.db')
$utf8 = New-Object Text.UTF8Encoding($false)
$copied = New-Object 'System.Collections.Generic.List[object]'
[void](New-Item -ItemType Directory -Path $destination)
foreach ($relative in ($sourceFiles | Sort-Object)) {
    $normalized = $relative.Replace('\', '/')
    $parts = $normalized.Split('/')
    if ($parts | Where-Object { $blockedParts -contains $_ }) { continue }
    if ($parts | Where-Object { $_.StartsWith('.env') -or $_ -in @('.npmrc', '.pypirc', 'credentials.json', 'cookies.json', 'session.json') }) { continue }
    if ($normalized.StartsWith('docs/test-results/') -or $blockedExtensions -contains [IO.Path]::GetExtension($normalized).ToLowerInvariant()) { continue }
    if ($parts -contains '..' -or [IO.Path]::IsPathRooted($normalized) -or $normalized -match '[\x00-\x1f]') { throw 'Unsafe source path.' }
    $from = [IO.Path]::GetFullPath((Join-Path $source $normalized))
    $to = [IO.Path]::GetFullPath((Join-Path $destination $normalized))
    if (-not $from.StartsWith($source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        -not $to.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Source path escaped the export boundary.' }
    if (-not (Test-Path -LiteralPath $from -PathType Leaf)) { continue } # Deleted tracked files stay deleted.
    $sourceItem = Get-Item -LiteralPath $from
    # Synology/OneDrive hydrated files carry ReparsePoint too; only actual links redirect paths.
    if ($sourceItem.LinkType -in @('SymbolicLink', 'Junction') -or $sourceItem.Target) { throw 'Source symlinks are not exported.' }
    [void](New-Item -ItemType Directory -Path (Split-Path -Parent $to) -Force)
    Copy-Item -LiteralPath $from -Destination $to
    $copied.Add([pscustomobject]@{ path = $normalized; bytes = (Get-Item -LiteralPath $to).Length; sha256 = (Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash.ToLowerInvariant() })
}
foreach ($required in @('package.json', 'package-lock.json', 'app/profile/route.ts', 'modules/a-profile/src/ui/needs.html', 'app/xmind/page.tsx', 'modules/research-agent/xmind/tree.json', 'modules/research-agent/requirements-v3-lock.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $destination $required))) { throw "Export is missing required runtime source: $required" }
}
$databaseFolder = Join-Path $destination '.data/company-database'
[void](New-Item -ItemType Directory -Path $databaseFolder -Force)
Copy-Item -LiteralPath $databaseSource -Destination (Join-Path $destination $databaseRelative)
Copy-Item -LiteralPath $manifestSource -Destination (Join-Path $destination $manifestRelative)
if ((Get-FileHash -LiteralPath (Join-Path $destination $databaseRelative) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $databaseHash) { throw 'Database copy hash mismatch.' }
(Get-Item -LiteralPath (Join-Path $destination $databaseRelative)).IsReadOnly = $true
$databaseSourceItem = Get-Item -LiteralPath $databaseSource
if ((Get-FileHash -LiteralPath $databaseSource -Algorithm SHA256).Hash.ToLowerInvariant() -ne $databaseHash) { throw 'Source database changed during export.' }

$nodeHint = Get-Command node -ErrorAction SilentlyContinue
$pythonHint = Join-Path $source '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonHint)) { $pythonHint = '' }
$runtimeHints = [ordered]@{
    nodeExecutable = $(if ($nodeHint) { $nodeHint.Source } else { '' })
    pythonExecutable = $pythonHint
    nodeModulesDirectory = Join-Path $source 'node_modules'
    packageLockHash = (Get-FileHash -LiteralPath (Join-Path $destination 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant()
}
[IO.File]::WriteAllText((Join-Path $destination 'verification-local-runtime.json'), ($runtimeHints | ConvertTo-Json -Depth 4), $utf8)

$launcher = @'
# Local validation only; model credentials are cleared and data stays in this folder.
[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = __DEFAULT_PORT__,
    [switch]$ReuseLocalDependencies,
    [switch]$PrepareOnly,
    [switch]$Production,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$utf8 = New-Object Text.UTF8Encoding($false)
$hints = Get-Content -LiteralPath (Join-Path $root 'verification-local-runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Checked-Run([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Dependency or application command failed (exit $LASTEXITCODE)." }
}
function Find-Node24 {
    $candidates = @()
    $command = Get-Command node -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    if ($ReuseLocalDependencies -and $hints.nodeExecutable) { $candidates += [string]$hints.nodeExecutable }
    $runtime = Join-Path $root '.runtime/node'
    if (Test-Path -LiteralPath $runtime) { $candidates += @(Get-ChildItem -LiteralPath $runtime -Filter node.exe -Recurse | ForEach-Object FullName) }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            $version = & $candidate --version
            if ($version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 24) { return $candidate }
        }
    }
    Write-Host 'Installing a local Node.js 24 runtime from nodejs.org (no administrator changes).'
    [void](New-Item -ItemType Directory -Path $runtime -Force)
    $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $manifest = (Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt').Content
    $line = @($manifest -split "`n" | Where-Object { $_ -match ('^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-' + $architecture + '\.zip)\s*$') })
    if ($line.Count -ne 1 -or $line[0] -notmatch '^([a-f0-9]{64})\s+(\S+)') { throw 'Official Node checksum manifest did not contain exactly one Windows runtime.' }
    $expected = $Matches[1]; $archiveName = $Matches[2]
    $archive = Join-Path $runtime $archiveName
    if (Test-Path -LiteralPath $archive) {
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Existing Node archive hash mismatch; no files were overwritten.' }
    } else { Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/latest-v24.x/' + $archiveName) -OutFile $archive }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Downloaded Node archive hash mismatch.' }
    $installed = Join-Path $runtime ([IO.Path]::GetFileNameWithoutExtension($archiveName))
    if (-not (Test-Path -LiteralPath $installed)) { Expand-Archive -LiteralPath $archive -DestinationPath $runtime }
    $executable = Join-Path $installed 'node.exe'
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Node runtime extraction failed.' }
    return $executable
}
Push-Location -LiteralPath $root
try {
    $nodeExe = Find-Node24
    $env:PATH = (Split-Path -Parent $nodeExe) + [IO.Path]::PathSeparator + $env:PATH
    $npmCli = Join-Path (Split-Path -Parent $nodeExe) 'node_modules/npm/bin/npm-cli.js'
    if (-not (Test-Path -LiteralPath $npmCli)) { throw 'Selected Node installation has no npm CLI; install the official Node.js distribution.' }
    $modules = Join-Path $root 'node_modules'
    if ($ReuseLocalDependencies -and -not (Test-Path -LiteralPath $modules)) {
        $sharedModules = [IO.Path]::GetFullPath([string]$hints.nodeModulesDirectory)
        $sharedLock = Join-Path (Split-Path -Parent $sharedModules) 'package-lock.json'
        if (Test-Path -LiteralPath $sharedModules -PathType Container) {
            if (-not (Test-Path -LiteralPath $sharedLock) -or (Get-FileHash -LiteralPath $sharedLock -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hints.packageLockHash) {
                throw 'Original dependency lock changed; use a new export and a fresh install.'
            }
            [void](New-Item -ItemType Junction -Path $modules -Target $sharedModules)
            Write-Host 'Using existing local Node dependencies; application data remains isolated.'
        }
    }
    if (Test-Path -LiteralPath $modules) {
        if ((Get-Item -LiteralPath $modules).LinkType -in @('Junction', 'SymbolicLink') -and -not $ReuseLocalDependencies) {
            throw 'This folder uses shared Node dependencies. Run with -ReuseLocalDependencies or export a new folder for independent installation; shared dependencies will not be deleted.'
        }
    }
    $nodeStamp = Join-Path $root '.verification-node-lock.sha256'
    $currentNodeHash = (Get-FileHash -LiteralPath (Join-Path $root 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    if (-not (Test-Path -LiteralPath $modules) -or (-not $ReuseLocalDependencies -and
        (-not (Test-Path -LiteralPath $nodeStamp) -or (Get-Content -LiteralPath $nodeStamp -Raw).Trim() -ne $currentNodeHash))) {
        Checked-Run $nodeExe @($npmCli, 'ci', '--no-audit', '--no-fund')
        [IO.File]::WriteAllText($nodeStamp, $currentNodeHash, $utf8)
    }
    if (-not (Test-Path -LiteralPath (Join-Path $modules 'next/dist/bin/next'))) { throw 'Next.js is absent from the selected dependencies.' }
    $pythonExe = Join-Path $root '.venv/Scripts/python.exe'
    if ($ReuseLocalDependencies -and $hints.pythonExecutable -and (Test-Path -LiteralPath $hints.pythonExecutable)) {
        $pythonExe = [string]$hints.pythonExecutable
        Write-Host 'Using the existing local Python environment; imports and reports are saved here.'
    } else {
        if (-not (Test-Path -LiteralPath $pythonExe)) {
            $python = Get-Command python -ErrorAction SilentlyContinue
            if (-not $python) { throw 'Python 3.12 is required. Install it from https://www.python.org/downloads/ and rerun launch.ps1.' }
            $version = & $python.Source -c 'import sys; print(sys.version_info.major,sys.version_info.minor,sep=chr(46))'
            if ($version -ne '3.12') { throw 'The frozen document/OCR dependencies were validated on Python 3.12. Install Python 3.12 or use -ReuseLocalDependencies on the original machine.' }
            Checked-Run $python.Source @('-m', 'venv', '.venv')
        }
        $pythonStamp = Join-Path $root '.venv/verification-dependencies.sha256'
        $pythonHash = (Get-FileHash -LiteralPath 'modules/research-agent/requirements-v3-lock.txt' -Algorithm SHA256).Hash.ToLowerInvariant()
        if (-not (Test-Path -LiteralPath $pythonStamp) -or (Get-Content -LiteralPath $pythonStamp -Raw).Trim() -ne $pythonHash) {
            Checked-Run $pythonExe @('-m', 'pip', 'install', '-r', 'modules/research-agent/requirements-v3-lock.txt')
            [IO.File]::WriteAllText($pythonStamp, $pythonHash, $utf8)
        }
    }
    Checked-Run $pythonExe @('-X', 'utf8', '-c', 'import bs4, pdfplumber, pypdfium2, docx, openpyxl, rapidocr_onnxruntime')
    Write-Host 'Local document dependencies ready.'
    # These values apply only to this launch process. No source credentials or .env are copied.
    foreach ($name in @('MINIMAX_API_KEY', 'MODEL_API_KEY', 'RESEARCH_API_KEY', 'DATABASE_URL', 'AUTH_PROVIDER', 'MODEL_PROVIDER', 'RESEARCH_PROVIDER')) {
        [Environment]::SetEnvironmentVariable($name, '', 'Process')
    }
    $env:MINIMAX_BASE_URL = 'https://api.minimax.cn/v1'
    $env:RESEARCH_AGENT_ENABLED = 'true'
    $env:RESEARCH_AGENT_V3_ENABLED = 'true'
    $env:RESEARCH_AGENT_V2_ENABLED = 'false'
    $env:RESEARCH_AGENT_V3_MODEL_ENABLED = 'false'
    $env:RESEARCH_AGENT_PYTHON = $pythonExe
    $env:A_NEEDS_QUICK_UNSURE_ENABLED = 'true'
    $env:XRAY_B_LOCAL_MODE = '0'
    $env:PYTHONUTF8 = '1'
    $env:NEXT_TELEMETRY_DISABLED = '1'
    if ($PrepareOnly) { Write-Host 'Standalone dependencies prepared. No server has been started.'; return }
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() } catch { throw "Port $Port is already in use. Choose another -Port; no running application was stopped." } finally { $listener.Stop() }
    Write-Host "A to B to C: http://127.0.0.1:$Port/profile"
    Write-Host "Company investigation: http://127.0.0.1:$Port/xmind"
    Write-Host 'This is a local validation instance. Ctrl+C stops this server.'
    $next = Join-Path $modules 'next/dist/bin/next'
    if ($Production) {
        Checked-Run $nodeExe @($next, 'build')
        Checked-Run $nodeExe @($next, 'start', '--hostname', '127.0.0.1', '--port', [string]$Port)
    } else { Checked-Run $nodeExe @($next, 'dev', '--hostname', '127.0.0.1', '--port', [string]$Port) }
} finally { Pop-Location }
'@
$launcher = $launcher.Replace('__DEFAULT_PORT__', [string]$DefaultPort)
# Windows PowerShell 5.1 requires a BOM to read UTF-8 scripts containing Chinese.
[IO.File]::WriteAllText((Join-Path $destination 'launch.ps1'), $launcher, (New-Object Text.UTF8Encoding($true)))

$readme = @'
# X-Ray XMind 独立本机验证

这是完整应用源码的独立副本，包含 A 用户需求、B 调查、C 报告及 `/xmind` 查询台；企业库是原公开数据库的只读副本。没有拷贝原项目的个人侧写、调查任务、历史报告、导入原件、Cookie、密钥或任何 `.env`。新数据写入本目录 `.data`，不会读取原项目的用户数据。

Windows PowerShell 启动：

```powershell
cd '本文件所在目录'
powershell -ExecutionPolicy Bypass -File .\launch.ps1
```

首次独立启动会安装 Node 依赖和本目录 Python 虚拟环境。需要 Python **3.12**，可从 https://www.python.org/downloads/ 安装；若机器没有 Node.js 24 或更高版本，启动器会从 nodejs.org 下载本地 Node.js 24 ZIP，并核对官方 SHA256，不修改系统安装。首次下载依赖需要联网与磁盘空间；不会购买服务或调用付费模型。安装成功后依赖与中文 OCR 模型在本机，已有材料导入与数据库查询可离线运行，公开网页搜索仍需要网络。

在导出它的同一台机器上，可以快速复用已经安装的依赖：

```powershell
powershell -ExecutionPolicy Bypass -File .\launch.ps1 -ReuseLocalDependencies
```

这个模式会给 `node_modules` 建立到原项目依赖目录的 Junction，并复用原 Python 解释器；只共享软件依赖，任务/报告/用户材料仍在本目录。原项目被删除或依赖发生变化后，快速模式可能失效。此模式不能称为完全离线可移植安装；启动器不会递归删除共享依赖。如果需要复制到另一台机器，请使用新导出的、尚未建立 Junction 的副本，并执行默认独立安装。

默认入口：

- A 用户需求 → B 候选与调查 → C 报告：http://127.0.0.1:__DEFAULT_PORT__/profile
- 直接按公司调查：http://127.0.0.1:__DEFAULT_PORT__/xmind

可改端口 `-Port 3322`；`-PrepareOnly` 仅安装检查依赖；`-Production` 构建后运行。默认绑定本机 `127.0.0.1`，端口冲突会退出，不会关闭别的窗口服务。按 Ctrl+C 停止本实例。

V3 在本实例开启，V2 与语义模型关闭；启动器清除继承的模型/API凭据。报告保留来源陈述、未知与预算退出，未认证材料不能当作已证实事实。平台专用爬虫不在这个文件夹中新增，源文件中已有的通用网页/PDF获取能力保留。受控截图/扫描 PDF OCR 为本地 CPU，结果需复核。

验证时先创建需求、确认后选择候选调查，再打开报告/原文/关键问题；也可以在 `/xmind` 查公司、主动导入材料并调查。这里没有预载其他人的历史报告，第一次历史列表为空是正常状态。数据库摘录不是新的公开正文采集成功；缺少材料就保留未知。

可运行 `npm test`、`npm run test:agent`、`npm run test:integration`、`npm run typecheck`、`npm run build`；独立 Python 环境使用 `.venv\Scripts\python.exe -X utf8 -m unittest discover -s modules/research-agent -p test_v3*.py -v`。快速复用模式的 Python 路径记在 `verification-local-runtime.json`，它只包含本机依赖路径，不含凭据；自动化真实来源验收脚本需要另外明确提供公开材料，导出不会复制原项目验收原件。

`verification-export.json` 记录源提交、导出时各文件哈希与公开数据库哈希。它是验证快照，不是 main 合并或生产部署。
'@
$readme = $readme.Replace('__DEFAULT_PORT__', [string]$DefaultPort)
[IO.File]::WriteAllText((Join-Path $destination 'START_HERE.md'), $readme, $utf8)
$exportManifest = [ordered]@{
    schemaVersion = 'xmind-verification-export/1'
    createdAt = [DateTime]::UtcNow.ToString('o')
    sourceCommit = (Read-GitText 'rev-parse HEAD').Trim()
    sourceIncludesUncommittedFiles = $true
    defaultPort = $DefaultPort
    database = @{ path = $databaseRelative; bytes = $databaseSourceItem.Length; sha256 = $databaseHash; policy = 'copied-public-snapshot-read-only' }
    sourceFiles = $copied.ToArray()
    excluded = @('.env*', '.git', '.data except approved public company database', 'node_modules', '.venv', '.next', 'user originals/reports/cookies/credentials')
}
[IO.File]::WriteAllText((Join-Path $destination 'verification-export.json'), ($exportManifest | ConvertTo-Json -Depth 7), $utf8)
Write-Host "Standalone verification exported to: $destination"
Write-Host "Source files: $($copied.Count); public database SHA256: $databaseHash"
Write-Output $destination
