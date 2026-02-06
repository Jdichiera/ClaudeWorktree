import XCTest
@testable import ClaudeWorktree

final class GitWorktreeServiceTests: XCTestCase {
    var testRepoPath: String!
    var service: GitWorktreeService!

    override func setUp() async throws {
        service = GitWorktreeService()

        // Create a temporary test repository
        testRepoPath = "/tmp/claudeWorktree-test-\(UUID().uuidString)"
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = ["-c", """
            mkdir -p '\(testRepoPath!)' && \
            cd '\(testRepoPath!)' && \
            git init && \
            echo 'test' > README.md && \
            git add . && \
            git commit -m 'Initial'
            """]
        try process.run()
        process.waitUntilExit()
    }

    override func tearDown() async throws {
        // Cleanup test repository
        try? FileManager.default.removeItem(atPath: testRepoPath)
    }

    func testIsGitRepository() async throws {
        let isRepo = await service.isGitRepository(testRepoPath)
        XCTAssertTrue(isRepo, "Should detect git repository")

        let notRepo = await service.isGitRepository("/tmp")
        XCTAssertFalse(notRepo, "Should not detect non-git directory as repository")
    }

    func testListWorktrees() async throws {
        let worktrees = try await service.listWorktrees(in: testRepoPath)
        XCTAssertEqual(worktrees.count, 1, "Should have one worktree (main)")
        XCTAssertTrue(worktrees[0].isMainWorktree, "First worktree should be main")
        XCTAssertTrue(worktrees[0].branch.contains("main"), "Branch should be main")
    }

    func testAddAndRemoveWorktree() async throws {
        // Add a new worktree
        try await service.addWorktree(in: testRepoPath, branch: "feature-test", baseBranch: nil)

        var worktrees = try await service.listWorktrees(in: testRepoPath)
        XCTAssertEqual(worktrees.count, 2, "Should have two worktrees after adding")

        let featureWorktree = worktrees.first { $0.displayName == "feature-test" }
        XCTAssertNotNil(featureWorktree, "Should find feature-test worktree")

        // Remove the worktree
        if let wt = featureWorktree {
            try await service.removeWorktree(in: testRepoPath, path: wt.path)
        }

        worktrees = try await service.listWorktrees(in: testRepoPath)
        XCTAssertEqual(worktrees.count, 1, "Should have one worktree after removal")
    }

    func testGetCurrentBranch() async throws {
        let branch = try await service.getCurrentBranch(in: testRepoPath)
        XCTAssertEqual(branch, "main", "Current branch should be main")
    }

    func testListBranches() async throws {
        let branches = try await service.listBranches(in: testRepoPath)
        XCTAssertTrue(branches.contains("main"), "Should list main branch")
    }
}
