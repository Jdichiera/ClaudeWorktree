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

        return env
    }

    static func createStartCommand(workingDirectory: String) -> (executable: String, args: [String], env: [String: String])? {
        guard let claudePath = findClaudeExecutable() else {
            return nil
        }

        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        let env = getShellEnvironment()

        return (
            executable: shell,
            args: ["-l", "-c", "cd '\(workingDirectory)' && '\(claudePath)'"],
            env: env
        )
    }
}
