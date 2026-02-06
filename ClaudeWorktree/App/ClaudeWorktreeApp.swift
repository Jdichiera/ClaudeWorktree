import SwiftUI

@main
struct ClaudeWorktreeApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("New Worktree...") {
                    appState.showNewWorktreeSheet = true
                }
                .keyboardShortcut("n", modifiers: [.command])
                .disabled(appState.repositoryPath == nil)

                Divider()

                Button("Open Repository...") {
                    openRepositoryPanel()
                }
                .keyboardShortcut("o", modifiers: [.command])

                Button("Refresh Worktrees") {
                    Task {
                        await appState.loadWorktrees()
                    }
                }
                .keyboardShortcut("r", modifiers: [.command])
                .disabled(appState.repositoryPath == nil)
            }
        }
    }

    private func openRepositoryPanel() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = "Select a Git repository"
        panel.prompt = "Open"

        if panel.runModal() == .OK, let url = panel.url {
            Task {
                await appState.setRepository(path: url.path)
            }
        }
    }
}
