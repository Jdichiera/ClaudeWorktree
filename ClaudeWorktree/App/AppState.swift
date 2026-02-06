import Foundation
import SwiftUI
import Combine

@MainActor
class AppState: ObservableObject {
    @Published var repositoryPath: String?
    @Published var worktrees: [Worktree] = []
    @Published var sessions: [UUID: ClaudeSession] = [:]
    @Published var selectedWorktreeId: UUID?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var showNewWorktreeSheet: Bool = false

    private let gitService = GitWorktreeService()

    var selectedSession: ClaudeSession? {
        guard let id = selectedWorktreeId else { return nil }
        return sessions[id]
    }

    var selectedWorktree: Worktree? {
        worktrees.first { $0.id == selectedWorktreeId }
    }

    func setRepository(path: String) async {
        repositoryPath = path
        await loadWorktrees()
    }

    func loadWorktrees() async {
        guard let repoPath = repositoryPath else { return }

        isLoading = true
        errorMessage = nil

        do {
            let loadedWorktrees = try await gitService.listWorktrees(in: repoPath)
            worktrees = loadedWorktrees

            for worktree in loadedWorktrees {
                if sessions[worktree.id] == nil {
                    sessions[worktree.id] = ClaudeSession(worktree: worktree)
                }
            }

            let currentIds = Set(loadedWorktrees.map { $0.id })
            sessions = sessions.filter { currentIds.contains($0.key) }

            if selectedWorktreeId == nil, let first = worktrees.first {
                selectedWorktreeId = first.id
            }
        } catch {
            errorMessage = "Failed to load worktrees: \(error.localizedDescription)"
        }

        isLoading = false
    }

    func addWorktree(branch: String, baseBranch: String?) async {
        guard let repoPath = repositoryPath else { return }

        isLoading = true
        errorMessage = nil

        do {
            try await gitService.addWorktree(in: repoPath, branch: branch, baseBranch: baseBranch)
            await loadWorktrees()

            if let newWorktree = worktrees.first(where: { $0.displayName == branch }) {
                selectedWorktreeId = newWorktree.id
            }
        } catch {
            errorMessage = "Failed to create worktree: \(error.localizedDescription)"
        }

        isLoading = false
    }

    func removeWorktree(_ worktree: Worktree) async {
        guard let repoPath = repositoryPath else { return }
        guard !worktree.isMainWorktree else {
            errorMessage = "Cannot remove main worktree"
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            try await gitService.removeWorktree(in: repoPath, path: worktree.path)

            if selectedWorktreeId == worktree.id {
                selectedWorktreeId = worktrees.first { $0.id != worktree.id }?.id
            }

            await loadWorktrees()
        } catch {
            errorMessage = "Failed to remove worktree: \(error.localizedDescription)"
        }

        isLoading = false
    }

    func selectWorktree(_ worktree: Worktree) {
        selectedWorktreeId = worktree.id
    }

    func sessionFor(_ worktree: Worktree) -> ClaudeSession {
        if let existing = sessions[worktree.id] {
            return existing
        }
        let session = ClaudeSession(worktree: worktree)
        sessions[worktree.id] = session
        return session
    }
}
