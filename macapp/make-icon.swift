// Composites a flat logo PNG onto a macOS-style rounded-square plate.
// The logo is cropped to its opaque bounding box first — SVG renders usually
// carry a wide transparent margin, which would otherwise shrink the artwork.
//
// usage: make-icon <logo.png> <out-1024.png>

import AppKit

let args = CommandLine.arguments
guard args.count == 3,
      let raw = NSImage(contentsOfFile: args[1]),
      let rawCG = raw.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: make-icon <logo.png> <out.png>\n".data(using: .utf8)!)
    exit(1)
}

/// Tightest rect containing actual artwork. Renderers differ: some hand back a
/// transparent margin, QuickLook hands back an opaque letterboxed plate — so
/// treat both fully transparent pixels and pixels matching the corner colour as
/// background.
func contentBounds(_ image: CGImage) -> CGRect {
    let w = image.width, h = image.height
    var pixels = [UInt8](repeating: 0, count: w * h * 4)
    guard let ctx = CGContext(data: &pixels, width: w, height: h,
                              bitsPerComponent: 8, bytesPerRow: w * 4,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        return CGRect(x: 0, y: 0, width: w, height: h)
    }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

    func px(_ x: Int, _ y: Int) -> (Int, Int, Int, Int) {
        let i = (y * w + x) * 4
        return (Int(pixels[i]), Int(pixels[i + 1]), Int(pixels[i + 2]), Int(pixels[i + 3]))
    }
    let bg = px(0, 0)

    var minX = w, minY = h, maxX = -1, maxY = -1
    for y in 0..<h {
        for x in 0..<w {
            let (r, g, b, a) = px(x, y)
            if a <= 8 { continue }
            if bg.3 > 8,
               abs(r - bg.0) < 24, abs(g - bg.1) < 24, abs(b - bg.2) < 24 { continue }
            if x < minX { minX = x }
            if x > maxX { maxX = x }
            if y < minY { minY = y }
            if y > maxY { maxY = y }
        }
    }
    guard maxX >= minX, maxY >= minY else { return CGRect(x: 0, y: 0, width: w, height: h) }
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

let bounds = contentBounds(rawCG)
let logoCG = rawCG.cropping(to: bounds) ?? rawCG
let logo = NSImage(cgImage: logoCG, size: NSSize(width: logoCG.width, height: logoCG.height))

let side: CGFloat = 1024
let inset: CGFloat = 100          // Big Sur content area is 824pt inside 1024pt
let radius: CGFloat = 185
let fill: CGFloat = 0.80          // share of the plate the artwork spans
let canvas = NSImage(size: NSSize(width: side, height: side))

canvas.lockFocus()
let plate = NSRect(x: inset, y: inset, width: side - inset * 2, height: side - inset * 2)
let path = NSBezierPath(roundedRect: plate, xRadius: radius, yRadius: radius)

NSGraphicsContext.current?.saveGraphicsState()
path.addClip()
let gradient = NSGradient(colors: [
    NSColor(calibratedRed: 1.00, green: 1.00, blue: 1.00, alpha: 1),
    NSColor(calibratedRed: 0.92, green: 0.94, blue: 0.98, alpha: 1),
])
gradient?.draw(in: plate, angle: -90)
NSGraphicsContext.current?.restoreGraphicsState()

// Hairline edge so the plate stays visible on a white desktop.
NSColor(calibratedWhite: 0, alpha: 0.10).setStroke()
path.lineWidth = 2
path.stroke()

// Fit the cropped artwork into the plate, preserving aspect ratio.
let box = plate.insetBy(dx: plate.width * (1 - fill) / 2, dy: plate.height * (1 - fill) / 2)
let aspect = CGFloat(logoCG.width) / CGFloat(logoCG.height)
var drawSize = NSSize(width: box.width, height: box.width / aspect)
if drawSize.height > box.height {
    drawSize = NSSize(width: box.height * aspect, height: box.height)
}
let logoRect = NSRect(
    x: plate.midX - drawSize.width / 2,
    y: plate.midY - drawSize.height / 2,
    width: drawSize.width,
    height: drawSize.height
)
logo.draw(in: logoRect, from: .zero, operation: .sourceOver, fraction: 1.0)
canvas.unlockFocus()

guard let tiff = canvas.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
    FileHandle.standardError.write("failed to encode png\n".data(using: .utf8)!)
    exit(1)
}
try png.write(to: URL(fileURLWithPath: args[2]))
FileHandle.standardError.write(
    "logo bbox \(Int(bounds.width))x\(Int(bounds.height)) of \(rawCG.width)x\(rawCG.height)\n".data(using: .utf8)!)
