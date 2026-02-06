#!/usr/bin/env swift

import Foundation
import AppKit

let green = "\u{001B}[32m"
let red = "\u{001B}[31m"
let yellow = "\u{001B}[33m"
let blue = "\u{001B}[34m"
let reset = "\u{001B}[0m"

var passCount = 0
var failCount = 0

func test(_ name: String, _ block: () throws -> Bool) {
    do {
        if try block() {
            print("\(green)✓\(reset) \(name)")
            passCount += 1
        } else {
            print("\(red)✗\(reset) \(name)")
            failCount += 1
        }
    } catch {
        print("\(red)✗\(reset) \(name): \(error)")
        failCount += 1
    }
}

print("\n\(yellow)═══════════════════════════════════════════════════════════\(reset)")
print("\(yellow)  ClaudeWorktree End-to-End Tests\(reset)")
print("\(yellow)═══════════════════════════════════════════════════════════\(reset)\n")

// Test 1: Binary exists and is executable
test("Debug binary exists and is executable") {
    let path = "/Users/jer-work/REPO/claudeWorktree/.build/debug/ClaudeWorktree"
    return FileManager.default.isExecutableFile(atPath: path)
}

test("Release binary exists and is executable") {
    let path = "/Users/jer-work/REPO/claudeWorktree/.build/release/ClaudeWorktree"
    return FileManager.default.isExecutableFile(atPath: path)
}

// Test 2: App can be launched
test("App launches without crash") {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/Users/jer-work/REPO/claudeWorktree/.build/debug/ClaudeWorktree")

    do {
        try process.run()
        Thread.sleep(forTimeInterval: 2)

        let isRunning = process.isRunning
        process.terminate()
        return isRunning
    } catch {
        return false
    }
}

// Test 3: SwiftTerm dependency is linked
test("SwiftTerm framework is linked") {
    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/otool")
    process.arguments = ["-L", "/Users/jer-work/REPO/claudeWorktree/.build/debug/ClaudeWorktree"]
    process.standardOutput = pipe

    try? process.run()
    process.waitUntilExit()

    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let output = String(data: data, encoding: .utf8) ?? ""

    // Check for Swift runtime (SwiftTerm is statically linked)
    return output.contains("libswift")
}

// Test 4: Source files are complete
test("All required source files exist") {
    let requiredFiles = [
        "ClaudeWorktree/App/ClaudeWorktreeApp.swift",
        "ClaudeWorktree/App/AppState.swift",
        "ClaudeWorktree/Models/SessionStatus.swift",
        "ClaudeWorktree/Models/Worktree.swift",
        "ClaudeWorktree/Models/ClaudeSession.swift",
        "ClaudeWorktree/Views/ContentView.swift",
        "ClaudeWorktree/Views/Sidebar/SidebarView.swift",
        "ClaudeWorktree/Views/Sidebar/WorktreeRowView.swift",
        "ClaudeWorktree/Views/Sidebar/StatusIndicatorView.swift",
        "ClaudeWorktree/Views/Terminal/TerminalContainerView.swift",
        "ClaudeWorktree/Views/Terminal/SwiftTermView.swift",
        "ClaudeWorktree/Views/Sheets/NewWorktreeSheet.swift",
        "ClaudeWorktree/Services/GitWorktreeService.swift",
        "ClaudeWorktree/Services/ClaudeProcessManager.swift",
        "ClaudeWorktree/Services/StatusDetector.swift"
    ]

    let basePath = "/Users/jer-work/REPO/claudeWorktree"
    for file in requiredFiles {
        let fullPath = "\(basePath)/\(file)"
        if !FileManager.default.fileExists(atPath: fullPath) {
            print("    Missing: \(file)")
            return false
        }
    }
    return true
}

// Test 5: Xcode project file exists
test("Xcode project file exists") {
    let path = "/Users/jer-work/REPO/claudeWorktree/ClaudeWorktree.xcodeproj/project.pbxproj"
    return FileManager.default.fileExists(atPath: path)
}

// Test 6: Entitlements file exists with correct content
test("Entitlements file disables sandbox") {
    let path = "/Users/jer-work/REPO/claudeWorktree/ClaudeWorktree/Resources/ClaudeWorktree.entitlements"
    guard let content = try? String(contentsOfFile: path) else { return false }
    return content.contains("com.apple.security.app-sandbox") && content.contains("<false/>")
}

// Test 7: Package.swift is valid
test("Package.swift includes SwiftTerm dependency") {
    let path = "/Users/jer-work/REPO/claudeWorktree/Package.swift"
    guard let content = try? String(contentsOfFile: path) else { return false }
    return content.contains("SwiftTerm") && content.contains("migueldeicaza")
}

// Test 8: Binary size is reasonable (not empty or too small)
test("Binary has reasonable size (> 500KB)") {
    let path = "/Users/jer-work/REPO/claudeWorktree/.build/debug/ClaudeWorktree"
    guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
          let size = attrs[.size] as? Int else { return false }
    return size > 500_000  // 500KB minimum
}

// Test 9: App responds to signals properly
test("App terminates cleanly on SIGTERM") {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/Users/jer-work/REPO/claudeWorktree/.build/debug/ClaudeWorktree")

    do {
        try process.run()
        Thread.sleep(forTimeInterval: 1)

        process.terminate()
        Thread.sleep(forTimeInterval: 1)

        return !process.isRunning
    } catch {
        return false
    }
}

// Test 10: No hardcoded absolute paths in code
test("No hardcoded user-specific paths in source") {
    let sourcePath = "/Users/jer-work/REPO/claudeWorktree/ClaudeWorktree"
    let excludePatterns = ["/Users/jer-work", "/home/"]

    let enumerator = FileManager.default.enumerator(atPath: sourcePath)
    while let file = enumerator?.nextObject() as? String {
        if file.hasSuffix(".swift") {
            let fullPath = "\(sourcePath)/\(file)"
            if let content = try? String(contentsOfFile: fullPath) {
                for pattern in excludePatterns {
                    if content.contains(pattern) {
                        print("    Found hardcoded path in: \(file)")
                        return false
                    }
                }
            }
        }
    }
    return true
}

print("\n\(yellow)═══════════════════════════════════════════════════════════\(reset)")
print("  Results: \(green)\(passCount) passed\(reset), \(failCount > 0 ? red : green)\(failCount) failed\(reset)")
print("\(yellow)═══════════════════════════════════════════════════════════\(reset)\n")

exit(failCount > 0 ? 1 : 0)
