import Foundation
import CryptoKit

struct Worktree: Identifiable, Hashable {
    let id: UUID
    let path: String
    let branch: String
    let commitHash: String
    let isMainWorktree: Bool

    init(path: String, branch: String, commitHash: String, isMainWorktree: Bool = false) {
        // Generate deterministic UUID from path so the same worktree always has the same ID
        self.id = Worktree.stableId(for: path)
        self.path = path
        self.branch = branch
        self.commitHash = commitHash
        self.isMainWorktree = isMainWorktree
    }

    /// Creates a deterministic UUID from a path string
    private static func stableId(for path: String) -> UUID {
        let hash = SHA256.hash(data: Data(path.utf8))
        let hashBytes = Array(hash)
        // Use first 16 bytes of SHA256 hash to create UUID
        return UUID(uuid: (
            hashBytes[0], hashBytes[1], hashBytes[2], hashBytes[3],
            hashBytes[4], hashBytes[5], hashBytes[6], hashBytes[7],
            hashBytes[8], hashBytes[9], hashBytes[10], hashBytes[11],
            hashBytes[12], hashBytes[13], hashBytes[14], hashBytes[15]
        ))
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
