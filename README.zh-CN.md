# Signature Desk · 签字板

[English](README.md) | **简体中文**

**签名全程在本地处理。** 从落笔、裁剪、旋转到导出 PNG，操作都在自己的设备上完成，签名图片和笔迹坐标不会上传到网络。断网也能完整使用。笔迹仅存在于当前窗口的内存，关闭后即清除，只有主动导出的 PNG 会保存到磁盘。

**Mac 触控板可以直接写字。** 在 Apple Silicon Mac 上打开桌面版，选择「触板直写」，抬手后按空格开始。用一根手指轻触触控板即可落笔，无需按压；轻触左上角，就从画板左上角开始写，抬手即可断笔。按 Esc 结束直写。

## 开始使用

从下面选择适合设备的文件。下载到本地后即可使用，版本说明在 [GitHub Releases](https://github.com/Aaron48615/signature-desk/releases/latest)。

> **下载提醒：Windows 和 Linux 版本未经真机测试，请酌情下载使用。** 安装、触控板直写和退出后的光标恢复仍需在实际设备上验证。

| 入口 | 用法 |
| --- | --- |
| [离线网页 HTML](https://github.com/Aaron48615/signature-desk/releases/latest/download/Signature-Desk.html) | 双击 HTML。用鼠标左键或按下触控板拖动签名。文件可复制到其他电脑，独立运行。 |
| [Mac 应用 ZIP](https://github.com/Aaron48615/signature-desk/releases/latest/download/Signature-Desk-macOS-arm64.zip) | Apple Silicon。解压后打开应用，选「触板直写」，把手指抬离触控板，按空格开始。 |
| [Windows 安装程序](https://github.com/Aaron48615/signature-desk/releases/latest/download/Signature-Desk-Windows-x64-Setup.exe) | **未经真机测试，请酌情下载。** Windows 11 x64。安装包内含微软 x64 WebView2 离线运行时。直写需要提供原始接触报告的精确式触摸板。 |
| [Ubuntu 软件包](https://github.com/Aaron48615/signature-desk/releases/latest/download/Signature-Desk-Ubuntu-amd64.deb) | **未经真机测试，请酌情下载。** Ubuntu 24.04 x64。运行 `sudo apt install ./Signature-Desk-Ubuntu-amd64.deb`。缺少 GTK 或 WebKitGTK 时，系统包管理器需要从软件源或本地缓存安装依赖。 |

遇到问题或有改进建议，欢迎到 [GitHub Issues](https://github.com/Aaron48615/signature-desk/issues) 反馈。报告故障时请注明系统、软件版本和复现步骤；如需附图，请使用虚构签名。

应用没有账户、自动草稿或远程字体，纸纹、图标与钢笔水彩插画随包提供。首次启动默认英文，可在书写模式左侧用 EN / 中文 切换。标题随之显示为 Signature Desk 或「签字板」。桌面应用将语言写入应用配置目录的 language 文件，网页将语言写入当前浏览器的本地存储。同一浏览器再次打开同一文件会恢复语言；浏览器禁用存储时，当前窗口仍可切换。

常规模式下，把鼠标移到纸上即可预览笔尖。圆圈按当前墨色、粗细和画板缩放显示，导出的 PNG 只含签名和选定背景。

**自然笔锋（Natural nib）。** 勾选粗细滑块旁的「自然笔锋」后，鼠标和单指直写都能按速度调整新笔画。慢写稍厚，快写时主体至少保留基础宽度的 86%，最细为 1 个画板像素。快速提笔只收窄最后一小段，停住再抬手保留圆尾，轻点保留所选大小。开关默认关闭，切换后可在同一张画板上混用两种笔迹。导出或改变背景时使用每笔已经记录的线宽。

**触板直写。** 手指落在板面的哪里，签名就从相应位置开始。轻点形成一个点，抬手断笔。多指接触时暂停，全部抬起后继续。按 **Esc** 恢复指针操作，也可切走整个应用退出直写。设备断开时已写的笔迹仍在。普通浏览器可以完成全部编辑与导出；需要直写时请打开桌面应用。

**检查速度和边缘。** 直写用设备报告的绝对坐标定位。Mac 读取 AppKit 的 `NSTouch.normalizedPosition`，体现在直写中的位置与系统光标速度设置分开；常规签名则会跟随系统指针。开启直写前可以勾选「显示触点位置」，查看系统上报的原始 X/Y 百分比与画板上的落笔中心。它们只显示在本次窗口里，不进入 PNG。笔迹从内部滑出时会在边界相交处断开，回到可写区域后再继续。从内部划出时，若一个轴停在边界，应用会抑制贴边拖尾。在边缘落指时立即出墨，边缘窄带内的墨迹先在画板实时预览。若沿边抬手，就保留整笔；若向内划入，则回收入边时多出的沿边段，再提交向内的笔迹。若有意先沿边再向内转折，沿边的一段也可能被过滤，可抬手分两笔写。若多次触及同一物理边缘时读数稳定，例如左 0.00%、右 99.80%，可展开「边缘校准」填写这两个读数。未测的上下边界保持默认。按空格开始后生效，仅在当前窗口记住，可恢复默认范围。若硬件在接触消失前已持续报告同一个边界值，应用无法由该数值还原额外的物理距离。[Apple 触控板事件文档](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingTouchEvents/HandlingTouchEvents.html)

**画板和导出。** 在「画板尺寸」可等比调整已有作品。「重置尺寸」恢复 1200 × 640，保留笔迹，可撤销。右侧选择背景与导出像素尺寸，默认透明、两倍分辨率。导出尺寸解锁后可独立设置宽高，签名等比居中。提示位于导出设置下方的黄色便笺内。

点 **Export PNG / 直接导出 PNG** 可直接保存。点 **Edit & export / 处理后导出**，应用会按相同的尺寸与背景在内存中生成 PNG，解码后在悬浮窗口中编辑。可拖框裁剪、按像素留白裁去空白、按任意角度旋转、水平和垂直翻转。同一张图连续旋转时按累计角度保留完整画面，转回原方向可恢复原尺寸和像素。执行裁剪后，后续旋转以裁剪结果为基准。窗口内有独立的撤销和重做，Esc 取消正在进行的框选。点「保存 PNG」只写入处理后的图片；原始中间 PNG 随窗口释放。主画板与原有书写历史保留。若取消系统保存或保存失败，可以继续编辑并重试。浏览器只支持下载时会继续保留离开提醒。

## Linux 触控板权限

在直写对话框选择设备。没有物理尺寸的设备可以填写实际宽高（毫米）。如提示权限不足，在终端运行以下命令识别触控板，确认设备的 `ID_INPUT_TOUCHPAD=1`。把例子里的 `eventX` 替换为实际编号。临时 ACL 只授予当前用户读取该设备的权限，设备重新连接后可能需要重新设置。命令 `setfacl` 由 Ubuntu 的 `acl` 软件包提供。

```sh
ls -l /dev/input/by-path/*event*
udevadm info --query=property --name=/dev/input/eventX
sudo setfacl -m "u:$(id -un):r" /dev/input/eventX
```

应用以普通用户身份运行。一个已被其他程序独占或仅提供相对移动的设备无法用于直写。此时可以继续使用常规签名。

## 开发与验证

网页工具链使用 Node.js 24 和 npm。桌面构建另需 Rust stable、对应系统的 C 编译器及 Tauri 2 的平台依赖；采用对应平台的机器构建最容易复现。Linux 额外安装 `libudev-dev`。Windows 源码构建使用 Visual Studio C++ Build Tools，macOS 使用 Xcode Command Line Tools。Windows 打包阶段需要取得离线 WebView2 安装程序，生成的安装包可离线使用。[Tauri 开发环境](https://v2.tauri.app/start/prerequisites/)

```sh
npm ci
npm run dev           # 本机网页开发服务
npm run build         # 生成 dist/ 和 release/Signature Desk.html
npm run desktop       # 本地应用开发模式
npm run package       # 构建当前平台的应用包并复制到 release/
npm run check         # TypeScript 和编辑模型回归
npm run test:native   # 当前平台编译并回放合成触点
npm run test:browser  # 先执行 npm run build，使用独立的无头 Chrome 打开 file://
npm run test:webkit-caps  # 构建后在 macOS 系统 WebKit 检查笔画端点
```

浏览器检查默认使用本机 Chrome；指定其他 Chromium 可执行文件时设置 `INKPAD_CHROME`。本机项目缓存中的 Rust 由启动脚本自动识别。打包后的程序支持 `--check-ui`，会在隐藏窗口检查编辑器初始化、设备枚举和消息通道后退出；可用于后台验证，不会启用触控板捕获。Mac 示例命令如下。

```sh
"./release/Signature Desk.app/Contents/MacOS/signature-desk" --check-ui
```

开发入口与隐私约束见 [AGENTS.md](AGENTS.md)。

## 界面插画

[墨水瓶与蘸水笔](src/assets/writing-desk.png) 由内置 ImageGen 为本项目生成，并作为透明 PNG 随离线文件打包。生成指令如下。

> Create a small editorial spot illustration for a heirloom stationery workbench offline app. A squat faceted bottle filled with deep forest-teal ink and open brass collar at left, one long slanting reddish stained wooden dip pen with gold nib pointing right, two loose ivy leaves, fine pen crosshatching and a few tiny sepia ink droplets. Charming naturalist sketchbook watercolor and pencil, gouache washy accents of muted terracotta, honey brass, jade and petrol blue, all drawn by hand with visible etched pen lines. Compact, very horizontal composition about 3:1, full objects in view right up to edges. Isolated objects with genuine transparent background. No words, no letters, no label on bottle, no signature, no border. Designed to remain recognizable at 220 by 80 CSS pixels.
