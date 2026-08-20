// DSH Lab — a thin native shell around the DSH web UI.
//
// It owns the `dsh web` server lifecycle: adopt one that is already listening,
// otherwise spawn `node --import tsx/esm apps/cli/src/bin.ts web` in the
// harness repo. Closing the window leaves both the app and the server running;
// quitting stops the server only if this app started it.

import AppKit
import WebKit

// 菜单/遮罩文案跟随系统语言：中文环境用中文，其余用英文。
let isZhLocale = Locale.preferredLanguages.first?.lowercased().hasPrefix("zh") ?? false
func L(_ zh: String, _ en: String) -> String { isZhLocale ? zh : en }

// MARK: - Config (baked into Info.plist at build time)

struct AppConfig {
    let harnessRoot: String
    let nodeBin: String
    let port: Int
    let logPath: String

    var url: URL { URL(string: "http://127.0.0.1:\(port)/")! }

    static func load() -> AppConfig {
        let info = Bundle.main.infoDictionary ?? [:]
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return AppConfig(
            harnessRoot: info["DSHHarnessRoot"] as? String ?? home,
            nodeBin: info["DSHNodeBin"] as? String ?? "/opt/homebrew/bin/node",
            port: (info["DSHPort"] as? NSNumber)?.intValue ?? 3080,
            logPath: info["DSHLogPath"] as? String ?? "\(home)/Library/Logs/dsh-web.log"
        )
    }
}

// MARK: - Server lifecycle

/// The server exits with this code when the in-app updater asks for a restart
/// (dsh-self-update src/updater.ts RESTART_EXIT_CODE). Anything else is a crash.
let restartExitCode: Int32 = 75

final class ServerController {
    enum State: Equatable {
        case checking
        case starting
        /// Server asked to be restarted by the in-app updater.
        case restarting
        case ready
        case failed(String)
        case exited
    }

    private let cfg: AppConfig
    private var process: Process?
    private var pollTimer: Timer?
    private var deadline = Date.distantPast
    private var stopping = false
    private var lastSpawnAt = Date.distantPast

    /// True when this app spawned the server (and is therefore allowed to kill it).
    private(set) var owned = false
    private(set) var state: State = .checking {
        didSet { if state != oldValue { onState?(state) } }
    }

    var onState: ((State) -> Void)?

    init(cfg: AppConfig) { self.cfg = cfg }

    // Any HTTP answer means something is listening — even a 404.
    private func probe(_ done: @escaping (Bool) -> Void) {
        var req = URLRequest(url: cfg.url)
        req.timeoutInterval = 2
        req.httpMethod = "HEAD"
        req.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: req) { _, response, _ in
            DispatchQueue.main.async { done(response != nil) }
        }.resume()
    }

    /// Adopt a running server, or start one.
    func ensureRunning() {
        stopping = false
        state = .checking
        probe { [weak self] up in
            guard let self else { return }
            if up {
                self.owned = false
                self.state = .ready
            } else {
                self.spawn()
            }
        }
    }

    func restart() {
        stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.ensureRunning()
        }
    }

    private func spawn() {
        let fm = FileManager.default
        fm.createFile(atPath: cfg.logPath, contents: nil)
        guard let log = FileHandle(forWritingAtPath: cfg.logPath) else {
            state = .failed(L("无法写入日志文件 \(cfg.logPath)", "Cannot write log file \(cfg.logPath)"))
            return
        }

        var env = ProcessInfo.processInfo.environment
        let nodeDir = (cfg.nodeBin as NSString).deletingLastPathComponent
        env["PATH"] = "\(nodeDir):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["HOME"] = fm.homeDirectoryForCurrentUser.path
        if env["LANG"] == nil { env["LANG"] = "zh_CN.UTF-8" }

        let p = Process()
        p.executableURL = URL(fileURLWithPath: cfg.nodeBin)
        p.arguments = ["--import", "tsx/esm", "apps/cli/src/bin.ts", "web"]
        p.currentDirectoryURL = URL(fileURLWithPath: cfg.harnessRoot)
        p.environment = env
        p.standardOutput = log
        p.standardError = log
        p.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                guard let self, !self.stopping else { return }
                self.pollTimer?.invalidate()
                self.process = nil
                // 75 = the updater restarting on purpose. Relaunch it — unless the
                // last start barely survived, which would spin a restart loop.
                let requested = proc.terminationStatus == restartExitCode
                let survived = Date().timeIntervalSince(self.lastSpawnAt) > 10
                if requested && survived {
                    self.state = .restarting
                    self.spawn()
                } else if requested {
                    self.state = .failed(L("更新后重启失败：服务启动不到 10 秒就退出了", "Restart after update failed: the service exited within 10 seconds"))
                } else {
                    self.state = .exited
                }
            }
        }

        do {
            try p.run()
        } catch {
            state = .failed(L("无法启动 node：\(error.localizedDescription)", "Failed to launch node: \(error.localizedDescription)"))
            return
        }

        process = p
        owned = true
        lastSpawnAt = Date()
        if state != .restarting { state = .starting }
        deadline = Date().addingTimeInterval(120)

        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            self.probe { up in
                if up {
                    timer.invalidate()
                    self.state = .ready
                } else if Date() > self.deadline {
                    timer.invalidate()
                    self.state = .failed(L("启动超时（120 秒仍未监听 \(self.cfg.port)）", "Startup timed out (port \(self.cfg.port) not listening after 120 s)"))
                }
            }
        }
    }

    func stop() {
        stopping = true
        pollTimer?.invalidate()
        guard owned, let p = process, p.isRunning else { return }
        p.terminate()
        let limit = Date().addingTimeInterval(5)
        while p.isRunning && Date() < limit {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        if p.isRunning { kill(p.processIdentifier, SIGKILL) }
        process = nil
        owned = false
    }

    func logTail(lines: Int = 40) -> String {
        guard let data = FileManager.default.contents(atPath: cfg.logPath),
              let text = String(data: data, encoding: .utf8) else { return "" }
        let all = text.split(separator: "\n", omittingEmptySubsequences: false)
        return all.suffix(lines).joined(separator: "\n")
    }
}

// MARK: - Status overlay

final class StatusOverlay: NSView {
    private let spinner = NSProgressIndicator()
    private let title = NSTextField(labelWithString: "")
    private let detail = NSTextView()
    private let scroll = NSScrollView()
    private let retry = NSButton(title: L("重试", "Retry"), target: nil, action: nil)
    private let openLog = NSButton(title: L("打开日志", "Open Log"), target: nil, action: nil)

    var onRetry: (() -> Void)?
    var onOpenLog: (() -> Void)?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true

        let effect = NSVisualEffectView()
        effect.material = .underWindowBackground
        effect.blendingMode = .behindWindow
        effect.state = .active
        effect.translatesAutoresizingMaskIntoConstraints = false
        addSubview(effect)

        spinner.style = .spinning
        spinner.controlSize = .regular
        spinner.translatesAutoresizingMaskIntoConstraints = false

        title.font = .systemFont(ofSize: 15, weight: .medium)
        title.alignment = .center
        title.translatesAutoresizingMaskIntoConstraints = false

        detail.isEditable = false
        detail.drawsBackground = false
        detail.font = .monospacedSystemFont(ofSize: 10, weight: .regular)
        detail.textColor = .secondaryLabelColor
        scroll.documentView = detail
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        scroll.borderType = .noBorder
        scroll.isHidden = true
        scroll.translatesAutoresizingMaskIntoConstraints = false

        retry.bezelStyle = .rounded
        retry.target = self
        retry.action = #selector(retryTapped)
        retry.isHidden = true
        openLog.bezelStyle = .rounded
        openLog.target = self
        openLog.action = #selector(openLogTapped)
        openLog.isHidden = true

        let buttons = NSStackView(views: [retry, openLog])
        buttons.spacing = 10
        buttons.translatesAutoresizingMaskIntoConstraints = false

        for v in [spinner, title, scroll, buttons] { addSubview(v) }

        NSLayoutConstraint.activate([
            effect.topAnchor.constraint(equalTo: topAnchor),
            effect.bottomAnchor.constraint(equalTo: bottomAnchor),
            effect.leadingAnchor.constraint(equalTo: leadingAnchor),
            effect.trailingAnchor.constraint(equalTo: trailingAnchor),

            spinner.centerXAnchor.constraint(equalTo: centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -70),
            title.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
            title.centerXAnchor.constraint(equalTo: centerXAnchor),
            title.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24),

            buttons.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 14),
            buttons.centerXAnchor.constraint(equalTo: centerXAnchor),

            scroll.topAnchor.constraint(equalTo: buttons.bottomAnchor, constant: 14),
            scroll.centerXAnchor.constraint(equalTo: centerXAnchor),
            scroll.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.8),
            scroll.heightAnchor.constraint(equalToConstant: 150),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    @objc private func retryTapped() { onRetry?() }
    @objc private func openLogTapped() { onOpenLog?() }

    func show(busy: Bool, text: String, log: String?) {
        isHidden = false
        title.stringValue = text
        if busy { spinner.startAnimation(nil) } else { spinner.stopAnimation(nil) }
        spinner.isHidden = !busy
        retry.isHidden = busy
        openLog.isHidden = busy
        if let log, !log.isEmpty {
            detail.string = log
            scroll.isHidden = false
            detail.scrollToEndOfDocument(nil)
        } else {
            scroll.isHidden = true
        }
    }
}

// MARK: - Main window

final class MainWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let cfg: AppConfig
    private let server: ServerController
    let webView: WKWebView
    private let overlay = StatusOverlay(frame: .zero)
    private var loadedOnce = false

    init(cfg: AppConfig, server: ServerController) {
        self.cfg = cfg
        self.server = server

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = false

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "DSH"
        window.setFrameAutosaveName("DSHLabMainWindow")
        window.tabbingMode = .disallowed
        super.init(window: window)

        webView.navigationDelegate = self
        webView.uiDelegate = self

        let content = NSView()
        content.addSubview(webView)
        content.addSubview(overlay)
        webView.translatesAutoresizingMaskIntoConstraints = false
        overlay.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: content.topAnchor),
            webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: content.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: content.trailingAnchor),
        ])
        window.contentView = content
        window.center()

        overlay.onRetry = { [weak self] in self?.server.restart() }
        overlay.onOpenLog = { [weak self] in
            guard let self else { return }
            NSWorkspace.shared.open(URL(fileURLWithPath: self.cfg.logPath))
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    func apply(state: ServerController.State) {
        switch state {
        case .checking:
            overlay.show(busy: true, text: L("正在检查 DSH 服务…", "Checking DSH service…"), log: nil)
        case .starting:
            loadedOnce = false
            overlay.show(busy: true, text: L("正在启动 DSH 服务（首次编译约 5–20 秒）…", "Starting DSH service (first compile takes ~5–20 s)…"), log: nil)
        case .restarting:
            loadedOnce = false
            overlay.show(busy: true, text: L("更新已装好，正在重启 DSH 服务…", "Update installed, restarting DSH service…"), log: nil)
        case .ready:
            overlay.isHidden = true
            if !loadedOnce {
                loadedOnce = true
                webView.load(URLRequest(url: cfg.url))
            }
        case .failed(let msg):
            loadedOnce = false
            overlay.show(busy: false, text: L("DSH 服务启动失败：\(msg)", "DSH service failed to start: \(msg)"), log: server.logTail())
        case .exited:
            loadedOnce = false
            overlay.show(busy: false, text: L("DSH 服务已退出", "DSH service exited"), log: server.logTail())
        }
    }

    @objc func reload() { webView.reload() }

    // 菜单「检查更新…」：派发页面里 UpdateAction 监听的 window 事件，
    // 弹出应用内的更新页并立即检查——与设置页/侧栏共用同一条状态流。
    @objc func checkForUpdates() {
        window?.makeKeyAndOrderFront(nil)
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('dsh-self-update:open', { detail: { check: true } }))",
            completionHandler: nil
        )
    }

    @objc func openInBrowser() { NSWorkspace.shared.open(cfg.url) }
    @objc func zoomIn() { webView.pageZoom = min(webView.pageZoom + 0.1, 3.0) }
    @objc func zoomOut() { webView.pageZoom = max(webView.pageZoom - 0.1, 0.5) }
    @objc func zoomReset() { webView.pageZoom = 1.0 }

    // Keep localhost inside the shell; send everything else to the default browser.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
        let local = ["127.0.0.1", "localhost", "::1"]
        if let host = url.host, !local.contains(host), navigationAction.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadedOnce = false
        overlay.show(busy: false, text: L("页面加载失败：\(error.localizedDescription)", "Page failed to load: \(error.localizedDescription)"), log: server.logTail())
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        self.webView(webView, didFail: navigation, withError: error)
    }

    // target=_blank inside the app opens externally rather than creating a stray window.
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // Artifact downloads land in ~/Downloads.
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload,
                  decideDestinationUsing response: URLResponse,
                  suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        var dest = dir.appendingPathComponent(suggestedFilename)
        var n = 1
        while FileManager.default.fileExists(atPath: dest.path) {
            let base = (suggestedFilename as NSString).deletingPathExtension
            let ext = (suggestedFilename as NSString).pathExtension
            let name = ext.isEmpty ? "\(base)-\(n)" : "\(base)-\(n).\(ext)"
            dest = dir.appendingPathComponent(name)
            n += 1
        }
        completionHandler(dest)
    }
}

// MARK: - App delegate

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let cfg = AppConfig.load()
    private var server: ServerController!
    private var windowController: MainWindowController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        server = ServerController(cfg: cfg)
        windowController = MainWindowController(cfg: cfg, server: server)
        server.onState = { [weak self] state in self?.windowController.apply(state: state) }

        buildMenu()
        windowController.showWindow(nil)
        windowController.apply(state: .checking)
        NSApp.activate(ignoringOtherApps: true)
        server.ensureRunning()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { windowController.showWindow(nil) }
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        server.stop()
    }

    @objc private func restartServer() {
        windowController.apply(state: .checking)
        server.restart()
    }

    @objc private func openLog() {
        NSWorkspace.shared.open(URL(fileURLWithPath: cfg.logPath))
    }

    private func item(_ title: String, _ sel: Selector?, _ key: String,
                      _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
        let it = NSMenuItem(title: title, action: sel, keyEquivalent: key)
        it.keyEquivalentModifierMask = mods
        it.target = target
        return it
    }

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(item(L("关于 DSH", "About DSH"), #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""))
        appMenu.addItem(item(L("检查更新…", "Check for Updates…"), #selector(MainWindowController.checkForUpdates), "", target: windowController))
        appMenu.addItem(.separator())
        appMenu.addItem(item(L("隐藏 DSH", "Hide DSH"), #selector(NSApplication.hide(_:)), "h"))
        appMenu.addItem(item(L("隐藏其他", "Hide Others"), #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]))
        appMenu.addItem(.separator())
        appMenu.addItem(item(L("退出 DSH（并停止服务）", "Quit DSH (stops the service)"), #selector(NSApplication.terminate(_:)), "q"))
        appItem.submenu = appMenu
        main.addItem(appItem)

        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: L("文件", "File"))
        fileMenu.addItem(item(L("关闭窗口（服务继续后台运行）", "Close Window (service keeps running)"), #selector(NSWindow.performClose(_:)), "w"))
        fileItem.submenu = fileMenu
        main.addItem(fileItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: L("编辑", "Edit"))
        editMenu.addItem(item(L("撤销", "Undo"), Selector(("undo:")), "z"))
        editMenu.addItem(item(L("重做", "Redo"), Selector(("redo:")), "z", [.command, .shift]))
        editMenu.addItem(.separator())
        editMenu.addItem(item(L("剪切", "Cut"), #selector(NSText.cut(_:)), "x"))
        editMenu.addItem(item(L("拷贝", "Copy"), #selector(NSText.copy(_:)), "c"))
        editMenu.addItem(item(L("粘贴", "Paste"), #selector(NSText.paste(_:)), "v"))
        editMenu.addItem(item(L("全选", "Select All"), #selector(NSText.selectAll(_:)), "a"))
        editItem.submenu = editMenu
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: L("显示", "View"))
        viewMenu.addItem(item(L("重新载入页面", "Reload Page"), #selector(MainWindowController.reload), "r", target: windowController))
        viewMenu.addItem(.separator())
        viewMenu.addItem(item(L("放大", "Zoom In"), #selector(MainWindowController.zoomIn), "+", target: windowController))
        viewMenu.addItem(item(L("缩小", "Zoom Out"), #selector(MainWindowController.zoomOut), "-", target: windowController))
        viewMenu.addItem(item(L("实际大小", "Actual Size"), #selector(MainWindowController.zoomReset), "0", target: windowController))
        viewMenu.addItem(.separator())
        viewMenu.addItem(item(L("进入全屏", "Enter Full Screen"), #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]))
        viewItem.submenu = viewMenu
        main.addItem(viewItem)

        let svcItem = NSMenuItem()
        let svcMenu = NSMenu(title: L("服务", "Service"))
        svcMenu.addItem(item(L("重启 DSH 服务", "Restart DSH Service"), #selector(restartServer), "r", [.command, .shift], target: self))
        svcMenu.addItem(item(L("在浏览器中打开", "Open in Browser"), #selector(MainWindowController.openInBrowser), "o", [.command, .shift], target: windowController))
        svcMenu.addItem(item(L("打开服务日志", "Open Service Log"), #selector(openLog), "l", [.command, .shift], target: self))
        svcItem.submenu = svcMenu
        main.addItem(svcItem)

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
