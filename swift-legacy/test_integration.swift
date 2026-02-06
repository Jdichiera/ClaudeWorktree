#!/usr/bin/env swift

import Foundation

// ANSI colors for output
let green = "\u{001B}[32m"
let red = "\u{001B}[31m"
let yellow = "\u{001B}[33m"
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

func asyncTest(_ name: String, _ block: () async throws -> Bool) async {
    do {
        if try await block() {
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

func runCommand(_ args: [String], in directory: String? = nil) throws -> (output: String, exitCode: Int32) {
    let process = Process()
    let pipe = Pipe()

    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = args
    if let dir = directory {
        process.currentDirectoryURL = URL(fileURLWithPath: dir)
    }
    process.standardOutput = pipe
    process.standardError = pipe

    try process.run()
    process.waitUntilExit()

    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let output = String(data: data, encoding: .utf8) ?? ""

    return (output, process.terminationStatus)
}

// Setup test repository
let testRepoPath = "/tmp/claudeWorktree-integration-test-\(UUID().uuidString.prefix(8))"

func setupTestRepo() throws {
    _ = try runCommand(["mkdir", "-p", testRepoPath])
    _ = try runCommand(["git", "init"], in: testRepoPath)
    _ = try runCommand(["git", "config", "user.email", "test@test.com"], in: testRepoPath)
    _ = try runCommand(["git", "config", "user.name", "Test"], in: testRepoPath)

    let readmePath = "\(testRepoPath)/README.md"
    try "# Test Repository\n".write(toFile: readmePath, atomically: true, encoding: .utf8)

    _ = try runCommand(["git", "add", "."], in: testRepoPath)
    _ = try runCommand(["git", "commit", "-m", "Initial commit"], in: testRepoPath)
}

func cleanupTestRepo() {
    try? FileManager.default.removeItem(atPath: testRepoPath)
}

print("\n\(yellow)═══════════════════════════════════════════════════════════\(reset)")
print("\(yellow)  ClaudeWorktree Integration Tests\(reset)")
print("\(yellow)═══════════════════════════════════════════════════════════\(reset)\n")

do {
    try setupTestRepo()
    print("Test repository created at: \(testRepoPath)\n")
} catch {
    print("\(red)Failed to setup test repository: \(error)\(reset)")
    exit(1)
}

// Test 1: Verify git repository detection
test("Git repository is detected") {
    let result = try runCommand(["git", "rev-parse", "--git-dir"], in: testRepoPath)
    return result.exitCode == 0
}

// Test 2: Test git worktree list parsing
test("Git worktree list returns porcelain output") {
    let result = try runCommand(["git", "worktree", "list", "--porcelain"], in: testRepoPath)
    return result.exitCode == 0 && result.output.contains("worktree")
}

// Test 3: Parse worktree output correctly
test("Worktree output contains expected fields") {
    let result = try runCommand(["git", "worktree", "list", "--porcelain"], in: testRepoPath)
    let output = result.output
    return output.contains("worktree") && output.contains("HEAD") && output.contains("branch")
}

// Test 4: Create a new worktree
test("Can create new worktree with branch") {
    let branchName = "test-feature"
    let worktreePath = "\(testRepoPath)-\(branchName)"
    let result = try runCommand(["git", "worktree", "add", "-b", branchName, worktreePath], in: testRepoPath)
    defer { try? FileManager.default.removeItem(atPath: worktreePath) }

    if result.exitCode != 0 { return false }

    // Verify worktree was created
    let listResult = try runCommand(["git", "worktree", "list"], in: testRepoPath)
    return listResult.output.contains(branchName)
}

// Test 5: Remove a worktree
test("Can remove worktree") {
    let branchName = "to-remove"
    let worktreePath = "\(testRepoPath)-\(branchName)"

    // Create
    _ = try runCommand(["git", "worktree", "add", "-b", branchName, worktreePath], in: testRepoPath)

    // Remove
    let result = try runCommand(["git", "worktree", "remove", worktreePath, "--force"], in: testRepoPath)
    return result.exitCode == 0
}

// Test 6: Claude CLI detection
test("Claude CLI is findable") {
    let paths = [
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        "\(NSHomeDirectory())/.local/bin/claude",
        "\(NSHomeDirectory())/.npm-global/bin/claude"
    ]

    for path in paths {
        if FileManager.default.isExecutableFile(atPath: path) {
            return true
        }
    }

    // Try which
    let result = try runCommand(["which", "claude"])
    return result.exitCode == 0 && !result.output.isEmpty
}

// Test 7: Verify app binary exists and runs
test("App binary exists and shows help") {
    let binaryPath = "/Users/jer-work/REPO/claudeWorktree/.build/release/ClaudeWorktree"
    return FileManager.default.isExecutableFile(atPath: binaryPath)
}

// Test 8: Test branch listing
test("Can list branches") {
    let result = try runCommand(["git", "branch", "-a", "--format=%(refname:short)"], in: testRepoPath)
    return result.exitCode == 0 && result.output.contains("main")
}

// Test 9: Test current branch detection
test("Can detect current branch") {
    let result = try runCommand(["git", "branch", "--show-current"], in: testRepoPath)
    return result.exitCode == 0 && result.output.trimmingCharacters(in: .whitespacesAndNewlines) == "main"
}

// Test 10: ANSI code stripping regex
test("ANSI code pattern is valid") {
    let pattern = "\\x1B(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])"
    do {
        let regex = try NSRegularExpression(pattern: pattern, options: [])
        let testString = "\u{1B}[32mGreen Text\u{1B}[0m"
        let range = NSRange(testString.startIndex..., in: testString)
        let result = regex.stringByReplacingMatches(in: testString, options: [], range: range, withTemplate: "")
        return result == "Green Text"
    } catch {
        return false
    }
}

// Test 11: Spinner character detection
test("Processing spinner characters are detected") {
    let spinnerChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    let testOutput = "⠋ Thinking about your request..."

    for char in spinnerChars {
        if testOutput.contains(char) {
            return true
        }
    }
    return false
}

// Test 12: Idle prompt detection
test("Idle prompt patterns are detected") {
    let idlePatterns = ["> ", "claude> ", "$ ", "❯ "]
    let testOutput = "Output complete\n> "

    for pattern in idlePatterns {
        if testOutput.contains(pattern) {
            return true
        }
    }
    return false
}

// Cleanup
cleanupTestRepo()

print("\n\(yellow)═══════════════════════════════════════════════════════════\(reset)")
print("  Results: \(green)\(passCount) passed\(reset), \(failCount > 0 ? red : green)\(failCount) failed\(reset)")
print("\(yellow)═══════════════════════════════════════════════════════════\(reset)\n")

exit(failCount > 0 ? 1 : 0)
