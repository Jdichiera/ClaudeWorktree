import SwiftUI

struct SidebarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            if !appState.repositories.isEmpty {
                repositoryList
            } else {
                emptyState
            }
        }
        .navigationSplitViewColumnWidth(min: 200, ideal: 250, max: 350)
        .toolbar {
            ToolbarItemGroup {
                Button(action: openRepository) {
                    Image(systemName: "folder.badge.plus")
                }
                .help("Open repository (⌘O)")

                if !appState.repositories.isEmpty {
                    Button(action: {
                        Task { await appState.refreshAllRepositories() }
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .help("Refresh all")
                    .disabled(appState.isLoading)

                    Button(action: {
                        appState.showNewWorktreeSheet = true
                    }) {
                        Image(systemName: "plus")
                    }
                    .help("New worktree (⌘N)")
                    .disabled(appState.selectedRepository == nil)
                }
            }
        }
    }

    private var repositoryList: some View {
        List(selection: $appState.selectedWorktreeId) {
            ForEach(appState.repositories) { repo in
                Section {
                    ForEach(repo.worktrees) { worktree in
                        WorktreeRowView(
                            worktree: worktree,
                            session: appState.sessionFor(worktree)
                        )
                        .tag(worktree.id)
                        .contextMenu {
                            worktreeContextMenu(worktree: worktree, repo: repo)
                        }
                    }
                } header: {
                    HStack {
                        Image(systemName: "folder.fill")
                            .foregroundColor(.secondary)
                        Text(repo.displayName)
                            .fontWeight(.semibold)
                        Spacer()
                    }
                    .contextMenu {
                        repositoryContextMenu(repo: repo)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .overlay {
            if appState.isLoading {
                ProgressView()
            }
        }
    }

    @ViewBuilder
    private func worktreeContextMenu(worktree: Worktree, repo: Repository) -> some View {
        if !worktree.isMainWorktree {
            Button(role: .destructive) {
                Task {
                    await appState.removeWorktree(worktree, from: repo)
                }
            } label: {
                Label("Delete Worktree", systemImage: "trash")
            }
        }

        Button {
            NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: worktree.path)
        } label: {
            Label("Reveal in Finder", systemImage: "folder")
        }

        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(worktree.path, forType: .string)
        } label: {
            Label("Copy Path", systemImage: "doc.on.doc")
        }
    }

    @ViewBuilder
    private func repositoryContextMenu(repo: Repository) -> some View {
        Button {
            Task { await appState.refreshRepository(repo) }
        } label: {
            Label("Refresh", systemImage: "arrow.clockwise")
        }

        Button {
            appState.selectedRepositoryId = repo.id
            appState.showNewWorktreeSheet = true
        } label: {
            Label("New Worktree", systemImage: "plus")
        }

        Divider()

        Button {
            NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: repo.path)
        } label: {
            Label("Reveal in Finder", systemImage: "folder")
        }

        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(repo.path, forType: .string)
        } label: {
            Label("Copy Path", systemImage: "doc.on.doc")
        }

        Divider()

        Button(role: .destructive) {
            appState.removeRepository(repo)
        } label: {
            Label("Close Repository", systemImage: "xmark.circle")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "folder.badge.questionmark")
                .font(.largeTitle)
                .foregroundColor(.secondary)

            Text("No Repositories")
                .font(.headline)
                .foregroundColor(.secondary)

            Text("Open a git repository to get started")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button(action: openRepository) {
                Label("Open Repository", systemImage: "folder.badge.plus")
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private func openRepository() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = "Select a Git repository"
        panel.prompt = "Open"

        if panel.runModal() == .OK, let url = panel.url {
            Task {
                await appState.addRepository(path: url.path)
            }
        }
    }
}
