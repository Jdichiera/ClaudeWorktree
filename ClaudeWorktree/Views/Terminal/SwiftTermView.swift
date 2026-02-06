import SwiftUI
import SwiftTerm
import AppKit

struct SwiftTermView: NSViewRepresentable {
    @ObservedObject var session: ClaudeSession
    var onClaudeError: ((String) -> Void)?
    var isVisible: Bool

    func makeNSView(context: Context) -> NSView {
        let container = TerminalContainerNSView()
        container.setup(session: session, onClaudeError: onClaudeError)
        return container
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        // Trigger redraw when becoming visible
        if let container = nsView as? TerminalContainerNSView {
            container.setVisible(isVisible)
        }
    }
}

/// Container NSView that manages the terminal lifecycle
class TerminalContainerNSView: NSView {
    private var terminalView: LocalProcessTerminalView?
    private var statusDetector = StatusDetector()
    private var hasStartedProcess = false
    private weak var session: ClaudeSession?
    private var onClaudeError: ((String) -> Void)?
    private var isCurrentlyVisible = false

    func setup(session: ClaudeSession, onClaudeError: ((String) -> Void)?) {
        self.session = session
        self.onClaudeError = onClaudeError

        // Create terminal view with zero frame initially
        let terminal = LocalProcessTerminalView(frame: .zero)
        terminal.processDelegate = self
        terminal.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        terminal.translatesAutoresizingMaskIntoConstraints = false

        addSubview(terminal)

        // Use Auto Layout constraints
        NSLayoutConstraint.activate([
            terminal.topAnchor.constraint(equalTo: topAnchor),
            terminal.bottomAnchor.constraint(equalTo: bottomAnchor),
            terminal.leadingAnchor.constraint(equalTo: leadingAnchor),
            terminal.trailingAnchor.constraint(equalTo: trailingAnchor)
        ])

        self.terminalView = terminal
    }

    func setVisible(_ visible: Bool) {
        let wasHidden = !isCurrentlyVisible
        isCurrentlyVisible = visible

        if visible && wasHidden {
            // Terminal is becoming visible - trigger redraw
            DispatchQueue.main.async { [weak self] in
                self?.refreshTerminal()
            }
        }
    }

    private func refreshTerminal() {
        guard let terminalView = terminalView else { return }

        // Force terminal to redraw
        terminalView.setNeedsDisplay(terminalView.bounds)
        terminalView.displayIfNeeded()

        // Send SIGWINCH to make the process redraw (if running)
        if hasStartedProcess {
            // Get current size and "resize" to same size to trigger redraw
            let terminal = terminalView.getTerminal()
            let cols = terminal.cols
            let rows = terminal.rows
            terminal.resize(cols: cols, rows: rows)
        }
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        // Start process once we're in a window and have valid dimensions
        if window != nil && !hasStartedProcess {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.startClaudeProcess()
            }
        }
    }

    override func layout() {
        super.layout()
        // Terminal will auto-resize via constraints
    }

    private func startClaudeProcess() {
        guard let terminalView = terminalView,
              let session = session,
              !hasStartedProcess else { return }

        // Make sure we have valid dimensions
        guard bounds.width > 0 && bounds.height > 0 else {
            // Try again shortly
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.startClaudeProcess()
            }
            return
        }

        hasStartedProcess = true

        // createStartCommand now always returns a command (shows message if Claude not found)
        guard let command = ClaudeProcessManager.createStartCommand(workingDirectory: session.worktree.path) else {
            // Fallback: just start a basic shell
            let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
            terminalView.startProcess(
                executable: shell,
                args: ["-l"],
                environment: nil,
                execName: "shell"
            )
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
        // Terminal notifies the process of size change automatically
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
