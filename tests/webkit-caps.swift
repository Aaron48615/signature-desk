// Run from the repository root after npm run build, using the system WebKit.
import AppKit
import WebKit

final class CapCheck: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.callAsyncJavaScript("return await window.runCapCheck()", arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let summary): print(summary ?? "OK"); exit(0)
            case .failure(let error): print(error); exit(1)
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
if #available(macOS 14.0, *) { config.preferences.inactiveSchedulingPolicy = .none }
let fixture = try String(contentsOfFile: "tests/stroke-caps.mjs", encoding: .utf8)
    .replacingOccurrences(of: "export ", with: "")
// An unattached WKWebView can suspend display callbacks. Drain them from a
// task queue so the normal painting code runs without opening a window.
let script = """
(() => {
  \(fixture)
  installCapBridge();
  const frames = new MessageChannel();
  const queue = [];
  frames.port1.onmessage = () => queue.shift()(performance.now());
  window.requestAnimationFrame = fn => { queue.push(fn); frames.port2.postMessage(null); };
  window.runCapCheck = checkStrokeCaps;
})();
"""
config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1150, height: 760), configuration: config)
let delegate = CapCheck()
view.navigationDelegate = delegate
let file = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "release/Signature Desk.html")
view.loadFileURL(file, allowingReadAccessTo: file)
DispatchQueue.main.asyncAfter(deadline: .now() + 45) { print("WebKit cap test timed out"); exit(1) }
withExtendedLifetime((view, delegate)) { app.run() }
