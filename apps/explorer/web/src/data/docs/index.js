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
        "rust-sdk"
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
        "deploy-invoke",
        "program-lifecycle"
      ]
    },
    {
      "id": "wallets-permissions",
      "title": "Wallets & permissions",
      "description": "User signing and scoped delegated authority.",
      "items": [
        "browser-wallets",
        "wallet-permissions"
      ]
    },
    {
      "id": "tokens-nfts",
      "title": "Tokens & NFTs",
      "description": "Fungible assets, NFTs and lifecycle recipes.",
      "items": [
        "aeko20",
        "aeko721",
        "nft-flow"
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
        "fees-finality"
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
          "title": "Start with the public surface, not the monorepo",
          "body": "You do not need validator, database, or deployment internals to build an AEKO application. Use the selected network endpoint, a supported SDK or the CLI, then verify chain results in Aeko Scan.",
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
              "body": "Verify connectivity with a balance, account, blockhash, or Explorer API request before asking a wallet to sign."
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
            "Verified repository path"
          ],
          "rows": [
            [
              "AEKO CLI",
              "Wallet operations, transfers, chain queries, program lifecycle",
              "apps/cli"
            ],
            [
              "JavaScript / TypeScript",
              "Browser and general JS applications",
              "apps/sdk/js"
            ],
            [
              "Node.js",
              "Backends, server signing, SocialFi helpers",
              "apps/sdk/node"
            ],
            [
              "Python",
              "Automation, analytics, monitoring, scripts",
              "apps/sdk/python"
            ],
            [
              "Rust client",
              "Typed async services and Rust integrations",
              "apps/sdk/rust-client"
            ],
            [
              "Rust program SDK",
              "On-chain programs compiled for SBF",
              "sdk/program"
            ]
          ]
        }
      ],
      "related": [
        "networks",
        "install-cli",
        "javascript-sdk",
        "rpc-quickstart"
      ],
      "sources": [
        {
          "label": "CLAUDE.md",
          "path": "CLAUDE.md"
        },
        {
          "label": "networkConfig.js",
          "path": "apps/explorer/web/src/utils/networkConfig.js"
        }
      ]
    },
    {
      "id": "networks",
      "title": "Networks & endpoints",
      "section": "start-here",
      "summary": "Use the selected network consistently across CLI, SDK, WebSocket, Explorer API, and Scan verification.",
      "status": "available",
      "tags": [
        "network",
        "rpc",
        "websocket",
        "endpoint"
      ],
      "prerequisites": [
        "The Explorer deployment must expose the selected network in its runtime configuration."
      ],
      "outcomes": [
        "Copy the active RPC, WebSocket, and Explorer API endpoints.",
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
              "note": "Use for indexed, searchable, enriched views."
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
          "body": "Mainnet does not provide test funding. Testnet exposes the funding workflow only when the deployment has configured it. The network panel above reflects the current deployment instead of hard-coding an endpoint.",
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
      ],
      "sources": [
        {
          "label": "networkConfig.js",
          "path": "apps/explorer/web/src/utils/networkConfig.js"
        },
        {
          "label": "NetworkToolsPanel.jsx",
          "path": "apps/explorer/web/src/components/NetworkToolsPanel.jsx"
        }
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
        "Linux x86_64 with glibc or Windows x86_64 are the fast-install targets documented in the repository."
      ],
      "outcomes": [
        "Run `aeko` and `aeko-keygen` from your shell."
      ],
      "blocks": [
        {
          "type": "code",
          "label": "Linux x86_64",
          "language": "bash",
          "value": "curl -fsSL https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.sh | sh"
        },
        {
          "type": "code",
          "label": "Windows x86_64 / PowerShell",
          "language": "powershell",
          "value": "irm https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.ps1 | iex"
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
          "body": "Do not substitute Solana installers or unrelated package names. If your platform is not covered by the checked-in fast installers, follow the AEKO release/source installation instructions for that platform.",
          "tone": "warning"
        }
      ],
      "related": [
        "wallet",
        "networks",
        "cli-reference"
      ],
      "sources": [
        {
          "label": "README.md",
          "path": "install/README.md"
        },
        {
          "label": "cli-tools.md",
          "path": "docs/developer-sdk/cli-tools.md"
        }
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
      ],
      "sources": [
        {
          "label": "clap_app.rs",
          "path": "apps/cli/src/clap_app.rs"
        },
        {
          "label": "security.md",
          "path": "docs/wallet/security.md"
        }
      ]
    },
    {
      "id": "fund-test-wallet",
      "title": "Get test AEKO",
      "section": "start-here",
      "summary": "Fund development wallets through the deployment-provided Testnet funding surface without assuming a private faucet address.",
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
        "Receive test-only AEKO when the deployment enables funding.",
        "Confirm the resulting balance before continuing."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "callout",
          "title": "Testnet only",
          "body": "The Explorer runtime decides whether test funding is available. Mainnet intentionally has no test-funding path.",
          "tone": "warning"
        },
        {
          "type": "steps",
          "title": "Funding workflow",
          "items": [
            {
              "title": "Select Testnet",
              "body": "Use the network control on this page. The funding state shown above comes from the active deployment."
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
      ],
      "sources": [
        {
          "label": "networkConfig.js",
          "path": "apps/explorer/web/src/utils/networkConfig.js"
        },
        {
          "label": "explorer-api.md",
          "path": "docs/rpc-and-apis/explorer-api.md"
        }
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
        "transaction-failures"
      ],
      "sources": [
        {
          "label": "clap_app.rs",
          "path": "apps/cli/src/clap_app.rs"
        },
        {
          "label": "transaction-lifecycle.md",
          "path": "docs/aeko-chain/transaction-lifecycle.md"
        }
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
      ],
      "sources": [
        {
          "label": "explorer-api.md",
          "path": "docs/rpc-and-apis/explorer-api.md"
        },
        {
          "label": "App.jsx",
          "path": "apps/explorer/web/src/App.jsx"
        }
      ]
    },
    {
      "id": "cli-reference",
      "title": "CLI command families",
      "section": "tooling",
      "summary": "A map of the command families exposed by the current AEKO CLI, organized by developer task rather than internal crate.",
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
          "body": "Use the endpoint copied from the active Explorer deployment when accuracy matters. Older documentation may contain network monikers that are not advertised by the current CLI help.",
          "tone": "warning"
        }
      ],
      "related": [
        "install-cli",
        "program-lifecycle",
        "rpc-quickstart"
      ],
      "sources": [
        {
          "label": "clap_app.rs",
          "path": "apps/cli/src/clap_app.rs"
        }
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
          "title": "Verified public surface",
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
      ],
      "sources": [
        {
          "label": "package.json",
          "path": "apps/sdk/js/package.json"
        },
        {
          "label": "index.ts",
          "path": "apps/sdk/js/src/index.ts"
        },
        {
          "label": "connection.ts",
          "path": "apps/sdk/js/src/connection.ts"
        }
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
          "title": "Verified Node exports",
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
          "body": "The repository-owned Node developer package is `@aeko-chain/sdk`. Public docs should not direct developers to unrelated package names unless a corresponding public package surface is verified.",
          "tone": "warning"
        }
      ],
      "related": [
        "social-backend",
        "posts-engagement",
        "javascript-sdk"
      ],
      "sources": [
        {
          "label": "package.json",
          "path": "apps/sdk/node/package.json"
        },
        {
          "label": "index.ts",
          "path": "apps/sdk/node/src/index.ts"
        },
        {
          "label": "socialPosts.ts",
          "path": "apps/sdk/node/src/socialPosts.ts"
        }
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
          "title": "Verified client methods",
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
          "body": "The repository package metadata can move ahead of the latest package-registry release. Pin a version in production and verify the registry release notes when you need a specific newly added helper.",
          "tone": "info"
        }
      ],
      "related": [
        "rpc-quickstart",
        "transaction-failures",
        "aeko721"
      ],
      "sources": [
        {
          "label": "pyproject.toml",
          "path": "apps/sdk/python/pyproject.toml"
        },
        {
          "label": "client.py",
          "path": "apps/sdk/python/src/aeko_sdk/client.py"
        }
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
          "title": "Verified crate scope",
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
      ],
      "sources": [
        {
          "label": "Cargo.toml",
          "path": "apps/sdk/rust-client/Cargo.toml"
        },
        {
          "label": "lib.rs",
          "path": "apps/sdk/rust-client/src/lib.rs"
        }
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
      ],
      "sources": [
        {
          "label": "connection.ts",
          "path": "apps/sdk/js/src/connection.ts"
        },
        {
          "label": "client.py",
          "path": "apps/sdk/python/src/aeko_sdk/client.py"
        }
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
      ],
      "sources": [
        {
          "label": "connection.ts",
          "path": "apps/sdk/js/src/connection.ts"
        },
        {
          "label": "websocket.md",
          "path": "docs/rpc-and-apis/websocket.md"
        }
      ]
    },
    {
      "id": "explorer-api",
      "title": "Explorer API",
      "section": "network-apis",
      "summary": "Use indexed Explorer endpoints for historical, searchable, enriched views; use raw RPC for authoritative live chain calls.",
      "status": "available",
      "tags": [
        "explorer",
        "api",
        "indexer",
        "search"
      ],
      "prerequisites": [
        "A configured Explorer API endpoint."
      ],
      "outcomes": [
        "Choose correctly between raw RPC and indexed Explorer data."
      ],
      "networkTools": true,
      "blocks": [
        {
          "type": "endpoints",
          "title": "Common read paths",
          "items": [
            {
              "label": "Recent blocks",
              "value": "{{explorerApiUrl}}/blocks",
              "note": "Indexed block list."
            },
            {
              "label": "Transactions",
              "value": "{{explorerApiUrl}}/transactions",
              "note": "Searchable transaction history."
            },
            {
              "label": "Search",
              "value": "{{explorerApiUrl}}/search",
              "note": "Resolve common chain and SocialFi identifiers."
            },
            {
              "label": "Posts",
              "value": "{{explorerApiUrl}}/posts",
              "note": "Indexed SocialFi post views."
            }
          ]
        },
        {
          "type": "table",
          "title": "Representative routes",
          "headers": [
            "Route",
            "Purpose"
          ],
          "rows": [
            [
              "GET /blocks/{slot}",
              "Indexed block detail."
            ],
            [
              "GET /transactions/{signature}",
              "Enriched transaction detail."
            ],
            [
              "GET /accounts/{address}",
              "Composite wallet/account view."
            ],
            [
              "GET /tokens/{mint}",
              "AEKO-20 summary."
            ],
            [
              "GET /nfts/{tokenId}",
              "NFT detail."
            ],
            [
              "GET /collections/{collectionId}",
              "Collection summary and items."
            ],
            [
              "GET /creators/{address}",
              "Creator profile summary."
            ],
            [
              "GET /posts/{postId}",
              "Social post detail."
            ],
            [
              "GET /engagement",
              "Indexed engagement activity."
            ],
            [
              "GET /stakes",
              "Indexed social stake records."
            ]
          ]
        },
        {
          "type": "callout",
          "title": "Indexed data is not the transaction submission path",
          "body": "The Explorer API can lag the chain and may contain derived summaries. Use RPC/SDK for transaction submission and canonical account reads; use Explorer API when you need searchable history or enriched relational views.",
          "tone": "info"
        }
      ],
      "related": [
        "verify-scan",
        "indexing-delay",
        "rpc-quickstart",
        "social-backend"
      ],
      "sources": [
        {
          "label": "explorer-api.md",
          "path": "docs/rpc-and-apis/explorer-api.md"
        },
        {
          "label": "backend",
          "path": "apps/explorer/backend"
        }
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
      ],
      "sources": [
        {
          "label": "rate-limits.md",
          "path": "docs/rpc-and-apis/rate-limits.md"
        },
        {
          "label": "connection.ts",
          "path": "apps/sdk/js/src/connection.ts"
        }
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
          "body": "`contracts/hello-aeko-program` is the smallest repository-owned starter: one entrypoint, one log path, and no custom state. Use it before adding account layouts and serialization.",
          "tone": "info"
        }
      ],
      "related": [
        "first-program",
        "deploy-invoke",
        "accounts-transactions"
      ],
      "sources": [
        {
          "label": "README.md",
          "path": "sdk/program/README.md"
        },
        {
          "label": "Cargo.toml",
          "path": "contracts/hello-aeko-program/Cargo.toml"
        }
      ]
    },
    {
      "id": "first-program",
      "title": "Write your first Rust program",
      "section": "smart-contracts",
      "summary": "Start from the repository-owned hello program and keep the first instruction surface intentionally small.",
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
          "label": "Build the repository starter",
          "language": "bash",
          "value": "./cargo-build-sbf \\\n  --manifest-path contracts/hello-aeko-program/Cargo.toml \\\n  --sbf-out-dir contracts/hello-aeko-program/target/deploy"
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
        "application-security"
      ],
      "sources": [
        {
          "label": "lib.rs",
          "path": "contracts/hello-aeko-program/src/lib.rs"
        },
        {
          "label": "write-your-first-program.md",
          "path": "docs/developer-sdk/write-your-first-program.md"
        }
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
          "label": "Deploy the hello program",
          "language": "bash",
          "value": "aeko config set --url {{rpcUrl}}\naeko program deploy contracts/hello-aeko-program/target/deploy/hello_aeko_program.so"
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
              "body": "Use the repository hello-program invocation example or your own client instruction."
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
        "verify-scan"
      ],
      "sources": [
        {
          "label": "deploy-and-invoke-testnet.md",
          "path": "docs/developer-sdk/deploy-and-invoke-testnet.md"
        },
        {
          "label": "hello-aeko-program",
          "path": "contracts/hello-aeko-program"
        }
      ]
    },
    {
      "id": "program-lifecycle",
      "title": "Program lifecycle",
      "section": "smart-contracts",
      "summary": "Inspect and manage deployed programs with the CLI without exposing validator/operator procedures.",
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
        "cli-reference"
      ],
      "sources": [
        {
          "label": "clap_app.rs",
          "path": "apps/cli/src/clap_app.rs"
        }
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
        "application-security"
      ],
      "sources": [
        {
          "label": "wallet.ts",
          "path": "apps/sdk/js/src/wallet.ts"
        }
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
        "javascript-sdk"
      ],
      "sources": [
        {
          "label": "instruction.rs",
          "path": "programs/wallet-permissions/src/instruction.rs"
        },
        {
          "label": "permissions.ts",
          "path": "apps/sdk/js/src/permissions.ts"
        },
        {
          "label": "builders.ts",
          "path": "apps/sdk/js/src/builders.ts"
        }
      ]
    },
    {
      "id": "aeko20",
      "title": "AEKO-20 fungible tokens",
      "section": "tokens-nfts",
      "summary": "The repository contains a live AEKO-20 program implementation; integrate against its implemented instruction surface rather than the older draft checklist.",
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
        "Use Explorer API for indexed token summaries where appropriate."
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
          "title": "The old standard page contains stale implementation checkboxes",
          "body": "Use `programs/token-20` as the implementation source of truth. Public docs should not repeat a historical checklist that still says the reference program is unimplemented.",
          "tone": "warning"
        },
        {
          "type": "endpoints",
          "title": "Indexed token reads",
          "items": [
            {
              "label": "Token summary",
              "value": "{{explorerApiUrl}}/tokens/<MINT>",
              "note": "Indexed AEKO-20 summary."
            },
            {
              "label": "Token transfers",
              "value": "{{explorerApiUrl}}/tokens/transfers",
              "note": "Searchable transfer history when indexed."
            }
          ]
        }
      ],
      "related": [
        "explorer-api",
        "aeko721",
        "application-security"
      ],
      "sources": [
        {
          "label": "lib.rs",
          "path": "programs/token-20/src/lib.rs"
        },
        {
          "label": "instruction.rs",
          "path": "programs/token-20/src/instruction.rs"
        },
        {
          "label": "explorer-api.md",
          "path": "docs/rpc-and-apis/explorer-api.md"
        }
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
          "type": "endpoints",
          "title": "Indexed NFT reads",
          "items": [
            {
              "label": "NFT detail",
              "value": "{{explorerApiUrl}}/nfts/<TOKEN_ID>",
              "note": "Indexed ownership and metadata view."
            },
            {
              "label": "Collection detail",
              "value": "{{explorerApiUrl}}/collections/<COLLECTION_ID>",
              "note": "Collection summary and items."
            }
          ]
        }
      ],
      "related": [
        "nft-flow",
        "browser-wallets",
        "explorer-api"
      ],
      "sources": [
        {
          "label": "instruction.rs",
          "path": "programs/token-721/src/instruction.rs"
        },
        {
          "label": "builders.ts",
          "path": "apps/sdk/js/src/builders.ts"
        }
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
              "title": "Read the NFT in Scan/Explorer API",
              "body": "Use the token/collection identifiers to verify indexed ownership and metadata."
            }
          ]
        },
        {
          "type": "callout",
          "title": "Use the repository demo as implementation evidence, not as a production trust model",
          "body": "The demo proves builder/read paths. Production apps still need their own UX, authorization, metadata hosting policy, retries, and key-handling controls.",
          "tone": "security"
        }
      ],
      "related": [
        "aeko721",
        "browser-wallets",
        "verify-scan"
      ],
      "sources": [
        {
          "label": "examples",
          "path": "apps/sdk/js/examples"
        },
        {
          "label": "NftDemo.jsx",
          "path": "apps/explorer/web/src/pages/NftDemo.jsx"
        }
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
          "title": "Verified program family",
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
          "body": "Write canonical state through signed program transactions. Read searchable feeds, creator profiles, post detail, rewards, engagement and stake history through the Explorer API when an indexed view is what the product needs.",
          "tone": "info"
        }
      ],
      "related": [
        "posts-engagement",
        "rewards-staking",
        "monetization",
        "social-backend"
      ],
      "sources": [
        {
          "label": "lib.rs",
          "path": "programs/social-posts/src/lib.rs"
        },
        {
          "label": "lib.rs",
          "path": "programs/social-rewards/src/lib.rs"
        },
        {
          "label": "lib.rs",
          "path": "programs/social-staking/src/lib.rs"
        },
        {
          "label": "lib.rs",
          "path": "programs/social-anti-spam/src/lib.rs"
        },
        {
          "label": "lib.rs",
          "path": "programs/social-monetization/src/lib.rs"
        }
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
          "type": "endpoints",
          "title": "Indexed reads",
          "items": [
            {
              "label": "Posts",
              "value": "{{explorerApiUrl}}/posts",
              "note": "Feed/search read model."
            },
            {
              "label": "Engagement",
              "value": "{{explorerApiUrl}}/engagement",
              "note": "Indexed engagement records."
            }
          ]
        }
      ],
      "related": [
        "social-backend",
        "verify-scan",
        "application-security"
      ],
      "sources": [
        {
          "label": "instruction.rs",
          "path": "programs/social-posts/src/instruction.rs"
        },
        {
          "label": "socialPosts.ts",
          "path": "apps/sdk/node/src/socialPosts.ts"
        },
        {
          "label": "explorer-api.md",
          "path": "docs/rpc-and-apis/explorer-api.md"
        }
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
          "type": "endpoints",
          "title": "Indexed creator views",
          "items": [
            {
              "label": "Creator",
              "value": "{{explorerApiUrl}}/creators/<ADDRESS>",
              "note": "Composite creator profile."
            },
            {
              "label": "Rewards",
              "value": "{{explorerApiUrl}}/creators/<ADDRESS>/rewards",
              "note": "Creator reward history."
            },
            {
              "label": "Stake",
              "value": "{{explorerApiUrl}}/creators/<ADDRESS>/stake",
              "note": "Social stake summary."
            },
            {
              "label": "All stakes",
              "value": "{{explorerApiUrl}}/stakes",
              "note": "Indexed stake records."
            }
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
        "monetization",
        "explorer-api"
      ],
      "sources": [
        {
          "label": "social-rewards",
          "path": "programs/social-rewards"
        },
        {
          "label": "social-staking",
          "path": "programs/social-staking"
        },
        {
          "label": "explorer-api.md",
          "path": "docs/rpc-and-apis/explorer-api.md"
        }
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
          "body": "The repository implements monetization and anti-spam program families, but an application must still define which actions it exposes, what authority is required, and how failures are explained.",
          "tone": "info"
        }
      ],
      "related": [
        "socialfi-overview",
        "application-security",
        "wallet-permissions"
      ],
      "sources": [
        {
          "label": "social-monetization",
          "path": "programs/social-monetization"
        },
        {
          "label": "social-anti-spam",
          "path": "programs/social-anti-spam"
        }
      ]
    },
    {
      "id": "social-backend",
      "title": "Social backend integration",
      "section": "socialfi",
      "summary": "Use the Node SDK to canonicalize/sign-verify post payloads and prepare chain writes while the Explorer API supplies indexed read models.",
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
        "AEKO RPC and Explorer API endpoints."
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
        "node-sdk",
        "explorer-api"
      ],
      "sources": [
        {
          "label": "socialPosts.ts",
          "path": "apps/sdk/node/src/socialPosts.ts"
        },
        {
          "label": "socialBackend.ts",
          "path": "apps/sdk/node/src/socialBackend.ts"
        },
        {
          "label": "nodejs-backend-integration.md",
          "path": "docs/aeko-social-integration/nodejs-backend-integration.md"
        }
      ]
    },
    {
      "id": "bridge-status",
      "title": "Bridge availability",
      "section": "security-bridge",
      "summary": "The repository describes an AEKO bridge design, but this docs surface does not have evidence of a complete public bridge integration endpoint/SDK workflow.",
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
          "body": "Bridge documents describe lock/mint, guardian, relayer, supported-chain and security concepts. A public app-facing bridge contract/SDK/endpoint flow has not been proven in the inspected consumer surfaces, so this portal does not publish copy-paste bridge execution steps.",
          "tone": "warning"
        },
        {
          "type": "bullets",
          "title": "What you can safely take from the current docs",
          "items": [
            "A bridge design exists in `docs/bridge`.",
            "The design separates source-chain lock/verification from AEKO-side minting and relayer/guardian responsibilities.",
            "Security depends on privileged cross-chain verification, so endpoint/contract addresses must be release-specific and verified before use."
          ]
        },
        {
          "type": "paragraph",
          "title": "Integration rule",
          "body": "Do not send assets to an address copied from an architecture document. Wait for a release-specific public bridge interface with supported chains/assets, deployed contract addresses, confirmation policy, fees, failure recovery, and security review."
        }
      ],
      "related": [
        "application-security",
        "networks"
      ],
      "sources": [
        {
          "label": "bridge-overview.md",
          "path": "docs/bridge/bridge-overview.md"
        },
        {
          "label": "message-flow.md",
          "path": "docs/bridge/message-flow.md"
        },
        {
          "label": "security-model.md",
          "path": "docs/bridge/security-model.md"
        }
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
          "title": "Repository threat-model prose is not a substitute for an application threat model",
          "body": "Model the assets and trust boundaries in your own product: user wallet, browser origin, backend, relayer/service keys, RPC provider, metadata hosting, and any privileged on-chain authorities.",
          "tone": "security"
        }
      ],
      "related": [
        "wallet-permissions",
        "transaction-failures",
        "program-lifecycle"
      ],
      "sources": [
        {
          "label": "threat-model.md",
          "path": "docs/security/threat-model.md"
        },
        {
          "label": "security.md",
          "path": "docs/wallet/security.md"
        }
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
        "Reason about client requests without needing validator internals."
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
        "program-model"
      ],
      "sources": [
        {
          "label": "transaction-lifecycle.md",
          "path": "docs/aeko-chain/transaction-lifecycle.md"
        },
        {
          "label": "connection.ts",
          "path": "apps/sdk/js/src/connection.ts"
        }
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
        "rpc-quickstart"
      ],
      "sources": [
        {
          "label": "connection.ts",
          "path": "apps/sdk/js/src/connection.ts"
        },
        {
          "label": "gas-and-fees.md",
          "path": "docs/aeko-chain/gas-and-fees.md"
        },
        {
          "label": "consensus.md",
          "path": "docs/aeko-chain/consensus.md"
        }
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
              "body": "Use the runtime-provided value above instead of a URL from old documentation."
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
      ],
      "sources": [
        {
          "label": "connection.ts",
          "path": "apps/sdk/js/src/connection.ts"
        },
        {
          "label": "networkConfig.js",
          "path": "apps/explorer/web/src/utils/networkConfig.js"
        }
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
        "fees-finality"
      ],
      "sources": [
        {
          "label": "connection.ts",
          "path": "apps/sdk/js/src/connection.ts"
        },
        {
          "label": "client.py",
          "path": "apps/sdk/python/src/aeko_sdk/client.py"
        }
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
      ],
      "sources": [
        {
          "label": "explorer-api.md",
          "path": "docs/rpc-and-apis/explorer-api.md"
        }
      ]
    }
  ]
};

export const DOC_STATUS = Object.freeze({
  available: { label: 'Available', tone: 'success' },
  testnet: { label: 'Testnet', tone: 'testnet' },
  local: { label: 'Local development', tone: 'neutral' },
  operator: { label: 'Operator-managed', tone: 'neutral' },
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
