import Foundation

struct Repository: Identifiable, Hashable {
    let id: UUID
    let path: String
    var worktrees: [Worktree]

    init(id: UUID = UUID(), path: String, worktrees: [Worktree] = []) {
        self.id = id
        self.path = path
        self.worktrees = worktrees
    }

    var displayName: String {
        URL(fileURLWithPath: path).lastPathComponent
    }

    var mainWorktree: Worktree? {
        worktrees.first { $0.isMainWorktree }
    }
}
