import XCTest
@testable import ClaudeWorktree

final class ClaudeProcessManagerTests: XCTestCase {

    func testFindClaudeExecutable() {
        let path = ClaudeProcessManager.findClaudeExecutable()
        // This may or may not find claude depending on the system
        // Just verify it doesn't crash
        if let path = path {
            XCTAssertTrue(FileManager.default.fileExists(atPath: path), "Found path should exist")
        }
    }

    func testGetShellEnvironment() {
        let env = ClaudeProcessManager.getShellEnvironment()
        XCTAssertNotNil(env["PATH"], "PATH should be set")
        XCTAssertTrue(env["PATH"]!.contains("/usr/bin"), "PATH should contain /usr/bin")
    }

    func testCreateStartCommand() {
        let command = ClaudeProcessManager.createStartCommand(workingDirectory: "/tmp")

        if ClaudeProcessManager.findClaudeExecutable() != nil {
            XCTAssertNotNil(command, "Should create command when claude is found")
            if let cmd = command {
                XCTAssertTrue(cmd.executable.hasSuffix("sh") || cmd.executable.hasSuffix("zsh") || cmd.executable.hasSuffix("bash"),
                             "Executable should be a shell")
                XCTAssertTrue(cmd.args.contains("-l"), "Should use login shell")
            }
        } else {
            XCTAssertNil(command, "Should return nil when claude is not found")
        }
    }
}
