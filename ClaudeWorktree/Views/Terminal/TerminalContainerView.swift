import SwiftUI

struct TerminalContainerView: View {
    @ObservedObject var session: ClaudeSession
    @State private var showingClaudeError = false
    @State private var claudeErrorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            headerBar

            SwiftTermView(session: session, onClaudeError: { error in
                claudeErrorMessage = error
                showingClaudeError = true
            })
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .alert("Claude CLI Error", isPresented: $showingClaudeError) {
            Button("OK") {
                showingClaudeError = false
            }
        } message: {
            Text(claudeErrorMessage ?? "Unknown error")
        }
    }

    private var headerBar: some View {
        HStack {
            StatusIndicatorView(status: session.status)

            Text(session.worktree.displayName)
                .font(.headline)

            Spacer()

            Text(session.worktree.path)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)

            Button(action: copyPath) {
                Image(systemName: "doc.on.doc")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .help("Copy path")

            Button(action: revealInFinder) {
                Image(systemName: "folder")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .help("Reveal in Finder")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private func copyPath() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(session.worktree.path, forType: .string)
    }

    private func revealInFinder() {
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: session.worktree.path)
    }
}

/// A container that keeps all terminal sessions alive and stacked
struct TerminalStackView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            // Create a terminal for each worktree, all stacked
            ForEach(appState.worktrees) { worktree in
                let session = appState.sessionFor(worktree)
                TerminalContainerView(session: session)
                    .opacity(appState.selectedWorktreeId == worktree.id ? 1 : 0)
                    .allowsHitTesting(appState.selectedWorktreeId == worktree.id)
            }
        }
    }
}
