import Foundation

enum SessionStatus: Equatable {
    case idle
    case processing
    case disconnected

    var color: String {
        switch self {
        case .idle: return "green"
        case .processing: return "orange"
        case .disconnected: return "gray"
        }
    }

    var displayName: String {
        switch self {
        case .idle: return "Idle"
        case .processing: return "Processing"
        case .disconnected: return "Disconnected"
        }
    }
}
