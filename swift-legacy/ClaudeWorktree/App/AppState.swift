import Foundation
import SwiftUI
import Combine

@MainActor
class AppState: ObservableObject {
    @Published var repositories: [Repository] = []
    @Published var sessions: [UUID: ClaudeSession] = [:]
    @Published var selectedWorktreeId: UUID?
    @Published var selectedRepositoryId: UUID?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var showNewWorktreeSheet: Bool = false

    private let gitService = GitWorktreeService()

    var selectedRepository: Repository? {
        repositories.first { $0.id == selectedRepositoryId }
    }

    var selectedWorktree: Worktree? {
        for repo in repositories {
            if let worktree = repo.worktrees.first(where: { $0.id == selectedWorktreeId }) {
                return worktree
            }
        }
        return nil
    }

    var allWorktrees: [Worktree] {
        repositories.flatMap { $0.worktrees }
    }

    func addRepository(path: String) async {
        // Check if already added
        guard !repositories.contains(where: { $0.path == path }) else {
            errorMessage = "Repository already open"
            return
        }

        // Verify it's a git repository
        guard await gitService.isGitRepository(path) else {
            errorMessage = "Not a valid git repository"
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let worktrees = try await gitService.listWorktrees(in: path)
            let repo = Repository(path: path, worktrees: worktrees)
            repositories.append(repo)

            // Create sessions for worktrees
            for worktree in worktrees {
                if sessions[worktree.id] == nil {
                    sessions[worktree.id] = ClaudeSession(worktree: worktree)
                }
            }

            // Select the first worktree of the new repo
            if let firstWorktree = worktrees.first {
                selectedRepositoryId = repo.id
                selectedWorktreeId = firstWorktree.id
            }
        } catch {
            errorMessage = "Failed to load repository: \(error.localizedDescription)"
        }

        isLoading = false
    }

    func removeRepository(_ repo: Repository) {
        // Terminate sessions for this repo's worktrees
        for worktree in repo.worktrees {
            sessions.removeValue(forKey: worktree.id)
        }

        repositories.removeAll { $0.id == repo.id }

        // Update selection if needed
        if selectedRepositoryId == repo.id {
            selectedRepositoryId = repositories.first?.id
            selectedWorktreeId = repositories.first?.worktrees.first?.id
        }
    }

    func refreshRepository(_ repo: Repository) async {
        isLoading = true
        errorMessage = nil

        do {
            let worktrees = try await gitService.listWorktrees(in: repo.path)

            if let index = repositories.firstIndex(where: { $0.id == repo.id }) {
                repositories[index].worktrees = worktrees
            }

            // Create sessions for new worktrees
            for worktree in worktrees {
                if sessions[worktree.id] == nil {
                    sessions[worktree.id] = ClaudeSession(worktree: worktree)
                }
            }

            // Clean up sessions for removed worktrees
            let currentIds = Set(worktrees.map { $0.id })
            let repoWorktreeIds = Set(repo.worktrees.map { $0.id })
            for id in repoWorktreeIds where !currentIds.contains(id) {
                sessions.removeValue(forKey: id)
            }
        } catch {
            errorMessage = "Failed to refresh repository: \(error.localizedDescription)"
        }

        isLoading = false
    }

    func refreshAllRepositories() async {
        for repo in repositories {
            await refreshRepository(repo)
        }
    }

    func addWorktree(to repo: Repository, branch: String, baseBranch: String?) async {
        isLoading = true
        errorMessage = nil

        do {
            try await gitService.addWorktree(in: repo.path, branch: branch, baseBranch: baseBranch)
            await refreshRepository(repo)

            // Select the new worktree
            if let index = repositories.firstIndex(where: { $0.id == repo.id }),
               let newWorktree = repositories[index].worktrees.first(where: { $0.displayName == branch }) {
                selectedWorktreeId = newWorktree.id
            }
        } catch {
            errorMessage = "Failed to create worktree: \(error.localizedDescription)"
        }

        isLoading = false
    }

    func removeWorktree(_ worktree: Worktree, from repo: Repository) async {
        guard !worktree.isMainWorktree else {
            errorMessage = "Cannot remove main worktree"
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            try await gitService.removeWorktree(in: repo.path, path: worktree.path)

            // Update selection if needed
            if selectedWorktreeId == worktree.id {
                let otherWorktrees = repo.worktrees.filter { $0.id != worktree.id }
                selectedWorktreeId = otherWorktrees.first?.id
            }

            sessions.removeValue(forKey: worktree.id)
            await refreshRepository(repo)
        } catch {
            errorMessage = "Failed to remove worktree: \(error.localizedDescription)"
        }

        isLoading = false
    }

    func selectWorktree(_ worktree: Worktree) {
        selectedWorktreeId = worktree.id
        // Find which repo this worktree belongs to
        for repo in repositories {
            if repo.worktrees.contains(where: { $0.id == worktree.id }) {
                selectedRepositoryId = repo.id
                break
            }
        }
    }

    func repositoryFor(_ worktree: Worktree) -> Repository? {
        repositories.first { $0.worktrees.contains(where: { $0.id == worktree.id }) }
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
