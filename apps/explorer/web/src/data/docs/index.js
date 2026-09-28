const docsData = {
  "sections": [
    {
      "id": "start-here",
      "title": "Start here",
      "description": "From zero to a verified transaction.",
      "items": [
        "overview",
        "networks",
        "install-cli",
        "wallet",
        "fund-test-wallet",
        "first-transaction",
        "verify-scan"
      ]
    },
    {
      "id": "tooling",
      "title": "Tooling",
      "description": "Choose the client surface that fits your application.",
      "items": [
        "cli-reference",
        "javascript-sdk",
        "node-sdk",
        "python-sdk",
        "rust-sdk",
        "examples"
      ]
    },
    {
      "id": "network-apis",
      "title": "Network APIs",
      "description": "RPC, subscriptions, indexed data and failure handling.",
      "items": [
        "rpc-quickstart",
        "websocket",
        "explorer-api",
        "errors-rate-limits"
      ]
    },
    {
      "id": "smart-contracts",
      "title": "Smart contracts",
      "description": "Write, build, deploy and manage AEKO programs.",
      "items": [
        "program-model",
        "first-program",
        "build-sbf",
        "deploy-invoke",
        "program-lifecycle",
        "program-security"
      ]
    },
    {
      "id": "wallets-permissions",
      "title": "Wallets & permissions",
      "description": "User signing and scoped delegated authority.",
      "items": [
        "browser-wallets",
        "transaction-signing",
        "wallet-permissions",
        "identity-clearance"
      ]
    },
    {
      "id": "tokens-nfts",
      "title": "Tokens & NFTs",
      "description": "Fungible assets, NFTs and lifecycle recipes.",
      "items": [
        "aeko20",
        "public-mint",
        "aeko721",
        "asset-metadata",
        "nft-flow",
        "creator-coins"
      ]
    },
    {
      "id": "socialfi",
      "title": "SocialFi",
      "description": "Posts, engagement, rewards, staking and backend integration.",
      "items": [
        "socialfi-overview",
        "posts-engagement",
        "rewards-staking",
        "monetization",
        "anti-spam",
        "social-backend"
      ]
    },
    {
      "id": "security-bridge",
      "title": "Bridge & security",
      "description": "Status-aware integration and trust boundaries.",
      "items": [
        "bridge-status",
        "application-security"
      ]
    },
    {
      "id": "protocol-concepts",
      "title": "Protocol concepts",
      "description": "Only the protocol detail application developers need.",
      "items": [
        "accounts-transactions",
        "transaction-lifecycle",
        "fees-finality",
        "governance-status"
      ]
    },
    {
      "id": "troubleshooting",
      "title": "Troubleshooting",
      "description": "Recover from common client and indexing failures.",
      "items": [
        "connectivity",
        "transaction-failures",
        "indexing-delay"
      ]
    }
  ],
  "pages": [
    {
      "id": "overview",
      "title": "Build on AEKO",
      "section": "start-here",
      "summary": "A consumer-first path from a network endpoint to a verified transaction, API integration, or on-chain program.",
      "status": "available",
      "tags": [
        "quickstart",
        "overview",
        "developer"
      ],
      "prerequisites": [
        "Choose whether you are testing or building for production.",
        "Use a wallet or signing method appropriate for your application."
      ],
      "outcomes": [
        "Pick the right AEKO developer surface.",
        "Complete a read or write and verify the result in Aeko Scan."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "callout",
          "title": "Start with the public developer surface",
          "body": "Choose a network, a supported SDK or the CLI, then verify the result in Aeko Scan. Start with one working read/write loop and expand only when your application needs another surface.",
          "tone": "info"
        },
        {
          "type": "steps",
          "title": "The shortest developer journey",
          "items": [
            {
              "title": "Choose a network",
              "body": "Use Testnet while developing. Use Mainnet only when your application is ready for production behavior and real-value transactions."
            },
            {
              "title": "Choose a tool",
              "body": "Use the CLI for direct terminal workflows, JavaScript for browser apps, Node.js for services, Python for scripting, or Rust for typed off-chain clients and on-chain programs."
            },
            {
              "title": "Read before you write",
              "body": "Verify connectivity with a balance, account or recent blockhash before asking a wallet to sign."
            },
            {
              "title": "Sign and submit",
              "body": "Use the wallet, CLI, or SDK transaction path that matches the capability you are integrating."
            },
            {
              "title": "Verify",
              "body": "Search the resulting signature, account, token, NFT, post, or block in Aeko Scan and confirm the expected state."
            }
          ]
        },
        {
          "type": "table",
          "title": "Choose the right surface",
          "headers": [
            "Surface",
            "Best for",
            "Recommended fit"
          ],
          "rows": [
            [
              "AEKO CLI",
              "Wallet operations, transfers, chain queries, program lifecycle",
              "Direct terminal workflows and automation."
            ],
            [
              "JavaScript / TypeScript",
              "Browser and general JS applications",
              "Client applications and wallet-driven flows."
            ],
            [
              "Node.js",
              "Backends, server signing, SocialFi helpers",
              "Backend services and SocialFi integration."
            ],
            [
              "Python",
              "Automation, analytics, monitoring, scripts",
              "Scripting, analytics and operational tooling."
            ],
            [
              "Rust client",
              "Typed async services and Rust integrations",
              "Rust services that need typed client calls."
            ],
            [
              "Rust program SDK",
              "On-chain programs compiled for SBF",
              "Smart contracts and on-chain state transitions."
            ]
          ]
        }
      ],
      "related": [
        "networks",
        "install-cli",
        "javascript-sdk",
        "rpc-quickstart"
      ]
    },
    {
      "id": "networks",
      "title": "Networks & endpoints",
      "section": "start-here",
      "summary": "Use the selected network consistently across CLI, SDK, realtime subscriptions and Aeko Scan verification.",
      "status": "available",
      "tags": [
        "network",
        "rpc",
        "websocket",
        "endpoint"
      ],
      "prerequisites": [
        "The selected network must be available in Aeko Scan."
      ],
      "outcomes": [
        "Copy the active RPC, realtime and Explorer API endpoints.",
        "Point CLI and SDK examples at the same network."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "endpoints",
          "title": "Selected network endpoints",
          "items": [
            {
              "label": "JSON-RPC",
              "value": "{{rpcUrl}}",
              "note": "Use for chain reads and transaction submission."
            },
            {
              "label": "WebSocket",
              "value": "{{websocketUrl}}",
              "note": "Use for live subscriptions."
            },
            {
              "label": "Explorer API",
              "value": "{{explorerApiUrl}}",
              "note": "Use for indexed, searchable and enriched application reads."
            }
          ]
        },
        {
          "type": "code",
          "label": "Configure the CLI",
          "language": "bash",
          "value": "aeko config set --url {{rpcUrl}}"
        },
        {
          "type": "callout",
          "title": "Funding is network-specific",
          "body": "Mainnet does not provide test funding. Testnet funding is shown only when it is available for the selected network. Use the live network panel above instead of copying an endpoint from another environment.",
          "tone": "warning"
        },
        {
          "type": "paragraph",
          "title": "Why examples follow your selection",
          "body": "Documentation snippets resolve network tokens at render time. Switching Mainnet/Testnet changes endpoint examples instead of leaving stale URLs copied into the page."
        }
      ],
      "related": [
        "fund-test-wallet",
        "rpc-quickstart",
        "websocket",
        "explorer-api"
      ]
    },
    {
      "id": "install-cli",
      "title": "Install the CLI",
      "section": "start-here",
      "summary": "Install the release-built AEKO CLI bundle and verify the two user-facing commands before configuring a network.",
      "status": "available",
      "tags": [
        "cli",
        "install",
        "aeko-keygen"
      ],
      "prerequisites": [
        "Linux x86_64 with glibc or Windows x86_64 for the supported quick-install targets."
      ],
      "outcomes": [
        "Run `aeko` and `aeko-keygen` from your shell."
      ],
      "blocks": [
        {
          "type": "paragraph",
          "title": "Install from an AEKO release",
          "body": "Download the latest AEKO CLI release bundle for your operating system from the official AEKO Releases page. The bundle includes both `aeko` and `aeko-keygen` and publishes checksums for integrity verification."
        },
        {
          "type": "code",
          "label": "AEKO Releases",
          "language": "text",
          "value": "https://github.com/MilliHub-dev/aeko-chain/releases/latest"
        },
        {
          "type": "code",
          "label": "Verify installation",
          "language": "bash",
          "value": "aeko --version\naeko-keygen --version"
        },
        {
          "type": "callout",
          "title": "Other platforms",
          "body": "Use a supported AEKO release package for your platform and verify its checksum before installation. Do not substitute unrelated chain installers or package names.",
          "tone": "warning"
        }
      ],
      "related": [
        "wallet",
        "networks",
        "cli-reference"
      ]
    },
    {
      "id": "wallet",
      "title": "Create or load a wallet",
      "section": "start-here",
      "summary": "Create a signing keypair, point the CLI at the selected network, then verify the active address and balance.",
      "status": "available",
      "tags": [
        "wallet",
        "keypair",
        "cli"
      ],
      "prerequisites": [
        "AEKO CLI installed.",
        "A secure location for your recovery material and keypair."
      ],
      "outcomes": [
        "Know which address will sign.",
        "Verify the wallet is talking to the selected network."
      ],
      "blocks": [
        {
          "type": "steps",
          "title": "Create and verify",
          "items": [
            {
              "title": "Create a keypair",
              "body": "Generate a new keypair only when you need a new wallet. Preserve recovery material securely.",
              "code": "aeko-keygen new"
            },
            {
              "title": "Configure the selected network",
              "body": "Point the CLI at the same endpoint used throughout these docs.",
              "code": "aeko config set --url {{rpcUrl}}"
            },
            {
              "title": "Show the active address",
              "body": "Confirm the address before funding or signing.",
              "code": "aeko address"
            },
            {
              "title": "Check the balance",
              "body": "A successful balance response proves CLI-to-RPC connectivity.",
              "code": "aeko balance"
            }
          ]
        },
        {
          "type": "callout",
          "title": "Treat keys as signing authority",
          "body": "Do not paste secret keys, recovery phrases, or keypair files into web forms, issue reports, or application logs. Public addresses and transaction signatures are safe to inspect; signing secrets are not.",
          "tone": "security"
        }
      ],
      "related": [
        "fund-test-wallet",
        "first-transaction",
        "browser-wallets"
      ]
    },
    {
      "id": "fund-test-wallet",
      "title": "Get test AEKO",
      "section": "start-here",
      "summary": "Fund a development wallet on Testnet using the funding tools shown in Aeko Scan.",
      "status": "testnet",
      "tags": [
        "funding",
        "testnet",
        "wallet"
      ],
      "prerequisites": [
        "Select Testnet.",
        "Create or load the wallet address you want to fund."
      ],
      "outcomes": [
        "Receive test-only AEKO when funding is available for the selected network.",
        "Confirm the resulting balance before continuing."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "callout",
          "title": "Testnet only",
          "body": "Test funding is available only on supported Testnet environments. Mainnet intentionally has no test-funding path.",
          "tone": "warning"
        },
        {
          "type": "steps",
          "title": "Funding workflow",
          "items": [
            {
              "title": "Select Testnet",
              "body": "Use the network control on this page. The funding status above follows the selected network."
            },
            {
              "title": "Open Network Tools",
              "body": "Use the public funding request UI rather than a private service URL."
            },
            {
              "title": "Request funds for your public address",
              "body": "Never submit a private key. Funding requires only the public wallet address."
            },
            {
              "title": "Verify the balance",
              "body": "Return to the CLI or SDK and read the wallet balance before testing a write.",
              "code": "aeko balance"
            }
          ]
        }
      ],
      "related": [
        "wallet",
        "first-transaction",
        "networks"
      ]
    },
    {
      "id": "first-transaction",
      "title": "Send your first transaction",
      "section": "start-here",
      "summary": "Send a small AEKO transfer with the CLI and verify the signature rather than treating submission as success.",
      "status": "available",
      "tags": [
        "transaction",
        "transfer",
        "cli"
      ],
      "prerequisites": [
        "A funded wallet.",
        "CLI configured for the intended network.",
        "A recipient public address."
      ],
      "outcomes": [
        "Submit a transfer.",
        "Verify its signature and resulting state."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Confirm your endpoint and balance",
          "language": "bash",
          "value": "aeko config set --url {{rpcUrl}}\naeko balance"
        },
        {
          "type": "code",
          "label": "Submit a transfer",
          "language": "bash",
          "value": "aeko transfer <RECIPIENT_ADDRESS> <AMOUNT>"
        },
        {
          "type": "code",
          "label": "Confirm a signature",
          "language": "bash",
          "value": "aeko confirm <TRANSACTION_SIGNATURE>"
        },
        {
          "type": "callout",
          "title": "Submission is not finality",
          "body": "Keep the returned transaction signature. A client should distinguish submit success from confirmation/finality and should surface the chain error when confirmation fails.",
          "tone": "info"
        }
      ],
      "related": [
        "verify-scan",
        "fees-finality",
        "transaction-failures",
        "transaction-signing",
        "transaction-lifecycle"
      ]
    },
    {
      "id": "verify-scan",
      "title": "Verify in Aeko Scan",
      "section": "start-here",
      "summary": "Use Aeko Scan as the human-readable verification layer for transactions, blocks, accounts, tokens, NFTs, creators, and social posts.",
      "status": "available",
      "tags": [
        "scan",
        "explorer",
        "verify"
      ],
      "prerequisites": [
        "A signature, slot, account address, mint, token ID, collection ID, creator, or post ID."
      ],
      "outcomes": [
        "Cross-check an application result against indexed chain data."
      ],
      "blocks": [
        {
          "type": "paragraph",
          "title": "Search by canonical identifier",
          "body": "Open Aeko Scan and search the identifier returned by your CLI, SDK, RPC call, or application. For writes, start with the transaction signature; then follow the affected accounts or assets."
        },
        {
          "type": "bullets",
          "title": "Useful verification targets",
          "items": [
            "Transaction status, slot, instructions, fee and error details.",
            "Wallet/account balance and recent activity.",
            "Token mint summary and transfer history.",
            "NFT and collection ownership state.",
            "Creator, post, engagement, reward and stake views when indexed."
          ]
        },
        {
          "type": "callout",
          "title": "Indexer delay is different from chain failure",
          "body": "A successful chain transaction can appear in raw RPC before the Explorer indexer has persisted its enriched view. If RPC confirms the signature but Scan is briefly behind, use the indexing troubleshooting guide.",
          "tone": "info"
        }
      ],
      "related": [
        "explorer-api",
        "indexing-delay",
        "transaction-failures"
      ]
    },
    {
      "id": "cli-reference",
      "title": "CLI command families",
      "section": "tooling",
      "summary": "A map of the command families exposed by the current AEKO CLI, organized by developer task.",
      "status": "available",
      "tags": [
        "cli",
        "reference",
        "commands"
      ],
      "prerequisites": [
        "AEKO CLI installed."
      ],
      "outcomes": [
        "Know where wallet, chain, program, stake, vote, nonce, and configuration workflows live."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Command families",
          "headers": [
            "Family",
            "Representative commands",
            "Use"
          ],
          "rows": [
            [
              "Wallet & transactions",
              "address, balance, transfer, confirm, sign-offchain-message, verify-offchain-signature",
              "Own and move assets; verify signed messages."
            ],
            [
              "Chain queries",
              "block, block-time, slot, block-height, epoch-info, supply, transaction-count, logs",
              "Inspect live chain state."
            ],
            [
              "Programs",
              "program deploy, upgrade/write-buffer, show, dump, close, extend",
              "Manage deployed on-chain programs."
            ],
            [
              "Program v4",
              "deploy, redeploy, undeploy, finalize, show, dump",
              "Use the v4 program lifecycle where applicable."
            ],
            [
              "Address lookup tables",
              "create, extend, freeze, deactivate, close, get",
              "Manage lookup-table accounts."
            ],
            [
              "Stake / vote / validator info",
              "stake commands, vote commands, validator-info publish/get",
              "Participate in staking/voting workflows where relevant."
            ],
            [
              "Nonce",
              "create-nonce-account, nonce, new-nonce, withdraw-from-nonce-account",
              "Build durable-nonce transaction workflows."
            ],
            [
              "Feature / inflation",
              "feature status/activate, inflation/rewards",
              "Inspect feature and reward state."
            ],
            [
              "Configuration",
              "config, completion",
              "Set endpoints and shell integration."
            ]
          ]
        },
        {
          "type": "code",
          "label": "Use the selected RPC explicitly",
          "language": "bash",
          "value": "aeko config set --url {{rpcUrl}}\naeko balance"
        },
        {
          "type": "callout",
          "title": "Avoid stale network aliases",
          "body": "Use the endpoint copied from the active network when accuracy matters. Cluster aliases can differ across environments, while the full endpoint keeps CLI, SDK and Explorer requests aligned.",
          "tone": "warning"
        }
      ],
      "related": [
        "install-cli",
        "program-lifecycle",
        "rpc-quickstart"
      ]
    },
    {
      "id": "javascript-sdk",
      "title": "JavaScript / TypeScript SDK",
      "section": "tooling",
      "summary": "Browser-oriented RPC, transaction, account, AEKO-721, wallet adapter, and wallet-permission helpers from `@aeko-chain/web3.js`.",
      "status": "available",
      "tags": [
        "javascript",
        "typescript",
        "browser",
        "sdk"
      ],
      "prerequisites": [
        "A modern JavaScript/TypeScript project.",
        "An AEKO RPC endpoint."
      ],
      "outcomes": [
        "Connect with `AekoConnection`.",
        "Perform reads and submit prepared signed transactions."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Install",
          "language": "bash",
          "value": "npm install @aeko-chain/web3.js"
        },
        {
          "type": "code",
          "label": "Read a balance",
          "language": "javascript",
          "value": "import { AekoConnection } from '@aeko-chain/web3.js';\n\nconst connection = new AekoConnection('{{rpcUrl}}');\nconst balance = await connection.getBalance('ADDRESS');\nconsole.log(balance);"
        },
        {
          "type": "bullets",
          "title": "What the SDK provides",
          "items": [
            "Generic JSON-RPC plus latest blockhash, balance, account and program-account helpers.",
            "Token accounts by owner and signature-status helpers.",
            "Base64 transaction submission.",
            "Account WebSocket subscription support when a WebSocket factory is provided.",
            "Injected AEKO wallet adapter detection.",
            "AEKO-721 prepared transaction builders and decoders.",
            "Wallet-permission request and prepared transaction builders."
          ]
        },
        {
          "type": "callout",
          "title": "Wallets sign; apps should not absorb secrets",
          "body": "In browser applications, prefer an injected wallet adapter for user authorization. Keep secret key material out of frontend state and telemetry.",
          "tone": "security"
        }
      ],
      "related": [
        "browser-wallets",
        "wallet-permissions",
        "aeko721",
        "websocket"
      ]
    },
    {
      "id": "node-sdk",
      "title": "Node.js SDK",
      "section": "tooling",
      "summary": "Server-side AEKO client helpers for RPC, signing abstractions, batch/backend flows, listeners, and SocialFi post preparation.",
      "status": "available",
      "tags": [
        "node",
        "backend",
        "sdk",
        "socialfi"
      ],
      "prerequisites": [
        "Node.js service runtime.",
        "An AEKO RPC endpoint."
      ],
      "outcomes": [
        "Use `AekoNodeClient` for server-side reads.",
        "Use SocialFi helpers without reimplementing canonical payload hashing."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Install",
          "language": "bash",
          "value": "npm install @aeko-chain/sdk"
        },
        {
          "type": "code",
          "label": "Create a Node client",
          "language": "javascript",
          "value": "import { AekoNodeClient } from '@aeko-chain/sdk';\n\nconst client = new AekoNodeClient('{{rpcUrl}}', { appName: 'my-service' });\nconst balance = await client.getBalance('ADDRESS');\nconsole.log(balance);"
        },
        {
          "type": "bullets",
          "title": "Node.js capabilities",
          "items": [
            "`AekoNodeClient`, built on the JavaScript connection layer.",
            "Server-side signing helpers.",
            "Webhook-style polling/listener helpers.",
            "Canonical SocialFi post payload hashing and Ed25519 signature verification.",
            "Prepared `AnchorPost` transaction construction and backend orchestration helpers."
          ]
        },
        {
          "type": "callout",
          "title": "Do not invent companion packages",
          "body": "Use `@aeko-chain/sdk` for the Node.js developer surface. Only add companion packages that are explicitly published and supported for the release you target.",
          "tone": "warning"
        }
      ],
      "related": [
        "social-backend",
        "posts-engagement",
        "javascript-sdk"
      ]
    },
    {
      "id": "python-sdk",
      "title": "Python SDK",
      "section": "tooling",
      "summary": "A lightweight Python client for JSON-RPC reads, transaction submission, account decoders, and AEKO asset/permission builders.",
      "status": "available",
      "tags": [
        "python",
        "sdk",
        "automation"
      ],
      "prerequisites": [
        "Python 3.10 or newer.",
        "An AEKO RPC endpoint."
      ],
      "outcomes": [
        "Read chain state from a script.",
        "Submit base64 transactions and poll signature status."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Install",
          "language": "bash",
          "value": "pip install aeko-sdk"
        },
        {
          "type": "code",
          "label": "Read a balance",
          "language": "python",
          "value": "from aeko_sdk import AekoClient\n\nclient = AekoClient('{{rpcUrl}}')\nbalance = client.get_balance('ADDRESS')\nprint(balance)"
        },
        {
          "type": "bullets",
          "title": "Core client methods",
          "items": [
            "`get_latest_blockhash`",
            "`get_balance`",
            "`get_account_info`",
            "`get_program_accounts`",
            "`send_transaction`",
            "`get_signature_statuses`"
          ]
        },
        {
          "type": "callout",
          "title": "Version visibility",
          "body": "Pin a package version in production and check the package-registry release notes when you need a recently introduced helper.",
          "tone": "info"
        }
      ],
      "related": [
        "rpc-quickstart",
        "transaction-failures",
        "aeko721"
      ]
    },
    {
      "id": "rust-sdk",
      "title": "Rust client SDK",
      "section": "tooling",
      "summary": "A high-level async Rust client for AEKO RPC plus typed AEKO-721 and wallet-permission builders/decoders.",
      "status": "available",
      "tags": [
        "rust",
        "sdk",
        "backend"
      ],
      "prerequisites": [
        "Rust toolchain.",
        "Tokio async runtime.",
        "An AEKO RPC endpoint."
      ],
      "outcomes": [
        "Use `AekoDeveloperClient` for typed off-chain integration."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Dependency",
          "language": "toml",
          "value": "[dependencies]\naeko-rust-sdk = \"2\"\ntokio = { version = \"1\", features = [\"macros\", \"rt-multi-thread\"] }"
        },
        {
          "type": "code",
          "label": "Read a balance",
          "language": "rust",
          "value": "use aeko_rust_sdk::AekoDeveloperClient;\n\n#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n    let client = AekoDeveloperClient::new(\"{{rpcUrl}}\".to_string());\n    let balance = client.get_balance(\"11111111111111111111111111111111\").await?;\n    println!(\"balance: {balance}\");\n    Ok(())\n}"
        },
        {
          "type": "bullets",
          "title": "Rust client capabilities",
          "items": [
            "Latest blockhash, balance, account, program-account and signature-status requests.",
            "Base64 transaction submission.",
            "AEKO-721 instruction builders and typed account decoders.",
            "Wallet-permission instruction builders and account decoders."
          ]
        }
      ],
      "related": [
        "first-program",
        "deploy-invoke",
        "wallet-permissions"
      ]
    },
    {
      "id": "rpc-quickstart",
      "title": "JSON-RPC quick start",
      "section": "network-apis",
      "summary": "Call the selected AEKO RPC endpoint directly when an SDK wrapper is unnecessary.",
      "status": "available",
      "tags": [
        "rpc",
        "json-rpc",
        "http"
      ],
      "prerequisites": [
        "A configured RPC endpoint."
      ],
      "outcomes": [
        "Send a JSON-RPC request and handle protocol errors separately from HTTP errors."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "code",
          "label": "Read a recent blockhash",
          "language": "bash",
          "value": "curl -sS '{{rpcUrl}}' \\\n  -H 'content-type: application/json' \\\n  --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getLatestBlockhash\",\"params\":[{\"commitment\":\"confirmed\"}]}'"
        },
        {
          "type": "table",
          "title": "Methods exercised by current SDKs",
          "headers": [
            "Method",
            "Typical use"
          ],
          "rows": [
            [
              "getLatestBlockhash",
              "Prepare a transaction."
            ],
            [
              "getBalance",
              "Read native balance."
            ],
            [
              "getAccountInfo",
              "Read one account."
            ],
            [
              "getProgramAccounts",
              "Find accounts owned by a program."
            ],
            [
              "getTokenAccountsByOwner",
              "Read token accounts for an owner."
            ],
            [
              "sendTransaction",
              "Submit a signed base64 transaction."
            ],
            [
              "getSignatureStatuses",
              "Track confirmation status."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "JSON-RPC errors are application errors",
          "body": "A HTTP 200 response can still contain a JSON-RPC `error`. Check both transport status and the response envelope before using `result`.",
          "tone": "warning"
        }
      ],
      "related": [
        "websocket",
        "explorer-api",
        "errors-rate-limits"
      ]
    },
    {
      "id": "websocket",
      "title": "WebSocket subscriptions",
      "section": "network-apis",
      "summary": "Subscribe to live account changes instead of aggressively polling the RPC endpoint.",
      "status": "available",
      "tags": [
        "websocket",
        "subscriptions",
        "realtime"
      ],
      "prerequisites": [
        "The selected network exposes a WebSocket endpoint.",
        "Your client has reconnection and unsubscribe behavior."
      ],
      "outcomes": [
        "Subscribe to account changes and clean up the subscription."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "code",
          "label": "Protocol request",
          "language": "json",
          "value": "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"accountSubscribe\",\"params\":[\"ADDRESS\",{\"commitment\":\"confirmed\",\"encoding\":\"base64\"}]}"
        },
        {
          "type": "code",
          "label": "JavaScript SDK pattern",
          "language": "javascript",
          "value": "import { AekoConnection } from '@aeko-chain/web3.js';\n\nconst connection = new AekoConnection('{{rpcUrl}}', {\n  websocketFactory: (url) => new WebSocket('{{websocketUrl}}'),\n});\n\nconst subscription = connection.subscribeAccount('ADDRESS', (account) => {\n  console.log(account);\n});\n\n// Later:\nsubscription.unsubscribe();"
        },
        {
          "type": "callout",
          "title": "Reconnect deliberately",
          "body": "Treat socket closure, network changes, and subscription loss as normal failure modes. Reconnect with backoff and recreate subscriptions instead of opening uncontrolled parallel sockets.",
          "tone": "warning"
        }
      ],
      "related": [
        "rpc-quickstart",
        "connectivity"
      ]
    },
    {
      "id": "explorer-api",
      "title": "Explorer API & indexed data",
      "section": "network-apis",
      "summary": "Use the configured Explorer API for searchable, enriched and historical views; use raw RPC for authoritative live chain reads and transaction submission.",
      "status": "available",
      "tags": [
        "explorer",
        "scan",
        "indexed-data",
        "search"
      ],
      "prerequisites": [
        "A configured Explorer API endpoint for the selected network."
      ],
      "outcomes": [
        "Copy the selected Explorer API endpoint.",
        "Choose correctly between raw RPC and indexed reads."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "endpoints",
          "title": "Selected Explorer API",
          "items": [
            {
              "label": "Explorer API",
              "value": "{{explorerApiUrl}}",
              "note": "Indexed application data for the selected network."
            }
          ]
        },
        {
          "type": "code",
          "label": "Read recent blocks",
          "language": "bash",
          "value": "curl \"{{explorerApiUrl}}/blocks?limit=20\""
        },
        {
          "type": "table",
          "title": "Indexed views",
          "headers": [
            "View",
            "Purpose"
          ],
          "rows": [
            [
              "Blocks",
              "Browse indexed block detail and transaction counts."
            ],
            [
              "Transactions",
              "Inspect status, fees, instructions, accounts and logs after indexing."
            ],
            [
              "Accounts",
              "Use composite wallet/account history where available."
            ],
            [
              "Tokens & NFTs",
              "Inspect indexed token, NFT and collection ownership/metadata views."
            ],
            [
              "Creators & posts",
              "Browse indexed creator, post, engagement, reward and stake projections."
            ],
            [
              "Search",
              "Resolve supported chain and SocialFi identifiers."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Indexed data is not the submission path",
          "body": "Indexed views can lag the live chain and may include derived summaries. Submit transactions and read canonical account state through RPC/SDK; use the Explorer API for searchable or enriched presentation.",
          "tone": "info"
        }
      ],
      "related": [
        "verify-scan",
        "indexing-delay",
        "rpc-quickstart",
        "social-backend"
      ]
    },
    {
      "id": "errors-rate-limits",
      "title": "Errors, retries & rate limits",
      "section": "network-apis",
      "summary": "Design clients to distinguish transport failures, JSON-RPC errors, transaction failures, and indexing delay.",
      "status": "available",
      "tags": [
        "errors",
        "retry",
        "rate-limit"
      ],
      "prerequisites": [
        "A client that can classify errors instead of retrying everything."
      ],
      "outcomes": [
        "Retry transient failures safely without duplicating writes."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Failure classes",
          "headers": [
            "Class",
            "Example",
            "Recommended response"
          ],
          "rows": [
            [
              "HTTP / transport",
              "Timeout, DNS, 429, 5xx",
              "Retry idempotent reads with capped exponential backoff; respect server guidance."
            ],
            [
              "JSON-RPC",
              "RPC `error` object",
              "Surface code/message/data and fix the request or state assumption."
            ],
            [
              "Transaction",
              "Signature confirms with `err`",
              "Do not resubmit blindly; inspect the chain error and rebuild only when appropriate."
            ],
            [
              "WebSocket",
              "Disconnect/subscription loss",
              "Reconnect with backoff and recreate intended subscriptions."
            ],
            [
              "Explorer indexing",
              "RPC sees data before Explorer",
              "Wait/retry the indexed read; do not treat as a chain rollback."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Writes require idempotency thinking",
          "body": "When a client times out after submission, first check the known signature/status before building a replacement transaction. A timeout does not prove the network rejected the original write.",
          "tone": "security"
        }
      ],
      "related": [
        "transaction-failures",
        "connectivity",
        "indexing-delay"
      ]
    },
    {
      "id": "program-model",
      "title": "Smart contract model",
      "section": "smart-contracts",
      "summary": "AEKO programs are Rust on-chain programs compiled for SBF, with state stored in accounts and transactions invoking program instructions.",
      "status": "available",
      "tags": [
        "program",
        "smart-contract",
        "rust",
        "sbf"
      ],
      "prerequisites": [
        "Rust familiarity.",
        "Understand public keys/accounts at a basic level."
      ],
      "outcomes": [
        "Know the boundary between an off-chain client and an on-chain program."
      ],
      "blocks": [
        {
          "type": "bullets",
          "title": "Developer mental model",
          "items": [
            "Write on-chain Rust against `aeko-program`.",
            "Compile for the AEKO SBF target; a normal host build is not the deployable artifact.",
            "Deploy the generated `.so` with `aeko program deploy`.",
            "Clients construct instructions that name the program and required accounts.",
            "State lives in accounts; the executable program processes instructions."
          ]
        },
        {
          "type": "callout",
          "title": "Start with the hello program",
          "body": "Start with a minimal hello-style program: one entrypoint, one log path and no custom state. Add account layouts and serialization only after the basic build/deploy/invoke loop works.",
          "tone": "info"
        }
      ],
      "related": [
        "first-program",
        "deploy-invoke",
        "accounts-transactions"
      ]
    },
    {
      "id": "first-program",
      "title": "Write your first Rust program",
      "section": "smart-contracts",
      "summary": "Start with a minimal hello-style Rust program and keep the first instruction surface intentionally small.",
      "status": "available",
      "tags": [
        "rust",
        "program",
        "hello-world"
      ],
      "prerequisites": [
        "Rust toolchain.",
        "AEKO SBF build tooling.",
        "CLI installed for deployment."
      ],
      "outcomes": [
        "Compile a minimal entrypoint into an SBF artifact."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Minimal entrypoint",
          "language": "rust",
          "value": "use aeko_program::{\n    account_info::AccountInfo,\n    entrypoint,\n    entrypoint::ProgramResult,\n    msg,\n    pubkey::Pubkey,\n};\n\nentrypoint!(process_instruction);\n\npub fn process_instruction(\n    _program_id: &Pubkey,\n    _accounts: &[AccountInfo],\n    instruction_data: &[u8],\n) -> ProgramResult {\n    msg!(\"Hello from AEKO!\");\n    msg!(\"instruction bytes: {}\", instruction_data.len());\n    Ok(())\n}"
        },
        {
          "type": "code",
          "label": "Build your program",
          "language": "bash",
          "value": "./cargo-build-sbf \\\n  --manifest-path ./my-program/Cargo.toml \\\n  --sbf-out-dir ./my-program/target/deploy"
        },
        {
          "type": "callout",
          "title": "A host build is not a deployment build",
          "body": "`cargo build` can validate Rust code, but deployment requires the SBF artifact produced by the AEKO SBF toolchain.",
          "tone": "warning"
        }
      ],
      "related": [
        "deploy-invoke",
        "program-lifecycle",
        "application-security",
        "build-sbf"
      ]
    },
    {
      "id": "deploy-invoke",
      "title": "Deploy, invoke & verify",
      "section": "smart-contracts",
      "summary": "Deploy the SBF artifact, retain the program ID and transaction signatures, invoke a real instruction, then verify executable state and logs.",
      "status": "testnet",
      "tags": [
        "deploy",
        "invoke",
        "program",
        "testnet"
      ],
      "prerequisites": [
        "Built SBF `.so` artifact.",
        "Funded Testnet deployer.",
        "CLI configured for Testnet."
      ],
      "outcomes": [
        "Deploy a program and verify an invocation end-to-end."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Deploy your program",
          "language": "bash",
          "value": "aeko config set --url {{rpcUrl}}\naeko program deploy ./my-program/target/deploy/my_program.so"
        },
        {
          "type": "steps",
          "title": "Verification sequence",
          "items": [
            {
              "title": "Capture the program ID",
              "body": "Store the deployment output. Future client instructions must target this public key."
            },
            {
              "title": "Inspect the program account",
              "body": "Use the CLI/Scan to confirm the deployed account is executable before invoking it."
            },
            {
              "title": "Invoke the starter",
              "body": "Construct the instruction expected by your deployed program, sign it with the required wallet or service signer, and submit it to the selected network."
            },
            {
              "title": "Confirm the transaction",
              "body": "Verify the signature and inspect logs for the expected hello message."
            }
          ]
        },
        {
          "type": "callout",
          "title": "Deployment consumes test funds",
          "body": "Use Testnet while iterating. Keep the deployer key separate from production authority and record which key controls upgrades.",
          "tone": "security"
        }
      ],
      "related": [
        "first-program",
        "program-lifecycle",
        "verify-scan",
        "build-sbf",
        "transaction-signing"
      ]
    },
    {
      "id": "program-lifecycle",
      "title": "Program lifecycle",
      "section": "smart-contracts",
      "summary": "Inspect and manage deployed programs with the CLI.",
      "status": "available",
      "tags": [
        "program",
        "upgrade",
        "close",
        "cli"
      ],
      "prerequisites": [
        "A deployed program.",
        "The correct upgrade authority for privileged operations."
      ],
      "outcomes": [
        "Know which CLI family owns deploy/upgrade/show/dump/close operations."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Lifecycle operations",
          "headers": [
            "Operation",
            "CLI family",
            "Safety note"
          ],
          "rows": [
            [
              "Deploy",
              "`aeko program deploy`",
              "Record the resulting program ID and authority."
            ],
            [
              "Inspect",
              "`aeko program show` / `dump`",
              "Confirm executable state and authority before changes."
            ],
            [
              "Stage upgrade bytes",
              "`write-buffer`",
              "Treat buffer authority as privileged."
            ],
            [
              "Upgrade",
              "`upgrade` / authority operations",
              "Verify authority and target network first."
            ],
            [
              "Extend",
              "`extend`",
              "Use only when account sizing requires it."
            ],
            [
              "Close",
              "`close`",
              "Destructive: verify program ID and reclaim destination."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Privileged program operations are irreversible enough to deserve ceremony",
          "body": "Use explicit environment checks, authority verification, and a fresh account inspection before upgrade or close. Never infer the target network from a terminal prompt alone.",
          "tone": "security"
        }
      ],
      "related": [
        "deploy-invoke",
        "application-security",
        "cli-reference",
        "program-security",
        "build-sbf"
      ]
    },
    {
      "id": "browser-wallets",
      "title": "Browser wallet integration",
      "section": "wallets-permissions",
      "summary": "Detect an injected AEKO wallet, inspect its capabilities, connect, and delegate signing instead of collecting user secrets.",
      "status": "available",
      "tags": [
        "wallet",
        "browser",
        "javascript",
        "signing"
      ],
      "prerequisites": [
        "A browser application using the JavaScript SDK.",
        "A compatible injected AEKO wallet provider."
      ],
      "outcomes": [
        "Connect to a detected wallet and use its signing surface."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Detect and connect",
          "language": "javascript",
          "value": "import { detectInjectedAekoWalletAdapter } from '@aeko-chain/web3.js';\n\nconst wallet = detectInjectedAekoWalletAdapter();\nif (!wallet) throw new Error('No compatible AEKO wallet detected');\n\nconst address = await wallet.connect();\nconsole.log(address, wallet.capabilities);"
        },
        {
          "type": "bullets",
          "title": "Adapter capabilities",
          "items": [
            "Connect and disconnect.",
            "Sign messages when the provider exposes message signing.",
            "Sign and send prepared base64 transactions when supported.",
            "Expose the active public key without copying private key material into your application."
          ]
        },
        {
          "type": "callout",
          "title": "Capability-check before calling",
          "body": "Injected providers can expose different methods. Check the adapter `capabilities` object and provide a clear UI fallback instead of assuming every wallet supports every action.",
          "tone": "warning"
        }
      ],
      "related": [
        "javascript-sdk",
        "wallet-permissions",
        "application-security",
        "transaction-signing"
      ]
    },
    {
      "id": "wallet-permissions",
      "title": "Wallet permissions",
      "section": "wallets-permissions",
      "summary": "Plan wallet-scoped delegation, spend limits, allowlists, revocation, freeze/unfreeze, and effective-permission reads through the supported builders.",
      "status": "available",
      "tags": [
        "permissions",
        "wallet",
        "delegate",
        "security"
      ],
      "prerequisites": [
        "Understand the owner wallet, delegate, permission state account, and audit-log account involved in your integration."
      ],
      "outcomes": [
        "Construct a permission request without hand-encoding the program instruction.",
        "Know which policy dimensions must be surfaced to the user."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Create an initialization request",
          "language": "javascript",
          "value": "import { buildInitializePermissionsRequest } from '@aeko-chain/web3.js';\n\nconst request = buildInitializePermissionsRequest({\n  accounts: {\n    permissionState: 'PERMISSION_STATE',\n    auditLog: 'AUDIT_LOG',\n    owner: 'OWNER_ADDRESS',\n  },\n  wallet: 'OWNER_ADDRESS',\n  did: 'did:aeko:example',\n  currentEpoch: 0,\n  defaultProgramPolicy: 'deny_by_default',\n});\n\nconsole.log(request);"
        },
        {
          "type": "table",
          "title": "Supported actions",
          "headers": [
            "Action",
            "Developer meaning"
          ],
          "rows": [
            [
              "Initialize permission account",
              "Create the wallet permission state."
            ],
            [
              "Grant delegate",
              "Authorize another key/app role within explicit limits."
            ],
            [
              "Update delegate",
              "Change role, label, expiry, spend limits or allowlists."
            ],
            [
              "Revoke delegate",
              "Remove delegated authority."
            ],
            [
              "Freeze / unfreeze wallet",
              "Restrict or restore delegated activity."
            ],
            [
              "Record delegate usage",
              "Track scoped usage for policy/audit purposes."
            ],
            [
              "Read effective permissions",
              "Inspect active permission state for a delegate."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Default-deny is the safer integration posture",
          "body": "Ask only for the authority an application needs, show expiry and spend limits to the user, and make revocation discoverable. Permission builders prepare program data; they do not replace user authorization/signing.",
          "tone": "security"
        }
      ],
      "related": [
        "browser-wallets",
        "application-security",
        "javascript-sdk",
        "identity-clearance",
        "transaction-signing"
      ]
    },
    {
      "id": "aeko20",
      "title": "AEKO-20 fungible tokens",
      "section": "tokens-nfts",
      "summary": "AEKO-20 provides a fungible-token instruction surface for issuance, transfers, allowances, account controls and authority management.",
      "status": "available",
      "tags": [
        "token",
        "aeko-20",
        "fungible"
      ],
      "prerequisites": [
        "Know the mint, token accounts, owners/authorities, and policy required by your use case."
      ],
      "outcomes": [
        "Understand the implemented AEKO-20 action surface.",
        "Verify indexed token summaries in Aeko Scan where appropriate."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Implemented instruction areas",
          "headers": [
            "Area",
            "Examples"
          ],
          "rows": [
            [
              "Mint/account setup",
              "Initialize mint and token accounts."
            ],
            [
              "Supply",
              "Authority/public/emission-aware mint paths and burn."
            ],
            [
              "Transfers",
              "Direct transfer and delegated `transfer_from`."
            ],
            [
              "Allowances",
              "Approve and revoke."
            ],
            [
              "Account controls",
              "Freeze and thaw."
            ],
            [
              "Authority",
              "Set mint authority."
            ],
            [
              "Policy hooks",
              "Program state supports controlled mint/transfer policy integration."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Use the published token contract",
          "body": "Integrate against the actions and release-specific deployment details published for the network you target. Avoid relying on historical draft behavior that is not part of the current public contract.",
          "tone": "warning"
        },
        {
          "type": "bullets",
          "title": "Verify token state",
          "items": [
            "Use raw RPC/account reads when your application needs canonical live state.",
            "Use Aeko Scan to inspect indexed token summaries and transfer history when available."
          ]
        }
      ],
      "related": [
        "aeko721",
        "application-security",
        "creator-coins",
        "public-mint"
      ]
    },
    {
      "id": "aeko721",
      "title": "AEKO-721 NFTs",
      "section": "tokens-nfts",
      "summary": "Create collections, mint NFTs, transfer ownership, freeze/thaw items, and update metadata through the implemented AEKO-721 program and SDK builders.",
      "status": "available",
      "tags": [
        "nft",
        "aeko-721",
        "javascript"
      ],
      "prerequisites": [
        "Collection/token account addresses and the appropriate authority.",
        "A wallet capable of signing the prepared transaction."
      ],
      "outcomes": [
        "Use the implemented NFT lifecycle instead of hand-encoding instructions."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Program actions",
          "headers": [
            "Action",
            "What it changes"
          ],
          "rows": [
            [
              "InitializeCollection",
              "Creates collection state and metadata."
            ],
            [
              "MintNft",
              "Creates a unique token with owner, creator, royalties, and metadata."
            ],
            [
              "TransferNft",
              "Moves ownership."
            ],
            [
              "FreezeNft / ThawNft",
              "Controls transferability."
            ],
            [
              "UpdateMetadata",
              "Updates token metadata under authority rules."
            ]
          ]
        },
        {
          "type": "code",
          "label": "JavaScript builder entrypoint",
          "language": "javascript",
          "value": "import { buildPreparedToken721Transaction } from '@aeko-chain/web3.js';\n\nconst preparedBase64 = buildPreparedToken721Transaction({\n  payer: 'PAYER',\n  recentBlockhash: 'RECENT_BLOCKHASH',\n  action: 'transfer',\n  token: 'TOKEN_ACCOUNT',\n  authority: 'CURRENT_OWNER',\n  owner: 'CURRENT_OWNER',\n  recipient: 'NEW_OWNER',\n  metadata: { name: 'unused-for-transfer', uri: 'unused-for-transfer' },\n});\n\n// Send the prepared transaction through the user's wallet/signing flow."
        },
        {
          "type": "bullets",
          "title": "Verify NFT state",
          "items": [
            "Confirm the transaction signature through RPC after a mint, transfer or metadata update.",
            "Use Aeko Scan to inspect indexed NFT and collection ownership/metadata views."
          ]
        }
      ],
      "related": [
        "nft-flow",
        "browser-wallets",
        "asset-metadata"
      ]
    },
    {
      "id": "nft-flow",
      "title": "NFT lifecycle recipe",
      "section": "tokens-nfts",
      "summary": "A practical sequence for building a wallet-signed NFT experience from collection setup through indexed verification.",
      "status": "testnet",
      "tags": [
        "nft",
        "recipe",
        "wallet"
      ],
      "prerequisites": [
        "Testnet wallet with funds.",
        "JavaScript SDK.",
        "Wallet adapter with transaction signing support."
      ],
      "outcomes": [
        "Plan a collection/mint/transfer flow with explicit verification points."
      ],
      "blocks": [
        {
          "type": "steps",
          "title": "End-to-end flow",
          "items": [
            {
              "title": "Read a recent blockhash",
              "body": "Use the selected RPC through `AekoConnection`."
            },
            {
              "title": "Prepare collection setup",
              "body": "Use the SDK collection setup builder when your flow needs the collection account created."
            },
            {
              "title": "Ask the wallet to sign/send",
              "body": "Never sign browser-user transactions with a backend key just to simplify UX."
            },
            {
              "title": "Prepare the mint",
              "body": "Include owner, creator, token ID, royalty basis points and metadata."
            },
            {
              "title": "Verify the signature",
              "body": "Confirm through RPC before waiting for the Explorer index."
            },
            {
              "title": "Read the NFT in Aeko Scan",
              "body": "Use the token/collection identifiers to verify indexed ownership and metadata."
            }
          ]
        },
        {
          "type": "callout",
          "title": "Use demos as workflow examples, not as production trust policy",
          "body": "The demo proves builder/read paths. Production apps still need their own UX, authorization, metadata hosting policy, retries, and key-handling controls.",
          "tone": "security"
        }
      ],
      "related": [
        "aeko721",
        "browser-wallets",
        "verify-scan",
        "asset-metadata",
        "transaction-signing"
      ]
    },
    {
      "id": "socialfi-overview",
      "title": "SocialFi integration model",
      "section": "socialfi",
      "summary": "AEKO SocialFi combines signed application content with on-chain post anchors, engagement, rewards, staking, anti-spam, monetization, and indexed read models.",
      "status": "available",
      "tags": [
        "socialfi",
        "posts",
        "creator"
      ],
      "prerequisites": [
        "Decide which data is application content and which fact must be anchored or settled on chain."
      ],
      "outcomes": [
        "Choose the correct write path and read path for a SocialFi feature."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "SocialFi capabilities",
          "headers": [
            "Program",
            "Purpose"
          ],
          "rows": [
            [
              "social-posts",
              "Post anchors, edits, moderation state and engagement proofs."
            ],
            [
              "social-rewards",
              "Creator/reward settlement logic."
            ],
            [
              "social-staking",
              "Social staking state and actions."
            ],
            [
              "social-anti-spam",
              "Anti-spam/reputation-related enforcement state."
            ],
            [
              "social-monetization",
              "Monetization/subscription/tipping-style program logic."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Reads and writes have different best paths",
          "body": "Write canonical state through signed program transactions. Read searchable feeds, creator profiles, post detail, rewards, engagement and stake history through Aeko Scan when an indexed view is what the product needs.",
          "tone": "info"
        }
      ],
      "related": [
        "posts-engagement",
        "rewards-staking",
        "monetization",
        "social-backend",
        "creator-coins",
        "anti-spam"
      ]
    },
    {
      "id": "posts-engagement",
      "title": "Posts & engagement",
      "section": "socialfi",
      "summary": "Anchor canonical post metadata on chain, keep application content addressable, and use indexed endpoints for feed-style reads.",
      "status": "available",
      "tags": [
        "socialfi",
        "post",
        "engagement",
        "signature"
      ],
      "prerequisites": [
        "Creator wallet/signature flow.",
        "Canonical post ID/content hash/metadata hash/content URI."
      ],
      "outcomes": [
        "Prepare an `AnchorPost` write and verify it through indexed post views."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "On-chain post actions",
          "headers": [
            "Action",
            "Purpose"
          ],
          "rows": [
            [
              "InitializeState",
              "Create program state."
            ],
            [
              "AnchorPost",
              "Anchor canonical post identity/hashes/URI."
            ],
            [
              "EditPost",
              "Anchor an authorized edit."
            ],
            [
              "ModeratePost",
              "Apply program moderation state under authority rules."
            ],
            [
              "RecordEngagement",
              "Record a signed engagement proof."
            ],
            [
              "ReadPostsState",
              "Read targeted program state."
            ]
          ]
        },
        {
          "type": "code",
          "label": "Node canonical payload",
          "language": "javascript",
          "value": "import { buildCanonicalPostPayload, buildPostHashBundle } from '@aeko-chain/sdk';\n\nconst canonical = {\n  postId: 'POST_ID_BASE58_32_BYTES',\n  creator: 'CREATOR_ADDRESS',\n  contentHash: 'CONTENT_HASH',\n  metadataHash: 'METADATA_HASH',\n  contentUri: 'https://example.com/content/123',\n  postKind: 'original',\n  createdAtUnix: Math.floor(Date.now() / 1000),\n  visibility: 'public',\n};\n\nconst payload = buildCanonicalPostPayload(canonical);\nconst hashes = buildPostHashBundle({ content: 'hello', metadata: '{}', canonicalPayload: canonical });\nconsole.log(payload, hashes);"
        },
        {
          "type": "bullets",
          "title": "Indexed reads",
          "items": [
            "Use Aeko Scan to inspect indexed posts and engagement after canonical chain writes are confirmed.",
            "For canonical program state, use RPC/account reads rather than treating an indexed feed as transaction authority."
          ]
        }
      ],
      "related": [
        "social-backend",
        "verify-scan",
        "application-security"
      ]
    },
    {
      "id": "rewards-staking",
      "title": "Creator rewards & social staking",
      "section": "socialfi",
      "summary": "Treat rewards and staking as program-owned financial state, then expose user-facing history through indexed creator/stake views.",
      "status": "available",
      "tags": [
        "socialfi",
        "rewards",
        "staking"
      ],
      "prerequisites": [
        "Understand which program/account owns the reward or staking state for your integration."
      ],
      "outcomes": [
        "Separate transaction writes from indexed portfolio/history reads."
      ],
      "blocks": [
        {
          "type": "bullets",
          "title": "Indexed creator views",
          "items": [
            "Aeko Scan can present creator profiles, reward history and social stake summaries from indexed chain data.",
            "For value-bearing actions, retain and confirm the underlying transaction signature instead of relying on displayed totals alone."
          ]
        },
        {
          "type": "callout",
          "title": "Do not infer payout correctness from UI totals alone",
          "body": "For value-bearing actions, retain the transaction signature and verify chain confirmation. Explorer totals are convenient indexed summaries, not a replacement for the underlying transaction/account evidence.",
          "tone": "security"
        }
      ],
      "related": [
        "socialfi-overview",
        "monetization"
      ]
    },
    {
      "id": "monetization",
      "title": "Monetization & anti-spam",
      "section": "socialfi",
      "summary": "Integrate SocialFi monetization and abuse controls as explicit program/policy boundaries rather than invisible backend flags.",
      "status": "available",
      "tags": [
        "socialfi",
        "monetization",
        "anti-spam"
      ],
      "prerequisites": [
        "A signed user identity/wallet context.",
        "Product rules that explain paid/restricted actions to the user."
      ],
      "outcomes": [
        "Know which program family owns monetization and anti-spam behavior."
      ],
      "blocks": [
        {
          "type": "bullets",
          "title": "Design principles for apps",
          "items": [
            "Keep payment/subscription/tip writes attributable to a signed transaction.",
            "Show users the amount, recipient, and permission scope before signing.",
            "Treat anti-spam/reputation decisions as policy-bearing outcomes that need explainable product states.",
            "Do not place server-only moderation secrets or privileged authority keys in frontend code."
          ]
        },
        {
          "type": "callout",
          "title": "Program presence does not imply one universal product policy",
          "body": "Monetization and anti-spam are separate product capabilities. Your application must still define which actions it exposes, what authority is required, and how policy failures are explained to the user.",
          "tone": "info"
        }
      ],
      "related": [
        "socialfi-overview",
        "application-security",
        "wallet-permissions",
        "anti-spam"
      ]
    },
    {
      "id": "social-backend",
      "title": "Social backend integration",
      "section": "socialfi",
      "summary": "Use the Node SDK to canonicalize and verify post payloads, then prepare signed chain writes while Aeko Scan provides indexed verification views.",
      "status": "available",
      "tags": [
        "socialfi",
        "backend",
        "node",
        "api"
      ],
      "prerequisites": [
        "Node.js backend.",
        "User signature/public key.",
        "An AEKO RPC endpoint and access to Aeko Scan for indexed verification."
      ],
      "outcomes": [
        "Build a backend boundary that verifies user intent before submitting/relaying a prepared SocialFi write."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Verify a signed post payload",
          "language": "javascript",
          "value": "import { verifyPostSignature } from '@aeko-chain/sdk';\n\nconst valid = verifyPostSignature({\n  signer: 'CREATOR_ADDRESS',\n  payload: canonicalPayload,\n  signature: signatureBase64,\n  signatureEncoding: 'base64',\n});\n\nif (!valid) throw new Error('Invalid creator signature');"
        },
        {
          "type": "steps",
          "title": "Backend write boundary",
          "items": [
            {
              "title": "Receive canonical inputs",
              "body": "Accept the public creator address, canonical payload fields, and signature. Do not accept a user private key."
            },
            {
              "title": "Rebuild/canonicalize server-side",
              "body": "Use the SDK canonical payload/hash functions so the backend verifies exactly what it will submit."
            },
            {
              "title": "Verify the signature",
              "body": "Reject mismatches before preparing a program transaction."
            },
            {
              "title": "Prepare/submit through the intended signer model",
              "body": "Keep relayer/service authority separate from creator authorization."
            },
            {
              "title": "Return the transaction signature",
              "body": "Let the client verify chain confirmation and later consume indexed read models."
            }
          ]
        }
      ],
      "related": [
        "posts-engagement",
        "node-sdk"
      ]
    },
    {
      "id": "bridge-status",
      "title": "Bridge availability",
      "section": "security-bridge",
      "summary": "A public bridge integration is not currently available through the supported SDK and API surfaces.",
      "status": "design",
      "tags": [
        "bridge",
        "status",
        "security"
      ],
      "prerequisites": [
        "None for reading this status page."
      ],
      "outcomes": [
        "Avoid integrating against an architectural document as though it were a supported production API."
      ],
      "blocks": [
        {
          "type": "callout",
          "title": "Design / not public",
          "body": "Do not build a production bridge flow until a public interface publishes supported chains and assets, contract or endpoint identifiers, fees, confirmation rules, recovery behavior, and security requirements.",
          "tone": "warning"
        },
        {
          "type": "bullets",
          "title": "Current integration boundary",
          "items": [
            "AEKO defines a bridge model for cross-chain messaging and asset movement.",
            "Do not send assets to addresses obtained from conceptual material or informal examples.",
            "Wait for release-specific supported-chain, asset, fee, finality and failure-recovery guidance."
          ]
        },
        {
          "type": "paragraph",
          "title": "Security rule",
          "body": "Cross-chain transfers depend on privileged verification and relaying. Treat every contract address, guardian/relayer assumption and confirmation rule as release-specific security data."
        }
      ],
      "related": [
        "application-security",
        "networks"
      ]
    },
    {
      "id": "application-security",
      "title": "Application security",
      "section": "security-bridge",
      "summary": "Protect signing authority, minimize permission scope, verify network intent, and make transaction/SDK failures observable.",
      "status": "available",
      "tags": [
        "security",
        "keys",
        "permissions"
      ],
      "prerequisites": [
        "An identified signing model for browser, backend, automation, or deployment workflows."
      ],
      "outcomes": [
        "Apply practical security boundaries to AEKO client integrations."
      ],
      "blocks": [
        {
          "type": "bullets",
          "title": "Baseline controls",
          "items": [
            "Never collect seed phrases or raw private keys in browser application forms.",
            "Display target network, amount, recipient/program and permission scope before signing.",
            "Use least-privilege wallet delegation with explicit expiry/spend limits where permissions are used.",
            "Keep backend/relayer/deployment authority separate from end-user signing authority.",
            "Treat RPC/Explorer responses as untrusted external input; validate shape and handle errors.",
            "Record transaction signatures for audit/recovery without logging signing secrets.",
            "Verify deployed program IDs and upgrade authorities before privileged program operations."
          ]
        },
        {
          "type": "callout",
          "title": "Model your application trust boundaries",
          "body": "Model the assets and trust boundaries in your own product: user wallet, browser origin, backend, relayer or service keys, RPC provider, metadata hosting, and privileged on-chain authorities.",
          "tone": "security"
        }
      ],
      "related": [
        "wallet-permissions",
        "transaction-failures",
        "program-lifecycle",
        "transaction-signing"
      ]
    },
    {
      "id": "accounts-transactions",
      "title": "Accounts & transactions",
      "section": "protocol-concepts",
      "summary": "The application-level protocol model: accounts hold state, programs own/interpret state, instructions act on accounts, and transactions carry signed instructions.",
      "status": "available",
      "tags": [
        "accounts",
        "transactions",
        "protocol"
      ],
      "prerequisites": [
        "None beyond basic public-key concepts."
      ],
      "outcomes": [
        "Reason about client requests using accounts, instructions, signatures, and program ownership."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Concepts",
          "headers": [
            "Concept",
            "Developer meaning"
          ],
          "rows": [
            [
              "Account",
              "Addressed state on chain; balance/data/owner information can be queried through RPC."
            ],
            [
              "Program",
              "Executable on-chain code that processes instructions."
            ],
            [
              "Instruction",
              "A call to a program plus required account metadata and instruction data."
            ],
            [
              "Transaction",
              "A signed atomic container of one or more instructions."
            ],
            [
              "Blockhash",
              "Recent value used when preparing normal transactions."
            ],
            [
              "Signature",
              "Identifier/proof used to track the submitted transaction."
            ]
          ]
        },
        {
          "type": "code",
          "label": "Inspect an account through the JS SDK",
          "language": "javascript",
          "value": "import { AekoConnection } from '@aeko-chain/web3.js';\n\nconst connection = new AekoConnection('{{rpcUrl}}');\nconst account = await connection.getAccountInfo('ADDRESS');\nconsole.log(account);"
        }
      ],
      "related": [
        "rpc-quickstart",
        "fees-finality",
        "program-model",
        "transaction-lifecycle"
      ]
    },
    {
      "id": "fees-finality",
      "title": "Fees, commitment & finality",
      "section": "protocol-concepts",
      "summary": "Treat confirmation level as part of product semantics: fast UI feedback and irreversible business decisions may need different confidence levels.",
      "status": "available",
      "tags": [
        "fees",
        "commitment",
        "finality"
      ],
      "prerequisites": [
        "A transaction or read that needs a confidence/confirmation decision."
      ],
      "outcomes": [
        "Avoid treating `sendTransaction` success as final settlement."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Commitment levels used by current client code",
          "headers": [
            "Level",
            "Typical product use"
          ],
          "rows": [
            [
              "processed",
              "Lowest-latency observation where rollback risk is acceptable."
            ],
            [
              "confirmed",
              "Default balance for many interactive application reads/writes."
            ],
            [
              "finalized",
              "Use when the product needs the strongest available commitment before acting."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Make confirmation policy explicit",
          "body": "The JavaScript SDK defaults to `confirmed`. For transfers, deployment, permission changes, or other high-impact actions, decide which confirmation level your business workflow requires and keep that policy consistent.",
          "tone": "info"
        },
        {
          "type": "paragraph",
          "title": "Fees",
          "body": "Fees belong to transaction execution and should be surfaced as part of the user's signing context when the client can estimate or display them. Do not hard-code historical fee numbers into application logic."
        }
      ],
      "related": [
        "first-transaction",
        "transaction-failures",
        "rpc-quickstart",
        "governance-status",
        "transaction-lifecycle"
      ]
    },
    {
      "id": "connectivity",
      "title": "Troubleshoot connectivity",
      "section": "troubleshooting",
      "summary": "Resolve endpoint, network-selection, HTTP, and WebSocket problems before debugging transaction or program logic.",
      "status": "available",
      "tags": [
        "troubleshooting",
        "rpc",
        "websocket"
      ],
      "prerequisites": [
        "Know which network your application intends to use."
      ],
      "outcomes": [
        "Separate endpoint/configuration faults from higher-level application faults."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "steps",
          "title": "Connectivity checklist",
          "items": [
            {
              "title": "Copy the endpoint again",
              "body": "Use the endpoint shown above instead of a URL copied from older material."
            },
            {
              "title": "Verify a simple read",
              "body": "Use `aeko balance` or `getLatestBlockhash` before testing a complex write."
            },
            {
              "title": "Check network consistency",
              "body": "CLI, SDK, wallet UI and Explorer should all be using the same intended network."
            },
            {
              "title": "Classify the failure",
              "body": "HTTP status, JSON-RPC error, socket close, or malformed application response lead to different fixes."
            },
            {
              "title": "Recreate WebSocket subscriptions",
              "body": "After reconnecting, resubscribe explicitly; a new socket does not restore old subscription IDs."
            }
          ]
        },
        {
          "type": "code",
          "label": "Minimal RPC probe",
          "language": "bash",
          "value": "curl -sS '{{rpcUrl}}' -H 'content-type: application/json' --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getLatestBlockhash\",\"params\":[]}'"
        }
      ],
      "related": [
        "errors-rate-limits",
        "websocket",
        "transaction-failures"
      ]
    },
    {
      "id": "transaction-failures",
      "title": "Troubleshoot failed transactions",
      "section": "troubleshooting",
      "summary": "Differentiate preparation/signing problems, submission uncertainty, confirmed chain errors, and stale blockhash/state assumptions.",
      "status": "available",
      "tags": [
        "troubleshooting",
        "transaction",
        "error"
      ],
      "prerequisites": [
        "Keep the transaction signature whenever submission returns one."
      ],
      "outcomes": [
        "Recover without blindly duplicating a write."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Symptom",
          "headers": [
            "What you see",
            "Check next"
          ],
          "rows": [
            [
              "Wallet refuses to sign",
              "Requested capability, network, transaction content, wallet connection."
            ],
            [
              "RPC rejects submission",
              "JSON-RPC error code/data, encoding, recent blockhash, account prerequisites."
            ],
            [
              "Request times out after send",
              "Query signature status before creating a replacement."
            ],
            [
              "Signature confirms with error",
              "Inspect chain error/instruction logs; fix the state or instruction."
            ],
            [
              "Explorer cannot find it yet",
              "Check RPC signature status first; this may be indexing delay."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Do not equate retry with recovery",
          "body": "A retry that reconstructs and resubmits a financial write can duplicate intent. First determine whether the original signed transaction landed or expired.",
          "tone": "security"
        }
      ],
      "related": [
        "errors-rate-limits",
        "indexing-delay",
        "fees-finality",
        "transaction-lifecycle"
      ]
    },
    {
      "id": "indexing-delay",
      "title": "Troubleshoot Explorer indexing delay",
      "section": "troubleshooting",
      "summary": "Use raw RPC to establish chain truth when the Explorer's indexed/enriched read model has not caught up yet.",
      "status": "available",
      "tags": [
        "troubleshooting",
        "explorer",
        "indexer"
      ],
      "prerequisites": [
        "A transaction signature or account identifier."
      ],
      "outcomes": [
        "Avoid misclassifying an indexer delay as a failed chain write."
      ],
      "blocks": [
        {
          "type": "steps",
          "title": "Determine where the delay is",
          "items": [
            {
              "title": "Check signature status through RPC",
              "body": "If the signature is unknown, continue transaction-level troubleshooting."
            },
            {
              "title": "Read the affected canonical account if practical",
              "body": "Confirm whether the underlying chain state reflects the write."
            },
            {
              "title": "Retry the Explorer read",
              "body": "Indexed history can arrive after raw chain confirmation."
            },
            {
              "title": "Escalate only with evidence",
              "body": "Report the network, signature, canonical RPC observation, Explorer route, and timestamp; never attach signing secrets."
            }
          ]
        },
        {
          "type": "callout",
          "title": "Explorer data is intentionally enriched",
          "body": "The Explorer backend persists searchable historical/relational views. That extra processing is why a brief gap between raw RPC and indexed presentation can occur.",
          "tone": "info"
        }
      ],
      "related": [
        "verify-scan",
        "explorer-api",
        "transaction-failures"
      ]
    },
    {
      "id": "examples",
      "title": "Examples & recipes",
      "section": "tooling",
      "summary": "Start from a working SDK or smart-contract example instead of an empty file.",
      "status": "available",
      "tags": [
        "examples",
        "recipes",
        "starter"
      ],
      "prerequisites": [
        "Choose the SDK or program path that matches your application."
      ],
      "outcomes": [
        "Choose a practical starter task for the client surface you are using."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Starter recipes",
          "headers": [
            "Surface",
            "Starter task",
            "What to learn"
          ],
          "rows": [
            [
              "JavaScript / TypeScript",
              "Connect a wallet, read an account, prepare a transaction",
              "Connection, wallet, permission and transaction patterns."
            ],
            [
              "Node.js",
              "Read chain state and prepare a signed SocialFi write",
              "Backend client and SocialFi service patterns."
            ],
            [
              "Python",
              "Read balances and monitor account state",
              "Basic RPC usage and account watching."
            ],
            [
              "Rust client",
              "Read typed state and submit a signed transaction",
              "Typed client, NFT and permission flows."
            ],
            [
              "Smart contract",
              "Build, deploy and invoke a minimal program",
              "The SBF program lifecycle from entrypoint to verification."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Examples are starting points, not trust policy",
          "body": "Copy the API shape, then add your own network validation, error handling, authorization, secrets management and confirmation policy before production use.",
          "tone": "security"
        }
      ],
      "related": [
        "javascript-sdk",
        "node-sdk",
        "python-sdk",
        "rust-sdk",
        "first-program"
      ]
    },
    {
      "id": "identity-clearance",
      "title": "Identity & clearance status",
      "section": "wallets-permissions",
      "summary": "Identity and clearance are authority-managed capabilities rather than a general wallet self-service flow.",
      "status": "operator",
      "tags": [
        "identity",
        "clearance",
        "permission",
        "registry"
      ],
      "prerequisites": [
        "Confirm that the network and application you target actually expose identity or clearance credentials."
      ],
      "outcomes": [
        "Avoid presenting privileged clearance issuance as a normal public dApp action.",
        "Know when wallet permissions and identity clearance are different concerns."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Application-facing boundary",
          "headers": [
            "Capability",
            "Availability",
            "Developer implication"
          ],
          "rows": [
            [
              "Clearance levels",
              "Applications may consume issued clearance semantics when the selected environment exposes them.",
              "Treat clearance as an input to eligibility, not as a value a normal dApp can self-issue."
            ],
            [
              "Issuer / registry authority",
              "Issuance and registry changes are privileged operations.",
              "Do not expose arbitrary self-service clearance issuance."
            ],
            [
              "Wallet delegation",
              "Public wallet-permission builders support scoped app delegation.",
              "Use wallet permissions for delegation; do not confuse delegation with identity clearance."
            ],
            [
              "High-level identity client",
              "No general-purpose public self-service identity/clearance builder is currently published.",
              "Do not invent a browser KYC or clearance issuance API."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Authority-managed",
          "body": "Applications can consume identity and clearance outcomes when those capabilities are available for the selected network. Issuer onboarding, clearance issuance, and privileged registry changes remain authority-controlled. There is no public self-service clearance issuance flow.",
          "tone": "warning"
        },
        {
          "type": "paragraph",
          "title": "Privacy boundary",
          "body": "When an application only needs an eligibility decision, request the smallest useful clearance/attestation result. Avoid collecting raw credential payloads merely because the chain has a permission layer."
        }
      ],
      "related": [
        "wallet-permissions",
        "application-security"
      ]
    },
    {
      "id": "creator-coins",
      "title": "Creator coins status",
      "section": "tokens-nfts",
      "summary": "Creator coins are an AEKO-20-based SocialFi concept, but a public bonding-curve create/buy/sell workflow is not currently available through the supported SDK surfaces.",
      "status": "design",
      "tags": [
        "creator-coin",
        "aeko-20",
        "socialfi",
        "status"
      ],
      "prerequisites": [
        "None for the status page."
      ],
      "outcomes": [
        "Know what is implemented today and what should not be presented as a ready creator-coin API."
      ],
      "blocks": [
        {
          "type": "callout",
          "title": "Design / not public",
          "body": "AEKO-20 is available for fungible-token primitives. Creator-coin pricing and bonding-curve actions are not currently exposed through a supported high-level create/buy/sell interface, so applications should not invent or hard-code that behavior.",
          "tone": "warning"
        },
        {
          "type": "bullets",
          "title": "Safe integration boundary",
          "items": [
            "Use AEKO-20 documentation for implemented fungible-token primitives.",
            "Treat creator-coin pricing/bonding-curve behavior as unavailable until a deployed program/interface and release-specific contract details are published.",
            "Do not infer creator-coin economics from SocialFi prose and hard-code them into an application."
          ]
        }
      ],
      "related": [
        "aeko20",
        "socialfi-overview"
      ]
    },
    {
      "id": "governance-status",
      "title": "Governance status",
      "section": "protocol-concepts",
      "summary": "The target governance model is not currently available as a public application workflow.",
      "status": "design",
      "tags": [
        "governance",
        "proposal",
        "voting",
        "status"
      ],
      "prerequisites": [
        "None for the status page."
      ],
      "outcomes": [
        "Distinguish validator vote-account tooling from the future application governance model."
      ],
      "blocks": [
        {
          "type": "callout",
          "title": "Design / not public",
          "body": "Proposal creation, two-house voting, timelock execution, treasury spending, and governed parameter mutation are not currently available as a public application workflow. Do not present those actions as live functionality until a public governance interface is released.",
          "tone": "warning"
        },
        {
          "type": "paragraph",
          "title": "Do not confuse CLI vote tooling with app governance",
          "body": "The AEKO CLI includes validator vote-account commands. Those commands are separate from application governance and do not provide a proposal or treasury-governance interface."
        },
        {
          "type": "bullets",
          "title": "What to wait for before integrating",
          "items": [
            "A deployed governance program ID and versioned instruction/account contract.",
            "Proposal creation, voting, quorum/timelock and execution rules enforced on chain.",
            "A public SDK or documented RPC/transaction construction path.",
            "Release-specific treasury/authority boundaries and security review."
          ]
        }
      ],
      "related": [
        "accounts-transactions",
        "fees-finality",
        "application-security"
      ]
    },
    {
      "id": "public-mint",
      "title": "Public & permissioned minting",
      "section": "tokens-nfts",
      "summary": "Use the implemented public-mint program as a policy-controlled issuance boundary; end-user wallets cannot bypass the required mint authority and policy checks.",
      "status": "operator",
      "tags": [
        "public-mint",
        "permissioned-mint",
        "aeko-20",
        "policy"
      ],
      "prerequisites": [
        "An AEKO-20 mint configured for PublicMintControlled issuance.",
        "The release-specific public-mint state and tokenomics state accounts.",
        "A wallet signer plus the controlled mint-authority signer required by the program."
      ],
      "outcomes": [
        "Understand which checks the on-chain public-mint path enforces before supply changes.",
        "Avoid presenting draft service routes or arbitrary self-minting as a supported public workflow."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Implemented program actions",
          "headers": [
            "Action",
            "Who should use it",
            "Purpose"
          ],
          "rows": [
            [
              "InitializePolicy / UpdatePolicy",
              "Network authority",
              "Create or change issuance policy state."
            ],
            [
              "Add/Remove blocklist",
              "Network authority",
              "Deny or restore mint eligibility for a wallet."
            ],
            [
              "Add/Remove allowlist",
              "Network authority",
              "Manage allowlist-gated issuance."
            ],
            [
              "PublicMint",
              "Wallet + controlled mint authority",
              "Apply policy checks, then issue through the AEKO-20 public-mint-controlled path."
            ]
          ]
        },
        {
          "type": "steps",
          "title": "What the on-chain mint path verifies",
          "items": [
            {
              "title": "Policy and eligibility",
              "body": "The public-mint state checks enablement, block/allow lists, cooldown/window limits, anomaly thresholds and subsidy rules."
            },
            {
              "title": "Destination ownership",
              "body": "The destination AEKO-20 account must match the requesting wallet and target mint."
            },
            {
              "title": "Required signatures",
              "body": "The requesting wallet remains attributable, while the configured mint authority must also sign the issuance path."
            },
            {
              "title": "AEKO-20 policy",
              "body": "The token program verifies PublicMintControlled policy, destination validity, freeze state and supply-cap constraints."
            },
            {
              "title": "Usage accounting",
              "body": "The public-mint program persists wallet-window and subsidy usage after successful issuance."
            }
          ]
        },
        {
          "type": "callout",
          "title": "Public mint service availability",
          "body": "A general public HTTP mint service is not currently exposed as a supported application interface. Use the on-chain public-mint path only when the selected network provides the required state, policy, and mint authority.",
          "tone": "warning"
        },
        {
          "type": "callout",
          "title": "Controlled mint authority",
          "body": "A PublicMintControlled asset is not arbitrary self-minting. Keep mint authority inside the intended controlled signing boundary and surface policy, cooldown, and limit failures without exposing authority secrets.",
          "tone": "security"
        }
      ],
      "related": [
        "aeko20",
        "wallet-permissions",
        "application-security"
      ]
    },
    {
      "id": "program-security",
      "title": "Program security checklist",
      "section": "smart-contracts",
      "summary": "Validate signers, account ownership, writable state, serialization and upgrade authority before an AEKO program is treated as production-ready.",
      "status": "available",
      "tags": [
        "program",
        "security",
        "rust",
        "sbf"
      ],
      "prerequisites": [
        "A program instruction/account contract you can trace in source and tests."
      ],
      "outcomes": [
        "Know the minimum authorization and account invariants to test before deployment.",
        "Keep upgrade/close authority separate from normal application signing."
      ],
      "blocks": [
        {
          "type": "bullets",
          "title": "Before deployment",
          "items": [
            "Reject missing or unexpected signers before mutating state.",
            "Validate every program-owned account and the relationships between accounts passed to an instruction.",
            "Mark only accounts that are actually mutated as writable in client instructions.",
            "Bounds-check instruction data and serialized state before arithmetic, indexing or allocation.",
            "Reject unauthorized owners/authorities, duplicate identifiers, invalid freeze state, overflow/underflow and malformed data.",
            "Test failure paths, not just happy-path instruction execution."
          ]
        },
        {
          "type": "table",
          "title": "Authority boundaries",
          "headers": [
            "Authority",
            "Use",
            "Do not"
          ],
          "rows": [
            [
              "User signer",
              "Approve the user's explicit application action.",
              "Reuse it as a deployment or service authority."
            ],
            [
              "Backend/service signer",
              "Pay fees or perform narrowly scoped service actions when the product requires it.",
              "Treat it as proof of user intent."
            ],
            [
              "Upgrade authority",
              "Upgrade/extend/close an upgradeable program.",
              "Store it with routine application credentials."
            ],
            [
              "Program state authority",
              "Mutate policy/configuration state where the program contract allows it.",
              "Infer authority from a client-side role label."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Client validation is not program validation",
          "body": "Wallet UX and backend checks can improve safety, but an on-chain program must enforce signer, owner, account and state invariants itself because clients are untrusted.",
          "tone": "security"
        }
      ],
      "related": [
        "first-program",
        "deploy-invoke",
        "program-lifecycle",
        "application-security"
      ]
    },
    {
      "id": "anti-spam",
      "title": "Anti-spam policy",
      "section": "socialfi",
      "summary": "Consume anti-spam eligibility decisions while keeping policy mutations and penalties behind the network's configured authority.",
      "status": "operator",
      "tags": [
        "socialfi",
        "anti-spam",
        "reputation",
        "staking",
        "cooldown"
      ],
      "prerequisites": [
        "The anti-spam state account for the selected network.",
        "The reputation/stake inputs required by the active policy."
      ],
      "outcomes": [
        "Know which anti-spam checks an application can depend on.",
        "Avoid implementing cooldowns or penalties as frontend-only flags."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Program modes and actions",
          "headers": [
            "Surface",
            "Behavior",
            "Application implication"
          ],
          "rows": [
            [
              "ObserveOnly",
              "Eligibility checks do not gate by reputation/stake.",
              "Use results for observation/telemetry; do not invent enforcement."
            ],
            [
              "GateByReputation",
              "Post/engagement checks require the configured reputation threshold.",
              "Explain eligibility failure instead of retrying the same write blindly."
            ],
            [
              "GateByStake",
              "Eligibility requires the configured minimum stake.",
              "Read/refresh stake state before asking the user to repeat the action."
            ],
            [
              "PenaltyEnabled",
              "Reputation gating is active and authorized penalties can be applied.",
              "Penalty/cooldown mutations remain authority-controlled."
            ]
          ]
        },
        {
          "type": "bullets",
          "title": "Implemented instruction families",
          "items": [
            "`CheckPostEligibility` and `CheckEngagementEligibility` evaluate a wallet against the active mode.",
            "`ReadAntiSpamProfile` exposes the current program profile/state as return data.",
            "`FlagSpamBehavior`, `ApplyCooldown`, `ClearCooldown` and `ApplySpamPenalty` require the configured authority signer.",
            "The post program receives anti-spam state as part of relevant write paths, so product UI should not model eligibility as an unrelated toggle."
          ]
        },
        {
          "type": "callout",
          "title": "Policy authority and app-visible outcomes",
          "body": "Apps can consume eligibility and profile outcomes, but they must not fabricate authority-only flags, cooldown clearing or penalties. Surface the rejection reason and recovery condition that the active policy actually enforces.",
          "tone": "warning"
        }
      ],
      "related": [
        "socialfi-overview",
        "posts-engagement",
        "rewards-staking",
        "application-security"
      ]
    },
    {
      "id": "build-sbf",
      "title": "Build an SBF program",
      "section": "smart-contracts",
      "summary": "Compile an AEKO Rust program into the deployable SBF artifact used by the program deployment workflow.",
      "status": "available",
      "tags": [
        "sbf",
        "build",
        "rust",
        "smart-contract"
      ],
      "prerequisites": [
        "A Rust program that passes normal Rust checks.",
        "AEKO SBF build tooling available in your development environment."
      ],
      "outcomes": [
        "Produce a deployable `.so` artifact.",
        "Know which build output belongs in the deployment step."
      ],
      "blocks": [
        {
          "type": "steps",
          "title": "Build sequence",
          "items": [
            {
              "title": "Check the Rust program first",
              "body": "Resolve ordinary compiler errors before invoking the SBF build. This keeps Rust issues separate from target-specific build failures.",
              "code": "cargo check --manifest-path ./my-program/Cargo.toml"
            },
            {
              "title": "Compile for SBF",
              "body": "Run the AEKO SBF build tool against your program manifest and choose a dedicated deployment output directory.",
              "code": "./cargo-build-sbf \\\n  --manifest-path ./my-program/Cargo.toml \\\n  --sbf-out-dir ./my-program/target/deploy"
            },
            {
              "title": "Locate the deployable artifact",
              "body": "Use the generated `.so` from the SBF output directory for `aeko program deploy`. Do not substitute a normal host build artifact."
            },
            {
              "title": "Keep network configuration out of the build",
              "body": "Building is local. Select Mainnet or Testnet only when you deploy, invoke, or query the resulting program."
            }
          ]
        },
        {
          "type": "callout",
          "title": "Host builds and SBF builds serve different purposes",
          "body": "`cargo check` and a normal Rust build are useful development checks, but the network deploys the SBF artifact produced by the AEKO SBF toolchain.",
          "tone": "warning"
        },
        {
          "type": "bullets",
          "title": "Before you deploy",
          "items": [
            "Keep the exact artifact you intend to deploy identifiable in your release process.",
            "Confirm the deployer wallet is configured for the intended network.",
            "Deploy to Testnet first when changing program logic or account behavior.",
            "Record the returned program ID and upgrade authority after deployment."
          ]
        }
      ],
      "related": [
        "first-program",
        "deploy-invoke",
        "program-lifecycle",
        "program-security"
      ]
    },
    {
      "id": "transaction-signing",
      "title": "Signing transactions",
      "section": "wallets-permissions",
      "summary": "Keep transaction construction separate from authorization so browser users, services, and CLI workflows sign at the correct trust boundary.",
      "status": "available",
      "tags": [
        "signing",
        "transaction",
        "wallet",
        "backend"
      ],
      "prerequisites": [
        "A prepared transaction or a client flow that can produce one.",
        "A signer whose authority matches the accounts required by the transaction."
      ],
      "outcomes": [
        "Choose the correct signing boundary for browser, backend, or CLI flows.",
        "Avoid moving user secrets into application code."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Choose the signing boundary",
          "headers": [
            "Context",
            "Recommended signer",
            "Application responsibility"
          ],
          "rows": [
            [
              "Browser user",
              "Injected AEKO wallet",
              "Prepare the transaction, show intent, request wallet approval, then track the returned transaction result."
            ],
            [
              "Backend service",
              "Server-side signer behind a protected service boundary",
              "Validate business authorization before signing and keep signing material outside browser/client payloads."
            ],
            [
              "CLI workflow",
              "Configured CLI keypair or explicit signer",
              "Make the target network and signer explicit before transfers, deployment, or authority changes."
            ]
          ]
        },
        {
          "type": "code",
          "label": "Browser wallet signing (Testnet flow)",
          "language": "javascript",
          "value": "import { detectInjectedAekoWalletAdapter } from '@aeko-chain/web3.js';\n\nconst wallet = detectInjectedAekoWalletAdapter();\nif (!wallet?.capabilities.signAndSendTransaction) {\n  throw new Error('Transaction signing is unavailable in this wallet');\n}\n\nconst result = await wallet.signAndSendTransaction(preparedTransactionBase64);\nconsole.log(result);"
        },
        {
          "type": "steps",
          "title": "Safe signing flow",
          "items": [
            {
              "title": "Resolve the network first",
              "body": "Build and display the request for the same network the application is connected to. Never reuse a prepared transaction after silently switching networks."
            },
            {
              "title": "Show what the user is authorizing",
              "body": "Display the action, recipient or program, amount where relevant, and permission scope before asking a wallet to approve."
            },
            {
              "title": "Sign only the prepared bytes you reviewed",
              "body": "Do not collect seed phrases or raw private keys to bypass the wallet or service signer boundary."
            },
            {
              "title": "Treat the signature as the tracking handle",
              "body": "After submission, retain the transaction signature and move into confirmation/status checks instead of assuming signing equals settlement."
            }
          ]
        },
        {
          "type": "callout",
          "title": "Check browser-wallet network support before Mainnet",
          "body": "The injected-wallet transaction request currently follows the Testnet signing flow. Before enabling the same browser action on Mainnet, confirm the connected wallet explicitly supports the production network and presents the intended network to the user.",
          "tone": "warning"
        },
        {
          "type": "callout",
          "title": "Browser signing and service signing are different trust models",
          "body": "A browser wallet represents the user's authority. A backend signer represents service authority. Do not substitute one for the other merely to simplify the UI.",
          "tone": "security"
        }
      ],
      "related": [
        "browser-wallets",
        "first-transaction",
        "transaction-lifecycle",
        "application-security"
      ]
    },
    {
      "id": "asset-metadata",
      "title": "NFT metadata",
      "section": "tokens-nfts",
      "summary": "Model collection and NFT metadata consistently so wallet, minting, transfer, and indexed-display flows agree on the same asset identity.",
      "status": "available",
      "tags": [
        "nft",
        "metadata",
        "aeko-721",
        "collection"
      ],
      "prerequisites": [
        "An AEKO-721 collection or a mint flow that will create one.",
        "A stable metadata URI policy for your application."
      ],
      "outcomes": [
        "Know the metadata fields used by AEKO-721 collection and token flows.",
        "Keep display metadata separate from ownership and authority state."
      ],
      "blocks": [
        {
          "type": "table",
          "title": "Metadata model",
          "headers": [
            "Scope",
            "Fields",
            "Use"
          ],
          "rows": [
            [
              "Collection",
              "name, symbol, optional base URI",
              "Identifies the collection and provides an optional shared URI base."
            ],
            [
              "NFT",
              "name, optional description, URI, optional image URI, attributes",
              "Describes the individual item shown by wallets and applications."
            ],
            [
              "Ownership",
              "collection, token ID, owner, creator",
              "Defines chain identity and ownership; do not infer these values from display metadata."
            ],
            [
              "Royalties",
              "royalty basis points",
              "Stores the royalty setting associated with the token."
            ]
          ]
        },
        {
          "type": "code",
          "label": "Metadata object",
          "language": "javascript",
          "value": "const metadata = {\n  name: 'AEKO Pioneer',\n  description: 'Early community collectible',\n  uri: 'https://example.com/nft/42.json',\n  imageUri: 'https://example.com/nft/42.png',\n  attributes: [\n    { traitType: 'Series', value: 'Genesis' },\n    { traitType: 'Tier', value: 'Pioneer' },\n  ],\n};"
        },
        {
          "type": "bullets",
          "title": "Metadata design rules",
          "items": [
            "Treat on-chain owner, creator, collection, token ID and frozen state as authoritative asset state.",
            "Keep metadata URIs stable enough that previously minted items do not unexpectedly change meaning.",
            "Validate remote metadata before rendering it in your application; do not trust text, links or media solely because a token references them.",
            "Use the metadata update flow only when the signing authority and product policy allow the asset description to change."
          ]
        },
        {
          "type": "callout",
          "title": "Metadata is descriptive, not authority",
          "body": "Changing a name, image, attribute, or URI does not transfer ownership. Ownership and authorization are controlled by the token account state and signed program actions.",
          "tone": "security"
        }
      ],
      "related": [
        "aeko721",
        "nft-flow",
        "browser-wallets",
        "application-security"
      ]
    },
    {
      "id": "transaction-lifecycle",
      "title": "Transaction lifecycle",
      "section": "protocol-concepts",
      "summary": "Follow a transaction from preparation through signing, submission, confirmation, and the final state read your product depends on.",
      "status": "available",
      "tags": [
        "transaction",
        "signature",
        "confirmation",
        "lifecycle"
      ],
      "prerequisites": [
        "A client connected to the intended AEKO network.",
        "A signer authorized for the transaction you intend to submit."
      ],
      "outcomes": [
        "Separate preparation, signing, submission, confirmation, and state verification.",
        "Recover safely from uncertain submission outcomes."
      ],
      "blocks": [
        {
          "type": "steps",
          "title": "From intent to verified state",
          "items": [
            {
              "title": "Prepare",
              "body": "Read any required recent blockhash and account state, then construct the transaction for the intended network."
            },
            {
              "title": "Sign",
              "body": "Have every required signer authorize the exact transaction bytes. Keep the signing boundary appropriate for the user or service performing the action."
            },
            {
              "title": "Submit",
              "body": "Send the signed base64 transaction through RPC and capture the returned signature."
            },
            {
              "title": "Observe status",
              "body": "Use signature-status checks to distinguish an accepted transaction, an explicit chain error, and a transaction that is still unresolved."
            },
            {
              "title": "Verify resulting state",
              "body": "Read the account, asset, permission, program, or indexed view your product actually depends on before presenting the workflow as complete."
            }
          ]
        },
        {
          "type": "code",
          "label": "Submit and check status",
          "language": "javascript",
          "value": "import { AekoConnection } from '@aeko-chain/web3.js';\n\nconst connection = new AekoConnection('{{rpcUrl}}');\nconst signature = await connection.sendTransaction(signedTransactionBase64);\nconst [status] = await connection.getSignatureStatuses([signature]);\n\nconsole.log({ signature, status });"
        },
        {
          "type": "table",
          "title": "What each result means",
          "headers": [
            "Observation",
            "Interpretation",
            "Next action"
          ],
          "rows": [
            [
              "Submission returns a signature",
              "The request was accepted for processing.",
              "Track the signature; do not present final settlement yet."
            ],
            [
              "Status contains an error",
              "The transaction was observed but failed.",
              "Surface the chain error and fix the underlying state or instruction."
            ],
            [
              "Status is unresolved after a client timeout",
              "The client does not yet know whether the original write landed.",
              "Check the known signature before constructing a replacement."
            ],
            [
              "Confirmed/finalized plus expected state",
              "The network and application state agree.",
              "Complete the user workflow at the confirmation level your product requires."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "A retry can become a duplicate write",
          "body": "When submission outcome is uncertain, investigate the original signature first. Rebuilding and resubmitting a transfer, mint, permission change, or SocialFi write can duplicate user intent.",
          "tone": "security"
        }
      ],
      "related": [
        "transaction-signing",
        "first-transaction",
        "transaction-failures",
        "fees-finality",
        "verify-scan"
      ]
    }
  ]
};
export const DOC_STATUS = Object.freeze({
  available: { label: 'Available', tone: 'success' },
  testnet: { label: 'Testnet', tone: 'testnet' },
  local: { label: 'Local development', tone: 'neutral' },
  operator: { label: 'Authority-managed', tone: 'neutral' },
  design: { label: 'Design / not public', tone: 'warning' },
});

export const docsSections = docsData.sections;
export const docsPages = docsData.pages;
export const docsPagesById = Object.fromEntries(docsPages.map((page) => [page.id, page]));
export const docsPageOrder = docsSections.flatMap((section) => section.items);
export const defaultDocsPageId = docsPageOrder[0];

export function getDocsPage(pageId) {
  return docsPagesById[pageId] || null;
}

export function getDocsStatus(status) {
  return DOC_STATUS[status] || DOC_STATUS.available;
}

export function getDocsPageNeighbors(pageId) {
  const index = docsPageOrder.indexOf(pageId);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? docsPagesById[docsPageOrder[index - 1]] : null,
    next: index < docsPageOrder.length - 1 ? docsPagesById[docsPageOrder[index + 1]] : null,
  };
}

export function docsAnchor(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getDocsPageOutline(page) {
  if (!page) return [];
  return (page.blocks || [])
    .map((block, index) => {
      if (block.type === 'callout') return null;
      if (block.type === 'code' && !block.title) return null;
      const title = block.title || '';
      if (!title) return null;
      return {
        id: block.anchor || docsAnchor(title) || `section-${index + 1}`,
        title,
      };
    })
    .filter(Boolean);
}

export default docsData;
