import AppKit
import Foundation

let resources = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
let page = resources.appendingPathComponent("纸上文字.html")
let bridge = resources.appendingPathComponent("ai/bridge.py")
if CommandLine.arguments.contains("--check") {
    guard FileManager.default.fileExists(atPath: page.path), FileManager.default.fileExists(atPath: bridge.path) else { exit(1) }
    print("Paper Lettering 0.8 preview resources present")
    exit(0)
}
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let task = Process()
let output = Pipe(), errors = Pipe()
var finished = false
func finish(_ error: String? = nil) {
    guard !finished else { return }
    finished = true
    if let error = error {
        let alert = NSAlert()
        alert.messageText = "AI 启动没有完成"
        alert.informativeText = error + "\n\n可以先离线编辑，稍后重新打开本应用。"
        alert.addButton(withTitle: "打开离线编辑器")
        alert.addButton(withTitle: "关闭")
        if alert.runModal() == .alertFirstButtonReturn { NSWorkspace.shared.open(page) }
    }
    application.terminate(nil)
}
DispatchQueue.main.async {
    guard let python = ["/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"].first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
        finish("没有找到 Python 3。AI 启动器需要 Python 3.9 或更新版本。")
        return
    }
    task.executableURL = URL(fileURLWithPath: python)
    task.arguments = [bridge.path, "--html", page.path, "--open"]
    task.standardOutput = output
    task.standardError = errors
    do { try task.run() } catch { finish(error.localizedDescription); return }
    // Wait for the loopback server and browser launch, instead of silently exiting.
    DispatchQueue.global().async {
        let response = String(data: output.fileHandleForReading.availableData, encoding: .utf8) ?? ""
        if response.contains("READY") { DispatchQueue.main.async { finish() } }
        else {
            let detail = String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "本机连接服务未能启动。"
            DispatchQueue.main.async { finish(String(detail.prefix(1500))) }
        }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
        if !finished { if task.isRunning { task.terminate() }; finish("启动等待超过 30 秒。请检查 Python 和浏览器是否可用。") }
    }
}
application.run()
