import SwiftUI

struct NewWorktreeSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var branchName: String = ""
    @State private var baseBranch: String = ""
    @State private var availableBranches: [String] = []
    @State private var isLoading = false

    private let gitService = GitWorktreeService()

    var body: some View {
        VStack(spacing: 0) {
            header

            Form {
                Section {
                    TextField("Branch Name", text: $branchName)
                        .textFieldStyle(.roundedBorder)

                    Picker("Base Branch", selection: $baseBranch) {
                        Text("Current HEAD").tag("")
                        ForEach(availableBranches, id: \.self) { branch in
                            Text(branch).tag(branch)
                        }
                    }
                } header: {
                    Text("New Worktree")
                }
            }
            .formStyle(.grouped)
            .padding()

            Divider()

            footer
        }
        .frame(width: 400, height: 280)
        .task {
            await loadBranches()
        }
    }

    private var header: some View {
        HStack {
            Image(systemName: "arrow.triangle.branch")
                .font(.title2)
                .foregroundColor(.accentColor)

            Text("New Worktree")
                .font(.headline)

            Spacer()

            Button(action: { dismiss() }) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding()
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var footer: some View {
        HStack {
            Button("Cancel") {
                dismiss()
            }
            .keyboardShortcut(.cancelAction)

            Spacer()

            Button("Create") {
                createWorktree()
            }
            .keyboardShortcut(.defaultAction)
            .disabled(branchName.isEmpty || isLoading)
        }
        .padding()
    }

    private func loadBranches() async {
        guard let repoPath = appState.repositoryPath else { return }

        do {
            availableBranches = try await gitService.listBranches(in: repoPath)
            if let currentBranch = try? await gitService.getCurrentBranch(in: repoPath),
               !currentBranch.isEmpty {
                baseBranch = currentBranch
            }
        } catch {
            // Silently fail - user can still create worktree from HEAD
        }
    }

    private func createWorktree() {
        guard !branchName.isEmpty else { return }

        isLoading = true

        let sanitizedBranch = branchName
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: " ", with: "-")

        Task {
            await appState.addWorktree(
                branch: sanitizedBranch,
                baseBranch: baseBranch.isEmpty ? nil : baseBranch
            )
            dismiss()
        }
    }
}
