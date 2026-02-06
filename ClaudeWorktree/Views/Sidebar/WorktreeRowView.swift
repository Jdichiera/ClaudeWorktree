import SwiftUI

struct WorktreeRowView: View {
    let worktree: Worktree
    @ObservedObject var session: ClaudeSession

    var body: some View {
        HStack(spacing: 8) {
            StatusIndicatorView(status: session.status)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if worktree.isMainWorktree {
                        Image(systemName: "house.fill")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    Text(worktree.displayName)
                        .font(.system(.body, design: .default))
                        .fontWeight(worktree.isMainWorktree ? .semibold : .regular)
                        .lineLimit(1)
                }

                Text(worktree.shortCommitHash)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fontDesign(.monospaced)
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }
}
