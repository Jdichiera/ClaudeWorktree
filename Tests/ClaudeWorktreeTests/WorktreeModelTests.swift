import XCTest
@testable import ClaudeWorktree

final class WorktreeModelTests: XCTestCase {

    func testWorktreeDisplayName() {
        let mainWorktree = Worktree(
            path: "/path/to/repo",
            branch: "refs/heads/main",
            commitHash: "abc123",
            isMainWorktree: true
        )
        XCTAssertEqual(mainWorktree.displayName, "main", "Main worktree display name should be 'main'")

        let featureWorktree = Worktree(
            path: "/path/to/feature",
            branch: "refs/heads/feature/new-thing",
            commitHash: "def456",
            isMainWorktree: false
        )
        XCTAssertEqual(featureWorktree.displayName, "feature/new-thing", "Should strip refs/heads/ prefix")
    }

    func testWorktreeShortCommitHash() {
        let worktree = Worktree(
            path: "/path",
            branch: "main",
            commitHash: "abc123def456789",
            isMainWorktree: true
        )
        XCTAssertEqual(worktree.shortCommitHash, "abc123d", "Should return first 7 characters")
    }

    func testWorktreeFolderName() {
        let worktree = Worktree(
            path: "/Users/test/projects/my-repo",
            branch: "main",
            commitHash: "abc123",
            isMainWorktree: true
        )
        XCTAssertEqual(worktree.folderName, "my-repo", "Should return last path component")
    }

    func testWorktreeIdentifiable() {
        let worktree1 = Worktree(path: "/path1", branch: "main", commitHash: "abc", isMainWorktree: true)
        let worktree2 = Worktree(path: "/path2", branch: "feature", commitHash: "def", isMainWorktree: false)

        XCTAssertNotEqual(worktree1.id, worktree2.id, "Different worktrees should have different IDs")
    }

    func testWorktreeHashable() {
        let worktree = Worktree(path: "/path", branch: "main", commitHash: "abc", isMainWorktree: true)
        var set = Set<Worktree>()
        set.insert(worktree)
        XCTAssertTrue(set.contains(worktree), "Worktree should be hashable")
    }
}
