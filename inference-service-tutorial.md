# AICook 推理服务 (inference-service) 新手运行教程

本文档专为没有 Python 开发经验的新手编写，指导你如何在本地（Windows 或 Mac）运行 `inference-service`。

## 1. 安装 Python 环境

首先，你需要在电脑上安装 Python。我们推荐安装 **Python 3.10** 或 **Python 3.11**。

*   **Windows**:
    1.  访问 [Python 官方下载页面](https://www.python.org/downloads/windows/)。
    2.  下载最新的 Python 3.10 或 3.11 的 Windows installer (64-bit)。
    3.  **重要**：在安装界面的第一步，务必勾选底部的 **"Add Python.exe to PATH"**。
    4.  点击 "Install Now" 完成安装。
*   **Mac**:
    1.  如果你安装了 Homebrew，可以打开终端输入：`brew install python@3.11`。
    2.  或者访问 [Python 官方下载页面](https://www.python.org/downloads/macos/) 下载安装包进行安装。

验证安装：打开命令行（Windows 的 PowerShell 或 CMD，Mac 的 Terminal），输入以下命令：
```bash
python --version
# 或者
python3 --version
```
如果能看到类似 `Python 3.11.x` 的输出，说明安装成功。

## 2. 创建并激活虚拟环境

为了不污染系统全局的 Python 环境，我们通常在项目目录下创建一个“虚拟环境”。

1.  打开命令行，进入到 `inference-service` 目录：
    ```bash
    cd d:\workspace\goproject\my\aicook\inference-service
    # 请根据你的实际路径进行调整
    ```

2.  创建虚拟环境（名为 `venv`）：
    ```bash
    python -m venv venv
    # 如果提示找不到 python，请尝试使用 python3 -m venv venv
    ```

3.  激活虚拟环境：
    *   **Windows (PowerShell)**:
        ```powershell
        .\venv\Scripts\Activate.ps1
        ```
        *(如果遇到权限错误，可能需要先以管理员身份运行 PowerShell 并执行 `Set-ExecutionPolicy Unrestricted -Scope CurrentUser`)*
    *   **Windows (CMD)**:
        ```cmd
        .\venv\Scripts\activate.bat
        ```
    *   **Mac / Linux**:
        ```bash
        source venv/bin/activate
        ```
    激活成功后，你的命令行提示符前面会出现 `(venv)` 字样。

## 3. 安装依赖包

在**激活了虚拟环境**的命令行中，运行以下命令安装项目所需的依赖：

```bash
pip install -r requirements.txt
```
*提示：如果下载速度很慢，可以加上国内镜像源，例如：*
`pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple`

如果你在 Windows 下看到 `No module named 'torch'`，建议额外执行一次 PyTorch 官方 CPU wheel 安装命令，确保当前 `venv` 里真的装上了 `torch` 和 `torchaudio`：

```powershell
python -m pip install --upgrade pip
pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

如果日志里继续提示 `No module named 'modelscope'`，再补装一次：

```powershell
pip install modelscope
```

安装后可以快速自检：

```powershell
python -c "import torch; import torchaudio; print(torch.__version__)"
```

如果这条命令仍报错，说明当前激活的不是项目 `venv`，或者 `torch` 还没装进这个虚拟环境。

## 4. 启动服务

依赖安装完成后，建议先设置几个环境变量，再启动服务。

推荐值：

- `AICOOK_STRICT_FUNASR=false`
- `FUNASR_MODEL=iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch`
- `FUNASR_DEVICE=cpu`
- `AICOOK_ALLOW_DUMMY=false`

如果你只是临时验证接口是否通畅，也可以把 `AICOOK_ALLOW_DUMMY=true`，这样当 FunASR 没装好、缺少 `torch`、或者模型初始化失败时，会返回演示转写文本而不是直接报错。推荐把 `AICOOK_STRICT_FUNASR=false` 作为默认值，只在你确认环境已完整时再切严格模式。

### Windows PowerShell

```powershell
$env:AICOOK_STRICT_FUNASR="false"
$env:FUNASR_MODEL="iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
$env:FUNASR_DEVICE="cpu"
$env:AICOOK_ALLOW_DUMMY="false"
uvicorn app.main:app --host 0.0.0.0 --port 8088
```

### Mac / Linux

```bash
export AICOOK_STRICT_FUNASR="false"
export FUNASR_MODEL="iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
export FUNASR_DEVICE="cpu"
export AICOOK_ALLOW_DUMMY="false"
uvicorn app.main:app --host 0.0.0.0 --port 8088
```

看到类似 `Uvicorn running on http://0.0.0.0:8088 (Press CTRL+C to quit)` 的提示，说明服务启动成功！

## 5. 常见问题 (FAQ)

1.  **第一次启动很慢？**
    *   是的。`inference-service` 包含了语音识别 (FunASR) 和图像识别 (PaddleOCR) 功能。第一次运行时，它会自动从网络上下载相关的 AI 模型文件（通常有几百 MB 到 1GB 不等）。请耐心等待下载完成。下载完成后，后续启动就会很快。
2.  **如何停止服务？**
    *   在运行服务的命令行窗口中，按下 `Ctrl + C` 即可停止服务。
3.  **每次都要重新安装依赖吗？**
    *   不需要。只要你不删除 `venv` 文件夹，依赖就一直存在。
4.  **下次如何启动？**
    *   每次重新打开命令行后，只需要执行两步：
        1.  进入目录并激活虚拟环境：`.\venv\Scripts\Activate.ps1` (Windows) 或 `source venv/bin/activate` (Mac)。
        2.  设置 `FUNASR_MODEL`、`FUNASR_DEVICE`、`AICOOK_ALLOW_DUMMY`，再启动服务：`uvicorn app.main:app --host 0.0.0.0 --port 8088`。
5.  **报错里说缺少 `torch` 是什么意思？**
    *   这说明 `funasr` 已经装上了，但它依赖的 PyTorch 运行时没有安装成功。
    *   Windows 下优先执行上面的官方 CPU wheel 安装命令，再执行 `python -c "import torch"` 验证。
    *   如果你把 `AICOOK_ALLOW_DUMMY=true` 或 `AICOOK_STRICT_FUNASR=false` 打开了，服务会记录一条告警并返回演示转写结果，所以你可能看到日志提示缺依赖，但接口仍然是 `200 OK`。这不是“真转写成功”，而是 dummy fallback。
6.  **报错里说缺少 `modelscope` 或 `paraformer-zh is not registered` 怎么办？**
    *   先执行 `pip install modelscope`，因为 FunASR 下载官方中文模型时会用到它。
    *   然后把 `FUNASR_MODEL` 改成完整模型名 `iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch`，不要继续用旧的简写别名。
    *   `ffmpeg` 提示不是当前阻塞项。现在 `torchaudio` 已经能直接加载音频；安装 `ffmpeg` 只是提升兼容性，不会单独解决 `modelscope` / 模型注册问题。
7.  **怎么确认现在是不是在用真实 FunASR？**
    *   启动后访问 `http://127.0.0.1:8088/health`，看返回里的 `speech.status`：
        * `ready` 代表真实 FunASR 已加载成功。
        * `dummy` 代表当前仍在走演示转写降级。
        * `error` 或 `degraded` 代表导入或模型初始化失败，需要先修环境。
    *   同时看 `speech.resolved_model`，确认服务最终解析到的模型名是否正确。
8.  **我想让缺依赖时直接失败，不要返回 200，怎么做？**
    *   启动前设置 `AICOOK_STRICT_FUNASR=true`，并同时把 `AICOOK_ALLOW_DUMMY=false`。
    *   这样当 `torch` 或模型初始化失败时，接口会返回明确错误，不再走演示转写。
