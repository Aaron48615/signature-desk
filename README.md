# Signature Desk · 签字板

**English** | [简体中文](README.zh-CN.md)

**Your signature stays on your device.** Write, crop, rotate and export a PNG offline. Signature images and stroke coordinates are never uploaded. Your work stays in the current window’s memory until you close it. A PNG is saved to disk only when you export it.

**Write directly on a Mac trackpad with one finger.** Open the desktop app on an Apple Silicon Mac and select **Trackpad ink**. Lift your finger, press **Space**, then touch the trackpad lightly to write. Touch the upper-left corner and the stroke starts at the upper-left of the canvas. Lift to end a stroke. No click or press is required. Press **Esc** to return to normal pointer control.

## Downloads

| Download | How to use it |
| --- | --- |
| [Offline web page](https://github.com/Aaron48615/signature-desk/releases/latest/download/Signature-Desk.html) | Double-click the HTML file. Draw with the left mouse button held down or by pressing and dragging on a trackpad. You can copy the file to another computer and use it offline. |
| [macOS app](https://github.com/Aaron48615/signature-desk/releases/latest/download/Signature-Desk-macOS-arm64.zip) | For Apple Silicon Macs. Unzip and open **Signature Desk.app** to use Trackpad ink. |
| [Windows installer](https://github.com/Aaron48615/signature-desk/releases/latest/download/Signature-Desk-Windows-x64-Setup.exe) | **Untested on physical devices. Download at your discretion.** For Windows 11 x64. Includes the offline WebView2 runtime. Trackpad ink requires a Precision Touchpad whose driver exposes raw contact data. |
| [Ubuntu package](https://github.com/Aaron48615/signature-desk/releases/latest/download/Signature-Desk-Ubuntu-amd64.deb) | **Untested on physical devices. Download at your discretion.** For Ubuntu 24.04 amd64. Run `sudo apt install ./Signature-Desk-Ubuntu-amd64.deb`. Missing GTK or WebKitGTK dependencies must be available from your package sources or local cache. |

**Windows and Linux builds have not been tested on physical devices.** Installation, direct trackpad input and pointer recovery still need verification on real hardware. Build and test details are included in the [release notes](https://github.com/Aaron48615/signature-desk/releases/latest).

Found a problem or have a suggestion? [Open a GitHub issue](https://github.com/Aaron48615/signature-desk/issues). For bugs, please include your operating system, app version and steps to reproduce. If you attach an example, use a made-up signature.

## Signing and exporting

In **Standard** mode, move the pointer over the page to preview the pen’s color and width at the current canvas scale. The exported PNG contains the signature and your chosen background. The paper texture, guides and cursor appear only on screen.

**Natural nib** adjusts new strokes to writing speed. Slow strokes get a little wider. The body of a fast stroke retains at least 86% of the selected width, with a minimum of one canvas pixel. A quick lift tapers the last part of the stroke. Pausing before lifting leaves a rounded end, and a tap makes a dot. The setting starts off, and you can mix both pen styles on one canvas. Each stroke keeps its recorded width when you export or change the background.

**Trackpad ink** starts each stroke where your finger touches the pad. A second contact pauses writing until all fingers lift. Press **Esc** or switch to another app to leave the mode. If the trackpad disconnects, the strokes already on the canvas stay there. All editing and export tools are available in the offline web page. Direct, one-finger trackpad writing requires the desktop app.

**Canvas size** scales existing work proportionally. **Reset size** restores the 1200 × 640 canvas and can be undone. Export defaults to a transparent background at twice the canvas resolution. Unlock the output aspect ratio to set width and height independently. The signature remains centered and keeps its proportions. The note below the export settings shows the current status.

Choose **Export PNG** to save immediately. **Edit & export** creates a PNG in memory and opens it in a separate editor. Drag to crop, use **Trim margins** to leave a chosen amount of padding, rotate by any angle, or flip horizontally or vertically. The editor tracks the total rotation so repeated rotations do not progressively shrink the signature. Returning to the original angle restores the original dimensions and pixels. A crop establishes a new starting image. The editor has its own undo and redo, and **Esc** cancels an active crop selection. Saving writes only the edited PNG. The main canvas and its history remain available if you cancel or saving fails. Browsers that can only start a download may still show the warning when you leave the page.

The app opens in English. Use **EN / 中文** to change languages. The desktop app saves this preference in a `language` file in its configuration directory. The web page uses browser local storage. If storage is disabled, you can still switch languages for the current window. No account is required. The paper texture, icons and illustration are bundled locally.

## Trackpad edges and calibration

The full canvas shows ink at the same scale while writing and after exiting. In Trackpad ink, lift your finger and press **←** to undo a stroke or **→** to redo it. The initial pen width is **6 px**.

On macOS, Trackpad ink reads absolute coordinates from AppKit’s `NSTouch.normalizedPosition`, independently of the system pointer speed. Standard mode follows the system pointer. Before starting a direct-writing session, enable **Show touch position** to see the reported X/Y percentages and where the point lands on the canvas. These guides are never exported. [Apple’s trackpad event documentation](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingTouchEvents/HandlingTouchEvents.html).

A stroke that leaves the writing area is clipped at the boundary and resumes when it comes back. You can write along an edge and lift to keep the whole mark. If you slide in from the outside, an initial segment along the edge can disappear once the finger moves inward. To preserve an intentional edge stroke followed by an inward turn, lift between the two. If the device consistently reports the same extremes, such as X = 0.00% and 99.80%, enter those readings under **Edge calibration** and leave unmeasured edges at their defaults. The settings take effect when you press **Space** and last for the current window. If the hardware repeatedly reports the same coordinate near an edge, additional physical movement cannot be reconstructed from those samples.

## Linux trackpad permissions

Select a trackpad in the Trackpad ink dialog. If the device omits its physical size, enter its width and height in millimeters. If access is denied, identify your trackpad and verify that it reports `ID_INPUT_TOUCHPAD=1`. Replace `eventX` with that specific device before running the last command.

```sh
ls -l /dev/input/by-path/*event*
udevadm info --query=property --name=/dev/input/eventX
sudo setfacl -m "u:$(id -un):r" /dev/input/eventX
```

This grants the current user read access to the selected device. You may need to grant it again after reconnecting. Ubuntu provides `setfacl` in the `acl` package. Run Signature Desk as your regular user. If the device only reports relative movement or another process has exclusive access, Standard mode remains available.

## Development and verification

The web build uses Node.js 24 and npm. Desktop builds also use stable Rust, a C compiler and the Tauri 2 platform dependencies. Build on the target OS for the simplest setup. Use Xcode Command Line Tools on macOS, Visual Studio C++ Build Tools on Windows, and install `libudev-dev` on Linux. Windows packaging needs access to the offline WebView2 installer at build time. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run dev              # Start the local web development server
npm run build            # Build dist/ and the standalone release/Signature Desk.html
npm run desktop          # Run the desktop app in development mode
npm run package          # Build and copy this platform’s app or installer into release/
npm run check            # Type-check and run model regression tests
npm run test:native      # Compile native tests and replay synthetic touch input
npm run test:browser     # After npm run build, test the offline file in headless Chrome
npm run test:webkit-caps # After npm run build, check stroke ends in macOS system WebKit
```

Browser tests use the locally installed Chrome by default. Set `INKPAD_CHROME` to use another Chromium executable. The desktop script also recognizes a Rust toolchain in the project’s local build cache. The packaged app accepts `--check-ui` to initialize the editor, enumerate devices and check the message channel in a hidden window, then exit without activating trackpad capture. On macOS, run `"./release/Signature Desk.app/Contents/MacOS/signature-desk" --check-ui`. The [contributor guide](AGENTS.md) is in Chinese.

## Illustration

The [inkwell and dip pen](src/assets/writing-desk.png) were generated with ImageGen for this project and are bundled as a transparent PNG. The original prompt is included below.

> Create a small editorial spot illustration for a heirloom stationery workbench offline app. A squat faceted bottle filled with deep forest-teal ink and open brass collar at left, one long slanting reddish stained wooden dip pen with gold nib pointing right, two loose ivy leaves, fine pen crosshatching and a few tiny sepia ink droplets. Charming naturalist sketchbook watercolor and pencil, gouache washy accents of muted terracotta, honey brass, jade and petrol blue, all drawn by hand with visible etched pen lines. Compact, very horizontal composition about 3:1, full objects in view right up to edges. Isolated objects with genuine transparent background. No words, no letters, no label on bottle, no signature, no border. Designed to remain recognizable at 220 by 80 CSS pixels.
