import SwiftUI
import SwiftTerm
import AppKit

struct SwiftTermView: NSViewRepresentable {
    @ObservedObject var session: ClaudeSession
    var onClaudeError: ((String) -> Void)?

    func makeNSView(context: Context) -> NSView {
        // Use a container view that holds the terminal
        let container = TerminalContainerNSView()
        container.setup(session: session, onClaudeError: onClaudeError)
        return container
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        // Terminal is already running, no need to update
    }
}

/// Container NSView that manages the terminal lifecycle
class TerminalContainerNSView: NSView {
    private var terminalView: LocalProcessTerminalView?
    private var statusDetector = StatusDetector()
    private var hasStartedProcess = false
    private weak var session: ClaudeSession?
    private var onClaudeError: ((String) -> Void)?

    func setup(session: ClaudeSession, onClaudeError: ((String) -> Void)?) {
        self.session = session
        self.onClaudeError = onClaudeError

        // Create terminal view
        let terminal = LocalProcessTerminalView(frame: bounds)
        terminal.processDelegate = self
        terminal.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        terminal.autoresizingMask = [.width, .height]

        addSubview(terminal)
        terminal.frame = bounds

        self.terminalView = terminal

        // Start Claude process
        startClaudeProcess()
    }

    override func layout() {
        super.layout()
        terminalView?.frame = bounds
    }

    private func startClaudeProcess() {
        guard let terminalView = terminalView,
              let session = session,
              !hasStartedProcess else { return }

        hasStartedProcess = true

        guard let command = ClaudeProcessManager.createStartCommand(workingDirectory: session.worktree.path) else {
            DispatchQueue.main.async { [weak self] in
                self?.onClaudeError?(ClaudeProcessManager.ClaudeError.claudeNotFound.localizedDescription)
            }
            return
        }

        terminalView.startProcess(
            executable: command.executable,
            args: command.args,
            environment: command.env.map { "\($0)=\($1)" },
            execName: "claude"
        )

        Task { @MainActor in
            session.markTerminalReady()
        }
    }
}

extension TerminalContainerNSView: LocalProcessTerminalViewDelegate {
    func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {
        // Terminal size changed
    }

    func setTerminalTitle(source: LocalProcessTerminalView, title: String) {
        // Title changed
    }

    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
        // Directory changed
    }

    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        // Called when terminal sends data to process
    }

    func scrolled(source: TerminalView, position: Double) {
        // Scrolled
    }

    func processTerminated(source: TerminalView, exitCode: Int32?) {
        Task { @MainActor [weak self] in
            self?.session?.markDisconnected()
            self?.statusDetector.markDisconnected()
        }
    }

    func dataReceived(slice: ArraySlice<UInt8>) {
        let data = Data(slice)
        statusDetector.processOutput(data)

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            self.session?.updateStatus(self.statusDetector.currentStatus)
        }
    }
}
