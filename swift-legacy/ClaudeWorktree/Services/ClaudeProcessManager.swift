import Foundation
import AppKit

class ClaudeProcessManager {
    enum ClaudeError: LocalizedError {
        case claudeNotFound
        case processStartFailed(String)

        var errorDescription: String? {
            switch self {
            case .claudeNotFound:
                return "Claude CLI not found. Please install it via 'npm install -g @anthropic-ai/claude-code'"
            case .processStartFailed(let message):
                return "Failed to start Claude process: \(message)"
            }
        }
    }

    private static let searchPaths = [
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        "\(NSHomeDirectory())/.npm-global/bin/claude",
        "\(NSHomeDirectory())/.local/bin/claude",
        "\(NSHomeDirectory())/node_modules/.bin/claude"
    ]

    static func findClaudeExecutable() -> String? {
        for path in searchPaths {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }

        let whichProcess = Process()
        let pipe = Pipe()
        whichProcess.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        whichProcess.arguments = ["claude"]
        whichProcess.standardOutput = pipe
        whichProcess.standardError = pipe

        do {
            try whichProcess.run()
            whichProcess.waitUntilExit()

            if whichProcess.terminationStatus == 0 {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
                if let path = path, !path.isEmpty {
                    return path
                }
            }
        } catch {
            // Continue to return nil
        }

        return nil
    }

    static func getShellEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment

        let homeDir = NSHomeDirectory()
        let defaultPath = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:\(homeDir)/.npm-global/bin:\(homeDir)/.local/bin"

        if let existingPath = env["PATH"] {
            env["PATH"] = "\(existingPath):\(defaultPath)"
        } else {
            env["PATH"] = defaultPath
        }

        // Set TERM for proper terminal emulation
        env["TERM"] = "xterm-256color"

        return env
    }

    /// Creates command to start an interactive shell in the working directory that runs Claude.
    /// When Claude exits, the user remains in the shell and can restart Claude or run other commands.
    /// Returns nil only if we can't determine a shell to use.
    static func createStartCommand(workingDirectory: String) -> (executable: String, args: [String], env: [String: String])? {
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        var env = getShellEnvironment()

        // Set the working directory
        env["PWD"] = workingDirectory

        // Find claude path for the initial command
        if let claudePath = findClaudeExecutable() {
            // Start shell, run Claude, then stay in interactive shell when Claude exits
            let initScript = "cd '\(workingDirectory)' && '\(claudePath)'; exec \(shell) -i"
            return (
                executable: shell,
                args: ["-l", "-c", initScript],
                env: env
            )
        } else {
            // Claude not found - just start a shell with a helpful message
            let initScript = "cd '\(workingDirectory)' && echo 'Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code' && exec \(shell) -i"
            return (
                executable: shell,
                args: ["-l", "-c", initScript],
                env: env
            )
        }
    }

    /// Creates command to start just a shell (no Claude) in the working directory
    static func createShellCommand(workingDirectory: String) -> (executable: String, args: [String], env: [String: String]) {
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        var env = getShellEnvironment()
        env["PWD"] = workingDirectory

        return (
            executable: shell,
            args: ["-l", "-c", "cd '\(workingDirectory)' && exec \(shell) -i"],
            env: env
        )
    }
}
