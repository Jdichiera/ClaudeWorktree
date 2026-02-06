// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ClaudeWorktree",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "ClaudeWorktree", targets: ["ClaudeWorktree"])
    ],
    dependencies: [
        .package(url: "https://github.com/migueldeicaza/SwiftTerm", from: "1.2.0")
    ],
    targets: [
        .executableTarget(
            name: "ClaudeWorktree",
            dependencies: ["SwiftTerm"],
            path: "ClaudeWorktree",
            exclude: ["Resources/ClaudeWorktree.entitlements"]
        ),
        .testTarget(
            name: "ClaudeWorktreeTests",
            dependencies: ["ClaudeWorktree"],
            path: "Tests/ClaudeWorktreeTests"
        )
    ]
)
