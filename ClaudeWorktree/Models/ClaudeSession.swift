import Foundation
import SwiftUI
import Combine

@MainActor
class ClaudeSession: ObservableObject, Identifiable {
    let id: UUID
    let worktree: Worktree

    @Published var status: SessionStatus = .disconnected
    @Published var isTerminalReady: Bool = false

    private var statusDetector: StatusDetector?

    init(worktree: Worktree) {
        self.id = UUID()
        self.worktree = worktree
    }

    func setStatusDetector(_ detector: StatusDetector) {
        self.statusDetector = detector
    }

    func updateStatus(_ newStatus: SessionStatus) {
        if status != newStatus {
            status = newStatus
        }
    }

    func markTerminalReady() {
        isTerminalReady = true
        if status == .disconnected {
            status = .idle
        }
    }

    func markDisconnected() {
        status = .disconnected
        isTerminalReady = false
    }
}
