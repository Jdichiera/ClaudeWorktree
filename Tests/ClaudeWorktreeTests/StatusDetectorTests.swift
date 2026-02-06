import XCTest
@testable import ClaudeWorktree

final class StatusDetectorTests: XCTestCase {
    var detector: StatusDetector!

    override func setUp() {
        detector = StatusDetector()
    }

    func testInitialStatus() {
        XCTAssertEqual(detector.currentStatus, .disconnected, "Initial status should be disconnected")
    }

    func testProcessingDetection() async throws {
        // Simulate spinner output
        detector.processOutput("⠋ Thinking...")

        // Wait for debounce
        try await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(detector.currentStatus, .processing, "Should detect processing from spinner")
    }

    func testProcessingKeywords() async throws {
        detector.processOutput("Reading file.swift")

        try await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(detector.currentStatus, .processing, "Should detect processing from keyword")
    }

    func testIdleDetection() async throws {
        detector.markConnected()
        detector.processOutput("Some output\n> ")

        try await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(detector.currentStatus, .idle, "Should detect idle from prompt")
    }

    func testAnsiStripping() async throws {
        // ANSI escape codes should be stripped
        detector.processOutput("\u{1B}[32mThinking\u{1B}[0m")

        try await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(detector.currentStatus, .processing, "Should detect through ANSI codes")
    }

    func testMarkDisconnected() {
        detector.markConnected()
        detector.markDisconnected()
        XCTAssertEqual(detector.currentStatus, .disconnected, "Should be disconnected after markDisconnected")
    }

    func testReset() async throws {
        detector.processOutput("⠋ Working...")
        try await Task.sleep(nanoseconds: 500_000_000)

        detector.reset()
        XCTAssertEqual(detector.currentStatus, .disconnected, "Should be disconnected after reset")
    }
}
