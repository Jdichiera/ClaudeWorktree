import Foundation
import Combine

class StatusDetector: ObservableObject {
    @Published private(set) var currentStatus: SessionStatus = .disconnected

    private var buffer: String = ""
    private let bufferLimit = 2000
    private var debounceWorkItem: DispatchWorkItem?
    private let debounceInterval: TimeInterval = 0.3

    private let processingPatterns: [String] = [
        "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",  // Braille spinner
        "Thinking", "Reading", "Writing", "Searching",
        "Running", "Analyzing", "Processing",
        "█", "▓", "▒", "░"  // Progress bar characters
    ]

    private let idlePatterns: [String] = [
        "> ",
        "claude> ",
        "$ ",
        "❯ ",
        "➜ "
    ]

    private let ansiPattern = try! NSRegularExpression(
        pattern: "\\x1B(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])",
        options: []
    )

    func processOutput(_ data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        processOutput(text)
    }

    func processOutput(_ text: String) {
        let cleanedText = stripAnsiCodes(text)
        appendToBuffer(cleanedText)
        detectStatus()
    }

    private func stripAnsiCodes(_ text: String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        return ansiPattern.stringByReplacingMatches(
            in: text,
            options: [],
            range: range,
            withTemplate: ""
        )
    }

    private func appendToBuffer(_ text: String) {
        buffer += text

        if buffer.count > bufferLimit {
            let startIndex = buffer.index(buffer.endIndex, offsetBy: -bufferLimit)
            buffer = String(buffer[startIndex...])
        }
    }

    private func detectStatus() {
        debounceWorkItem?.cancel()

        let workItem = DispatchWorkItem { [weak self] in
            self?.performDetection()
        }

        debounceWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + debounceInterval, execute: workItem)
    }

    private func performDetection() {
        let recentBuffer = getRecentBuffer(chars: 500)

        for pattern in processingPatterns {
            if recentBuffer.contains(pattern) {
                updateStatus(.processing)
                return
            }
        }

        let lines = recentBuffer.components(separatedBy: .newlines)
        if let lastNonEmptyLine = lines.last(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) {
            for pattern in idlePatterns {
                if lastNonEmptyLine.hasSuffix(pattern) || lastNonEmptyLine.contains(pattern) {
                    updateStatus(.idle)
                    return
                }
            }
        }

        if currentStatus == .disconnected {
            updateStatus(.idle)
        }
    }

    private func getRecentBuffer(chars: Int) -> String {
        if buffer.count <= chars {
            return buffer
        }
        let startIndex = buffer.index(buffer.endIndex, offsetBy: -chars)
        return String(buffer[startIndex...])
    }

    private func updateStatus(_ newStatus: SessionStatus) {
        if currentStatus != newStatus {
            DispatchQueue.main.async { [weak self] in
                self?.currentStatus = newStatus
            }
        }
    }

    func markConnected() {
        if currentStatus == .disconnected {
            updateStatus(.idle)
        }
    }

    func markDisconnected() {
        updateStatus(.disconnected)
        buffer = ""
    }

    func reset() {
        buffer = ""
        updateStatus(.disconnected)
    }
}
