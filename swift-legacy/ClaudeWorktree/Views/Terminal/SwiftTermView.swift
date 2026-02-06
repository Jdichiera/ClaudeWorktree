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
        container.setVisible(isVisible)
        context.coordinator.container = container
        context.coordinator.wasEverVisible = false
        return container
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        guard let container = nsView as? TerminalContainerNSView else { return }

        // Update visibility state
        container.setVisible(isVisible)

        // Trigger refresh when switching FROM hidden TO visible (not on first show)
        if isVisible && context.coordinator.wasEverVisible && !context.coordinator.isCurrentlyVisible {
            // Delay refresh slightly to allow layout to settle after becoming visible
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                container.refreshTerminal()
            }
        }
        context.coordinator.isCurrentlyVisible = isVisible
        if isVisible {
            context.coordinator.wasEverVisible = true
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator {
        weak var container: TerminalContainerNSView?
        var wasEverVisible = false
        var isCurrentlyVisible = false
    }
}

/// Container NSView that manages the terminal lifecycle
class TerminalContainerNSView: NSView {
    private var terminalView: LocalProcessTerminalView?
    private var statusDetector = StatusDetector()
    private var hasStartedProcess = false
    private var isVisible = false
    private var isInWindow = false
    private weak var session: ClaudeSession?
    private var onClaudeError: ((String) -> Void)?

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
        let wasVisible = isVisible
        isVisible = visible
        // Try to start process when becoming visible for the first time
        if visible && isInWindow && !hasStartedProcess {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.startClaudeProcess()
            }
        }
        // Focus terminal when becoming visible
        if visible && !wasVisible {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.focusTerminal()
            }
        }
    }

    func focusTerminal() {
        guard let terminalView = terminalView, let window = window else { return }
        window.makeFirstResponder(terminalView)
    }

    func refreshTerminal() {
        guard let terminalView = terminalView, hasStartedProcess else { return }

        // Force layout update first
        terminalView.layoutSubtreeIfNeeded()

        // Force terminal to redraw
        terminalView.setNeedsDisplay(terminalView.bounds)

        // Trigger a resize to same size - this sends SIGWINCH to the process
        let terminal = terminalView.getTerminal()
        let cols = terminal.cols
        let rows = terminal.rows
        if cols > 0 && rows > 0 {
            terminal.resize(cols: cols, rows: rows)
        }

        // Send Ctrl+L (form feed) to trigger a full screen redraw in the shell
        // ASCII 12 is the form feed character (Ctrl+L)
        let ctrlL: [UInt8] = [12]
        terminalView.send(ctrlL)
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        isInWindow = (window != nil)
        // Only start process if we're visible AND in a window
        if isInWindow && isVisible && !hasStartedProcess {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.startClaudeProcess()
            }
        }
    }

    private func startClaudeProcess() {
        guard let terminalView = terminalView,
              let session = session,
              !hasStartedProcess,
              isVisible else { return }

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

        // Focus the terminal after starting
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.focusTerminal()
        }

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
