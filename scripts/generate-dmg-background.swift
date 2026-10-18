// Run from the repository root on macOS: swift scripts/generate-dmg-background.swift
import AppKit

let size = NSSize(width: 720, height: 570)
let image = NSImage(size: size)
image.lockFocusFlipped(true)

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> NSColor {
    NSColor(srgbRed: red / 255, green: green / 255, blue: blue / 255, alpha: 1)
}

func text(_ value: String, _ x: CGFloat, _ y: CGFloat, _ width: CGFloat,
          _ fontSize: CGFloat, _ ink: NSColor, bold: Bool = false) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = 5
    value.draw(in: NSRect(x: x, y: y, width: width, height: 90), withAttributes: [
        .font: NSFont.systemFont(ofSize: fontSize, weight: bold ? .semibold : .regular),
        .foregroundColor: ink,
        .paragraphStyle: paragraph
    ])
}

let ink = color(30, 41, 59)
let muted = color(71, 85, 105)
let blue = color(37, 99, 235)
color(245, 247, 251).setFill()
NSRect(origin: .zero, size: size).fill()

text("安装 StoneSVN", 40, 28, 640, 26, ink, bold: true)
text("拖入右侧「应用程序」，然后从应用程序中打开。", 40, 68, 640, 16, muted)
text("Drag StoneSVN into Applications, then open it from there.", 40, 94, 640, 13, muted)

// Finder places the application and Applications shortcut over this area.
text("→", 335, 154, 60, 38, blue)

color(255, 255, 255).setFill()
NSBezierPath(roundedRect: NSRect(x: 28, y: 286, width: 664, height: 244),
             xRadius: 16, yRadius: 16).fill()
text("首次打开被阻止？", 48, 304, 624, 20, ink, bold: true)
text("此版本未经过 Apple 公证。确认来源可信后，按以下步骤打开：", 48, 338, 624, 14, muted)
text("1. 先尝试打开 StoneSVN，再打开「系统设置」。", 48, 370, 624, 16, ink)
text("2. 进入「隐私与安全性」，向下滚动至「安全性」。", 48, 402, 624, 16, ink)
text("3. 点击「仍要打开」，再确认「打开」。", 48, 434, 624, 17, blue, bold: true)
text("First launch blocked? Try opening the app, then go to System Settings\n→ Privacy & Security → Open Anyway → Open.", 48, 474, 624, 12, muted)

image.unlockFocus()
guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not render DMG background")
}
let output = URL(fileURLWithPath: "src-tauri/installer/dmg-background.png")
try png.write(to: output)
print("Generated \(output.path) (\(bitmap.pixelsWide) × \(bitmap.pixelsHigh))")
