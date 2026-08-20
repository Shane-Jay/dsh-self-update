// Renders an SVG to a transparent PNG at a chosen size, via WebKit.
// QuickLook thumbnails draw the SVG at its intrinsic size on an opaque plate;
// this scales the viewBox to fill the frame instead.
//
// usage: render-svg <in.svg> <out.png> <size>

import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count == 4,
      let svg = try? String(contentsOfFile: args[1], encoding: .utf8),
      let size = Double(args[3]) else {
    FileHandle.standardError.write("usage: render-svg <in.svg> <out.png> <size>\n".data(using: .utf8)!)
    exit(1)
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

let side = CGFloat(size)
let frame = NSRect(x: 0, y: 0, width: side, height: side)
let webView = WKWebView(frame: frame, configuration: WKWebViewConfiguration())
// The favicon flips to white under prefers-color-scheme: dark — pin light.
webView.appearance = NSAppearance(named: .aqua)
webView.setValue(false, forKey: "drawsBackground")

let html = """
<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: 100vw; height: 100vh; }
</style>
\(svg)
"""

final class Waiter: NSObject, WKNavigationDelegate {
    var done = false
    let out: String
    let webView: WKWebView
    init(out: String, webView: WKWebView) {
        self.out = out
        self.webView = webView
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // One extra runloop turn so layout settles before the snapshot.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            let config = WKSnapshotConfiguration()
            config.rect = webView.bounds
            config.afterScreenUpdates = true
            webView.takeSnapshot(with: config) { image, error in
                defer { self.done = true }
                guard let image,
                      let tiff = image.tiffRepresentation,
                      let rep = NSBitmapImageRep(data: tiff),
                      let png = rep.representation(using: .png, properties: [:]) else {
                    FileHandle.standardError.write(
                        "snapshot failed: \(error?.localizedDescription ?? "unknown")\n".data(using: .utf8)!)
                    exit(1)
                }
                try? png.write(to: URL(fileURLWithPath: self.out))
            }
        }
    }
}

let waiter = Waiter(out: args[2], webView: webView)
webView.navigationDelegate = waiter
webView.loadHTMLString(html, baseURL: nil)

let limit = Date().addingTimeInterval(30)
while !waiter.done && Date() < limit {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
}
exit(waiter.done ? 0 : 1)
