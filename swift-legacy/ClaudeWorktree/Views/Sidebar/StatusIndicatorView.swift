import SwiftUI

struct StatusIndicatorView: View {
    let status: SessionStatus
    @State private var isPulsing = false

    var body: some View {
        Circle()
            .fill(statusColor)
            .frame(width: 10, height: 10)
            .overlay(
                Circle()
                    .stroke(statusColor.opacity(0.5), lineWidth: isPulsing ? 3 : 0)
                    .scaleEffect(isPulsing ? 1.5 : 1.0)
            )
            .animation(
                status == .processing
                    ? Animation.easeInOut(duration: 0.8).repeatForever(autoreverses: true)
                    : .default,
                value: isPulsing
            )
            .onChange(of: status) { _, newStatus in
                isPulsing = (newStatus == .processing)
            }
            .onAppear {
                isPulsing = (status == .processing)
            }
            .help(status.displayName)
    }

    private var statusColor: Color {
        switch status {
        case .idle:
            return .green
        case .processing:
            return .orange
        case .disconnected:
            return .gray
        }
    }
}
