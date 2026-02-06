import XCTest
@testable import ClaudeWorktree

final class SessionStatusTests: XCTestCase {

    func testStatusColors() {
        XCTAssertEqual(SessionStatus.idle.color, "green")
        XCTAssertEqual(SessionStatus.processing.color, "orange")
        XCTAssertEqual(SessionStatus.disconnected.color, "gray")
    }

    func testStatusDisplayNames() {
        XCTAssertEqual(SessionStatus.idle.displayName, "Idle")
        XCTAssertEqual(SessionStatus.processing.displayName, "Processing")
        XCTAssertEqual(SessionStatus.disconnected.displayName, "Disconnected")
    }

    func testStatusEquatable() {
        XCTAssertEqual(SessionStatus.idle, SessionStatus.idle)
        XCTAssertNotEqual(SessionStatus.idle, SessionStatus.processing)
    }
}
