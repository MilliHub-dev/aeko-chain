import {
  formatAeko,
  getAccountInfo,
  getBalance,
  getEpochInfo,
  getGenesisHash,
  getHealth,
  getSlot,
  getSupply,
  getVersion,
  getVoteAccounts,
} from './rpc'
import { prepareEditorTransfer, type TransferReviewPayload } from './transfer'
import type { DevelopmentWallet } from './wallet'

export type ShellRisk = 'local' | 'read' | 'transaction'
export interface ShellCommandDefinition { name: string; usage: string; description: string; risk: ShellRisk }
export type ShellResult =
  | { kind: 'output' | 'error'; lines: string[] }
  | { kind: 'clear'; lines: [] }
  | { kind: 'transaction_request'; lines: []; transaction: TransferReviewPayload }

export interface ShellContext {
  network: string
  rpcUrl: string
  wallet: DevelopmentWallet | null
  history: string[]
}

export const EDITOR_SHELL_COMMANDS: readonly ShellCommandDefinition[] = Object.freeze([
  { name: 'help', usage: 'help [command]', description: 'Show available AEKO shell commands.', risk: 'local' },
  { name: 'clear', usage: 'clear', description: 'Clear shell output.', risk: 'local' },
  { name: 'history', usage: 'history', description: 'Show commands from this editor session.', risk: 'local' },
  { name: 'network', usage: 'network', description: 'Show the selected AEKO network and RPC endpoint.', risk: 'local' },
  { name: 'whoami', usage: 'whoami', description: 'Show the selected browser-local development wallet.', risk: 'local' },
  { name: 'health', usage: 'health', description: 'Check the selected AEKO RPC health.', risk: 'read' },
  { name: 'slot', usage: 'slot', description: 'Read the current confirmed slot.', risk: 'read' },
  { name: 'epoch-info', usage: 'epoch-info', description: 'Read current epoch information.', risk: 'read' },
  { name: 'genesis-hash', usage: 'genesis-hash', description: 'Read the selected network genesis hash.', risk: 'read' },
  { name: 'version', usage: 'version', description: 'Read validator software version.', risk: 'read' },
  { name: 'balance', usage: 'balance [address]', description: 'Read an account balance; defaults to the selected wallet.', risk: 'read' },
  { name: 'account', usage: 'account <address>', description: 'Read account owner, balance and executable state.', risk: 'read' },
  { name: 'transfer', usage: 'transfer <recipient> <amount-aeko>', description: 'Review and submit a browser-signed AEKO transfer.', risk: 'transaction' },
  { name: 'supply', usage: 'supply', description: 'Read total and circulating AEKO supply.', risk: 'read' },
  { name: 'validators', usage: 'validators', description: 'Read validator vote-account status.', risk: 'read' },
  { name: 'exit', usage: 'exit', description: 'Explain the relationship between AEKO Shell and Bash.', risk: 'local' },
])

const COMMANDS = new Map(EDITOR_SHELL_COMMANDS.map((command) => [command.name, command]))
const ALIASES = new Map([['epoch', 'epoch-info'], ['genesis', 'genesis-hash'], ['validator', 'validators']])
const SYSTEM_COMMANDS = new Set(['bash','cat','chmod','chown','curl','docker','fish','kubectl','podman','rm','scp','sh','ssh','sudo','wget','zsh'])
const DEFERRED_TRANSACTIONS = new Set(['address-lookup-table','feature','nonce','program','stake','vote'])

function output(kind: 'output' | 'error', lines: string[]): ShellResult { return { kind, lines } }
function line(value: unknown): string { return String(value ?? '') }
function short(value: unknown): string {
  const text = String(value || '')
  return text.length <= 18 ? text || '—' : `${text.slice(0, 8)}…${text.slice(-8)}`
}
function requireRpc(context: ShellContext) {
  if (!context.rpcUrl.trim()) throw new Error('The selected network does not have an RPC endpoint configured.')
}
function classLabel(risk: ShellRisk): string {
  if (risk === 'read') return 'READ · selected-network RPC'
  if (risk === 'transaction') return 'TRANSACTION · explicit browser-wallet approval'
  return 'LOCAL · browser only'
}
function helpLines(name?: string): string[] {
  if (name) {
    const canonical = ALIASES.get(name) || name
    const command = COMMANDS.get(canonical)
    return command
      ? [command.usage, command.description, `Execution class: ${classLabel(command.risk)}`]
      : [`Unknown command "${name}". Run help for the available command set.`]
  }
  return [
    'AEKO Shell · structured developer console',
    'Type a command directly or prefix it with "aeko".',
    '',
    ...EDITOR_SHELL_COMMANDS.map((command) => command.usage.padEnd(36) + command.description),
    '',
    'Use the Bash / AEKO CLI tab for operating-system and arbitrary CLI commands.',
    'Structured transaction commands require explicit in-shell review before signing.',
  ]
}

export function tokenizeShell(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: string | null = null
  let escaped = false
  const push = () => { if (current) tokens.push(current); current = '' }
  for (const character of input.trim()) {
    if (escaped) { current += character; escaped = false; continue }
    if (character === '\\') { escaped = true; continue }
    if (quote) { if (character === quote) quote = null; else current += character; continue }
    if (character === '"' || character === "'") { quote = character; continue }
    if (/\s/.test(character)) { push(); continue }
    current += character
  }
  if (escaped) current += '\\'
  if (quote) throw new Error('Unterminated quoted argument.')
  push()
  return tokens
}

export function parseShellCommand(input: string) {
  const tokens = tokenizeShell(input)
  if (tokens[0]?.toLowerCase() === 'aeko') tokens.shift()
  const raw = String(tokens.shift() || '').toLowerCase()
  return { command: ALIASES.get(raw) || raw, args: tokens }
}

export function shellSuggestions(input: string): ShellCommandDefinition[] {
  const raw = input.trimStart()
  const candidate = raw.toLowerCase().startsWith('aeko ') ? raw.slice(5) : raw
  const trimmed = candidate.trim()
  if (trimmed.includes(' ')) return []
  return EDITOR_SHELL_COMMANDS.filter((command) => command.name.startsWith(trimmed.toLowerCase())).slice(0, 6)
}

export async function executeShellCommand(input: string, context: ShellContext): Promise<ShellResult> {
  const { command, args } = parseShellCommand(input)
  if (!command) return output('output', helpLines())
  if (SYSTEM_COMMANDS.has(command)) {
    return output('error', [`"${command}" is an operating-system command. Use the separate Bash / AEKO CLI tab.`])
  }
  if (DEFERRED_TRANSACTIONS.has(command)) {
    return output('error', [
      `"${command}" is not enabled in the structured AEKO shell yet.`,
      'Use the Bash / AEKO CLI tab for advanced operator commands; structured writes stay review-gated.',
    ])
  }
  if (!COMMANDS.has(command)) return output('error', [`Unknown AEKO shell command "${command}". Run help.`])

  switch (command) {
    case 'help': return output('output', helpLines(args[0]?.toLowerCase()))
    case 'clear': return { kind: 'clear', lines: [] }
    case 'history': return output('output', context.history.length
      ? context.history.map((entry, index) => `${String(index + 1).padStart(3)}  ${entry}`)
      : ['No commands in this AEKO shell session yet.'])
    case 'network': return output('output', [`Network: ${context.network || 'unknown'}`, `RPC: ${context.rpcUrl || 'not configured'}`])
    case 'whoami': return output('output', context.wallet?.address
      ? [`Development wallet: ${context.wallet.address}`]
      : ['No development wallet selected. Open Accounts to create one.'])
    case 'exit': return output('output', ['This is the structured AEKO shell. Switch to Bash / AEKO CLI for a real PTY, or use Projects to leave the workspace.'])
    case 'health': requireRpc(context); return output('output', [`RPC health: ${line(await getHealth(context.rpcUrl))}`])
    case 'slot': requireRpc(context); return output('output', [`Confirmed slot: ${line(await getSlot(context.rpcUrl))}`])
    case 'epoch-info': {
      requireRpc(context)
      const value = await getEpochInfo(context.rpcUrl)
      return output('output', [
        `Epoch: ${line(value.epoch ?? '—')}`,
        `Slot index: ${line(value.slotIndex ?? '—')}`,
        `Slots in epoch: ${line(value.slotsInEpoch ?? '—')}`,
        `Absolute slot: ${line(value.absoluteSlot ?? '—')}`,
        `Block height: ${line(value.blockHeight ?? '—')}`,
      ])
    }
    case 'genesis-hash': requireRpc(context); return output('output', [`Genesis hash: ${line(await getGenesisHash(context.rpcUrl))}`])
    case 'version': {
      requireRpc(context)
      const value = await getVersion(context.rpcUrl)
      return output('output', [`AEKO node: ${line(value['aeko-core'] ?? value['solana-core'] ?? value.version ?? 'unknown')}`])
    }
    case 'balance': {
      requireRpc(context)
      const address = args[0] || context.wallet?.address
      if (!address) return output('error', ['Usage: balance <address> or select a development wallet first.'])
      return output('output', [`Address: ${address}`, `Balance: ${formatAeko(await getBalance(context.rpcUrl, address))}`])
    }
    case 'account': {
      requireRpc(context)
      const address = args[0]
      if (!address) return output('error', ['Usage: account <address>'])
      const value = await getAccountInfo(context.rpcUrl, address)
      if (!value) return output('output', [`Account not found: ${address}`])
      return output('output', [
        `Address: ${address}`,
        `Balance: ${formatAeko(value.lamports ?? 0)}`,
        `Owner: ${line(value.owner ?? '—')}`,
        `Executable: ${line(Boolean(value.executable))}`,
      ])
    }
    case 'transfer': {
      requireRpc(context)
      const transaction = await prepareEditorTransfer(args, context)
      return { kind: 'transaction_request', lines: [], transaction }
    }
    case 'supply': {
      requireRpc(context)
      const raw = await getSupply(context.rpcUrl)
      const value = (raw.value && typeof raw.value === 'object' ? raw.value : raw) as Record<string, unknown>
      return output('output', [
        `Total: ${formatAeko(Number(value.total ?? 0))}`,
        `Circulating: ${formatAeko(Number(value.circulating ?? 0))}`,
        `Non-circulating: ${formatAeko(Number(value.nonCirculating ?? 0))}`,
      ])
    }
    case 'validators': {
      requireRpc(context)
      const value = await getVoteAccounts(context.rpcUrl)
      const current = Array.isArray(value.current) ? value.current : []
      const delinquent = Array.isArray(value.delinquent) ? value.delinquent : []
      const rows = [...current.map((item) => ['current', item] as const), ...delinquent.map((item) => ['delinquent', item] as const)]
      return output('output', [
        `Validators: ${rows.length} · current ${current.length} · delinquent ${delinquent.length}`,
        ...rows.slice(0, 100).map(([status, item]) => {
          const validator = item as Record<string, unknown>
          return `${status.padEnd(10)} identity=${short(validator.nodePubkey ?? validator.identityPubkey)} vote=${short(validator.votePubkey ?? validator.voteAccount)} stake=${formatAeko(Number(validator.activatedStake ?? 0))}`
        }),
        ...(rows.length > 100 ? ['Output capped at 100 validators.'] : []),
      ])
    }
    default: return output('error', ['Unsupported AEKO shell command.'])
  }
}
