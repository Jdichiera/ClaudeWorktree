import SwiftUI

struct SidebarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            if appState.repositoryPath != nil {
                worktreeList
            } else {
                emptyState
            }
        }
        .navigationSplitViewColumnWidth(min: 200, ideal: 250, max: 350)
        .toolbar {
            ToolbarItemGroup {
                if appState.repositoryPath != nil {
                    Button(action: {
                        Task { await appState.loadWorktrees() }
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .help("Refresh worktrees")
                    .disabled(appState.isLoading)

                    Button(action: {
                        appState.showNewWorktreeSheet = true
                    }) {
                        Image(systemName: "plus")
                    }
                    .help("New worktree (⌘N)")
                }
            }
        }
    }

    private var worktreeList: some View {
        List(selection: $appState.selectedWorktreeId) {
            Section("Worktrees") {
                ForEach(appState.worktrees) { worktree in
                    WorktreeRowView(
                        worktree: worktree,
                        session: appState.sessionFor(worktree)
                    )
                    .tag(worktree.id)
                    .contextMenu {
                        if !worktree.isMainWorktree {
                            Button(role: .destructive) {
                                Task {
                                    await appState.removeWorktree(worktree)
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

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "folder.badge.questionmark")
                .font(.largeTitle)
                .foregroundColor(.secondary)

            Text("No Repository")
                .font(.headline)
                .foregroundColor(.secondary)

            Text("Open a git repository to get started")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
