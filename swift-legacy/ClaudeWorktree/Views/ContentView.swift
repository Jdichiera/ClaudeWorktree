import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationSplitView {
            SidebarView()
        } detail: {
            DetailView()
        }
        .sheet(isPresented: $appState.showNewWorktreeSheet) {
            NewWorktreeSheet()
        }
        .alert("Error", isPresented: .init(
            get: { appState.errorMessage != nil },
            set: { if !$0 { appState.errorMessage = nil } }
        )) {
            Button("OK") {
                appState.errorMessage = nil
            }
        } message: {
            Text(appState.errorMessage ?? "")
        }
    }
}

struct DetailView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        if appState.repositories.isEmpty {
            WelcomeView()
        } else if !appState.allWorktrees.isEmpty {
            TerminalStackView()
        } else {
            Text("Select a worktree from the sidebar")
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct WelcomeView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "arrow.triangle.branch")
                .font(.system(size: 64))
                .foregroundColor(.secondary)

            Text("ClaudeWorktree")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Orchestrate multiple Claude agents in parallel git worktrees")
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button(action: openRepository) {
                Label("Open Repository", systemImage: "folder")
                    .font(.headline)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Text("⌘O to open a repository")
                .font(.caption)
                .foregroundColor(.secondary)
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
