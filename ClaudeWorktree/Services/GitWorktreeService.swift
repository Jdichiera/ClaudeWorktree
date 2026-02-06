import Foundation

actor GitWorktreeService {
    enum GitError: LocalizedError {
        case notAGitRepository
        case commandFailed(String)
        case parseError(String)

        var errorDescription: String? {
            switch self {
            case .notAGitRepository:
                return "The specified path is not a git repository"
            case .commandFailed(let message):
                return "Git command failed: \(message)"
            case .parseError(let message):
                return "Failed to parse git output: \(message)"
            }
        }
    }

    func listWorktrees(in repoPath: String) async throws -> [Worktree] {
        let output = try await runGitCommand(["worktree", "list", "--porcelain"], in: repoPath)
        return parseWorktreeList(output, repoPath: repoPath)
    }

    func addWorktree(in repoPath: String, branch: String, baseBranch: String?) async throws {
        let worktreePath = URL(fileURLWithPath: repoPath)
            .deletingLastPathComponent()
            .appendingPathComponent("\(URL(fileURLWithPath: repoPath).lastPathComponent)-\(branch)")
            .path

        var args = ["worktree", "add", "-b", branch, worktreePath]
        if let base = baseBranch, !base.isEmpty {
            args.append(base)
        }

        _ = try await runGitCommand(args, in: repoPath)
    }

    func removeWorktree(in repoPath: String, path: String) async throws {
        _ = try await runGitCommand(["worktree", "remove", path, "--force"], in: repoPath)
    }

    private func runGitCommand(_ args: [String], in directory: String) async throws -> String {
        let process = Process()
        let pipe = Pipe()

        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = args
        process.currentDirectoryURL = URL(fileURLWithPath: directory)
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            throw GitError.commandFailed(error.localizedDescription)
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8) ?? ""

        if process.terminationStatus != 0 {
            if output.contains("not a git repository") {
                throw GitError.notAGitRepository
            }
            throw GitError.commandFailed(output)
        }

        return output
    }

    private func parseWorktreeList(_ output: String, repoPath: String) -> [Worktree] {
        var worktrees: [Worktree] = []
        var currentPath: String?
        var currentCommit: String?
        var currentBranch: String?
        var isMainWorktree = true

        let lines = output.components(separatedBy: .newlines)

        for line in lines {
            if line.hasPrefix("worktree ") {
                if let path = currentPath {
                    let worktree = Worktree(
                        path: path,
                        branch: currentBranch ?? "detached",
                        commitHash: currentCommit ?? "",
                        isMainWorktree: isMainWorktree
                    )
                    worktrees.append(worktree)
                    isMainWorktree = false
                }

                currentPath = String(line.dropFirst("worktree ".count))
                currentCommit = nil
                currentBranch = nil
            } else if line.hasPrefix("HEAD ") {
                currentCommit = String(line.dropFirst("HEAD ".count))
            } else if line.hasPrefix("branch ") {
                currentBranch = String(line.dropFirst("branch ".count))
            }
        }

        if let path = currentPath {
            let worktree = Worktree(
                path: path,
                branch: currentBranch ?? "detached",
                commitHash: currentCommit ?? "",
                isMainWorktree: isMainWorktree
            )
            worktrees.append(worktree)
        }

        return worktrees
    }

    func isGitRepository(_ path: String) async -> Bool {
        do {
            _ = try await runGitCommand(["rev-parse", "--git-dir"], in: path)
            return true
        } catch {
            return false
        }
    }

    func getCurrentBranch(in repoPath: String) async throws -> String {
        let output = try await runGitCommand(["branch", "--show-current"], in: repoPath)
        return output.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func listBranches(in repoPath: String) async throws -> [String] {
        let output = try await runGitCommand(["branch", "-a", "--format=%(refname:short)"], in: repoPath)
        return output
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
}
