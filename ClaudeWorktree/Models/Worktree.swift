import Foundation

struct Worktree: Identifiable, Hashable {
    let id: UUID
    let path: String
    let branch: String
    let commitHash: String
    let isMainWorktree: Bool

    init(id: UUID = UUID(), path: String, branch: String, commitHash: String, isMainWorktree: Bool = false) {
        self.id = id
        self.path = path
        self.branch = branch
        self.commitHash = commitHash
        self.isMainWorktree = isMainWorktree
    }

    var displayName: String {
        if isMainWorktree {
            return "main"
        }
        return branch.replacingOccurrences(of: "refs/heads/", with: "")
    }

    var shortCommitHash: String {
        String(commitHash.prefix(7))
    }

    var folderName: String {
        URL(fileURLWithPath: path).lastPathComponent
    }
}
