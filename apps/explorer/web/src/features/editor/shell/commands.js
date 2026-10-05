import {
  formatAeko,
  getAccountInfo,
  getBalance,
  getEpochInfo,
  getFeeForMessage,
  getGenesisHash,
  getHealth,
  getLatestBlockhash,
  getSlot,
  getSupply,
  getVersion,
  getVoteAccounts,
} from '../../../utils/aekoRpcClient.js';
import { prepareEditorTransfer } from '../transactions/transfer.js';

export const EDITOR_SHELL_COMMANDS = Object.freeze([
  { name: 'help', usage: 'help [command]', description: 'Show available AEKO shell commands.', risk: 'local' },
  { name: 'clear', usage: 'clear', description: 'Clear terminal output.', risk: 'local' },
  { name: 'history', usage: 'history', description: 'Show commands from this editor session.', risk: 'local' },
  { name: 'network', usage: 'network', description: 'Show the selected AEKO network and RPC endpoint.', risk: 'local' },
  { name: 'whoami', usage: 'whoami', description: 'Show the selected browser-local development wallet.', risk: 'local' },
  { name: 'health', usage: 'health', description: 'Check the selected AEKO RPC health.', risk: 'read' },
  { name: 'slot', usage: 'slot', description: 'Read the current confirmed slot.', risk: 'read' },
  { name: 'epoch-info', usage: 'epoch-info', description: 'Read current epoch information.', risk: 'read' },
  { name: 'genesis-hash', usage: 'genesis-hash', description: 'Read the selected network genesis hash.', risk: 'read' },
  { name: 'version', usage: 'version', description: 'Read the validator software version.', risk: 'read' },
  { name: 'balance', usage: 'balance [address]', description: 'Read an account balance. Defaults to the selected development wallet.', risk: 'read' },
  { name: 'account', usage: 'account <address>', description: 'Read account owner, balance and executable state.', risk: 'read' },
  { name: 'transfer', usage: 'transfer <recipient> <amount-aeko>', description: 'Review and submit a browser-signed AEKO transfer.', risk: 'transaction' },
  { name: 'supply', usage: 'supply', description: 'Read total and circulating AEKO supply.', risk: 'read' },
  { name: 'validators', usage: 'validators', description: 'Read validator vote-account status.', risk: 'read' },
  { name: 'exit', usage: 'exit', description: 'Explain how to leave the embedded editor shell.', risk: 'local' },
]);

const COMMANDS = new Map(EDITOR_SHELL_COMMANDS.map((command) => [command.name, command]));
const ALIASES = new Map([
  ['epoch', 'epoch-info'],
  ['genesis', 'genesis-hash'],
  ['validator', 'validators'],
]);

const SYSTEM_COMMANDS = new Set([
  'bash',
  'cat',
  'chmod',
  'chown',
  'curl',
  'docker',
  'fish',
  'kubectl',
  'podman',
  'rm',
  'scp',
  'sh',
  'ssh',
  'sudo',
  'wget',
  'zsh',
]);

const DEFERRED_TRANSACTION_COMMANDS = new Set([
  'address-lookup-table',
  'feature',
  'nonce',
  'program',
  'stake',
  'vote',
]);

const DEFAULT_RPC_CLIENT = Object.freeze({
  getAccountInfo,
  getBalance,
  getEpochInfo,
  getFeeForMessage,
  getGenesisHash,
  getHealth,
  getLatestBlockhash,
  getSlot,
  getSupply,
  getVersion,
  getVoteAccounts,
});

function response(kind, lines = []) {
  return { kind, lines };
}

function line(value) {
  return String(value ?? '');
}

function shortAddress(value) {
  const text = String(value || '');
  if (text.length <= 18) return text || '—';
  return text.slice(0, 8) + '…' + text.slice(-8);
}

function requireRpc(context) {
  if (!String(context?.rpcUrl || '').trim()) {
    throw new Error('The selected network does not have an RPC endpoint configured.');
  }
}

function executionClassLabel(risk) {
  if (risk === 'read') return 'READ · selected-network RPC';
  if (risk === 'transaction') return 'TRANSACTION · explicit browser-wallet approval';
  return 'LOCAL · browser only';
}

function helpLines(commandName) {
  if (commandName) {
    const canonical = ALIASES.get(commandName) || commandName;
    const command = COMMANDS.get(canonical);
    if (!command) {
      return ['Unknown command "' + commandName + '". Run help for the available command set.'];
    }
    return [
      command.usage,
      command.description,
      'Execution class: ' + executionClassLabel(command.risk),
    ];
  }

  return [
    'AEKO Shell · structured developer console',
    'Type a command directly or prefix it with "aeko".',
    '',
    ...EDITOR_SHELL_COMMANDS.map(
      (command) => command.usage.padEnd(36) + command.description,
    ),
    '',
    'Transaction commands require explicit in-terminal review before signing. Operator and OS-shell commands remain unavailable.',
  ];
}

function formatEpochInfo(value) {
  const epoch = value || {};
  return [
    'Epoch: ' + line(epoch.epoch ?? '—'),
    'Slot index: ' + line(epoch.slotIndex ?? '—'),
    'Slots in epoch: ' + line(epoch.slotsInEpoch ?? '—'),
    'Absolute slot: ' + line(epoch.absoluteSlot ?? '—'),
    'Block height: ' + line(epoch.blockHeight ?? '—'),
    'Transaction count: ' + line(epoch.transactionCount ?? '—'),
  ];
}

function formatAccount(address, value) {
  if (!value) return ['Account not found: ' + address];
  return [
    'Address: ' + address,
    'Balance: ' + formatAeko(value.lamports ?? 0),
    'Owner: ' + line(value.owner ?? '—'),
    'Executable: ' + line(Boolean(value.executable)),
    'Rent epoch: ' + line(value.rentEpoch ?? '—'),
    'Data encoding: ' + (
      value.data == null
        ? 'none'
        : Array.isArray(value.data)
          ? line(value.data[1] || 'base64')
          : typeof value.data
    ),
  ];
}

function formatSupply(value) {
  const supply = value?.value || value || {};
  return [
    'Total: ' + formatAeko(supply.total ?? 0),
    'Circulating: ' + formatAeko(supply.circulating ?? 0),
    'Non-circulating: ' + formatAeko(supply.nonCirculating ?? 0),
  ];
}

function validatorLine(status, validator) {
  const identity = validator.nodePubkey || validator.identityPubkey || validator.node_pubkey || '—';
  const vote = validator.votePubkey || validator.voteAccount || validator.vote_pubkey || '—';
  const stake = formatAeko(validator.activatedStake ?? validator.activated_stake ?? 0);
  const commission = validator.commission === undefined
    ? '—'
    : String(validator.commission) + '%';
  return status.padEnd(10)
    + ' identity=' + shortAddress(identity)
    + ' vote=' + shortAddress(vote)
    + ' stake=' + stake
    + ' commission=' + commission;
}

function formatValidators(value) {
  const current = Array.isArray(value?.current) ? value.current : [];
  const delinquent = Array.isArray(value?.delinquent) ? value.delinquent : [];
  const rows = [
    ...current.map((validator) => validatorLine('current', validator)),
    ...delinquent.map((validator) => validatorLine('delinquent', validator)),
  ];
  const visible = rows.slice(0, 100);
  return [
    'Validators: ' + rows.length + ' · current ' + current.length + ' · delinquent ' + delinquent.length,
    ...visible,
    ...(rows.length > visible.length ? ['Output capped at 100 validators.'] : []),
  ];
}

function formatVersion(value) {
  const version = value || {};
  const core = version['aeko-core']
    || version.aekoCore
    || version['solana-core']
    || version.solanaCore
    || version.version
    || 'unknown';
  const featureSet = version['feature-set'] ?? version.featureSet;
  return [
    'AEKO node: ' + line(core),
    ...(featureSet === undefined ? [] : ['Feature set: ' + line(featureSet)]),
  ];
}

export function tokenizeEditorShell(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;

  const pushCurrent = () => {
    if (current) tokens.push(current);
    current = '';
  };

  for (const character of String(input || '').trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      pushCurrent();
      continue;
    }
    current += character;
  }

  if (escaped) current += '\\';
  if (quote) throw new Error('Unterminated quoted argument.');
  pushCurrent();
  return tokens;
}

export function parseEditorShellCommand(input) {
  const tokens = tokenizeEditorShell(input);
  if (tokens[0]?.toLowerCase() === 'aeko') tokens.shift();
  const rawCommand = String(tokens.shift() || '').toLowerCase();
  return {
    command: ALIASES.get(rawCommand) || rawCommand,
    args: tokens,
  };
}

export function getEditorShellSuggestions(input) {
  const raw = String(input || '').trimStart();
  const withPrefix = raw.toLowerCase().startsWith('aeko ');
  const candidate = withPrefix ? raw.slice(5) : raw;
  const trimmed = candidate.trim();
  if (trimmed.includes(' ')) return [];
  const prefix = trimmed.toLowerCase();
  return EDITOR_SHELL_COMMANDS
    .filter((command) => command.name.startsWith(prefix))
    .slice(0, 6);
}

export async function executeEditorShellCommand(input, context = {}, client = DEFAULT_RPC_CLIENT) {
  const { command, args } = parseEditorShellCommand(input);
  if (!command) return response('output', helpLines());

  if (SYSTEM_COMMANDS.has(command)) {
    return response('error', [
      '"' + command + '" is an operating-system command. The AEKO editor shell never forwards input to Bash or the host OS.',
    ]);
  }
  if (DEFERRED_TRANSACTION_COMMANDS.has(command)) {
    return response('error', [
      '"' + command + '" is not enabled in the structured editor shell yet.',
      'Only commands with a complete review, signing, submission, and confirmation path are exposed.',
    ]);
  }
  if (!COMMANDS.has(command)) {
    return response('error', [
      'Unknown AEKO shell command "' + command + '". Run help to list supported commands.',
    ]);
  }

  switch (command) {
    case 'help':
      return response('output', helpLines(args[0]?.toLowerCase()));
    case 'clear':
      return response('clear');
    case 'history':
      return response(
        'output',
        (context.history || []).length
          ? context.history.map(
              (entry, index) => String(index + 1).padStart(3) + '  ' + entry,
            )
          : ['No commands in this editor session yet.'],
      );
    case 'network':
      return response('output', [
        'Network: ' + line(context.network || 'unknown'),
        'RPC: ' + line(context.rpcUrl || 'not configured'),
      ]);
    case 'whoami':
      return response(
        'output',
        context.wallet?.address
          ? ['Development wallet: ' + context.wallet.address]
          : ['No development wallet selected. Create one in the Runtime panel.'],
      );
    case 'exit':
      return response('output', [
        'The AEKO shell is embedded in /docs/editor. Use normal browser navigation to leave the editor.',
      ]);
    case 'health': {
      requireRpc(context);
      const health = await client.getHealth(context.rpcUrl);
      return response('output', ['RPC health: ' + line(health)]);
    }
    case 'slot': {
      requireRpc(context);
      const slot = await client.getSlot(context.rpcUrl);
      return response('output', ['Confirmed slot: ' + line(slot)]);
    }
    case 'epoch-info': {
      requireRpc(context);
      return response('output', formatEpochInfo(await client.getEpochInfo(context.rpcUrl)));
    }
    case 'genesis-hash': {
      requireRpc(context);
      return response('output', [
        'Genesis hash: ' + line(await client.getGenesisHash(context.rpcUrl)),
      ]);
    }
    case 'version': {
      requireRpc(context);
      return response('output', formatVersion(await client.getVersion(context.rpcUrl)));
    }
    case 'balance': {
      requireRpc(context);
      const address = args[0] || context.wallet?.address;
      if (!address) {
        return response('error', [
          'Usage: balance <address> or select a development wallet first.',
        ]);
      }
      return response('output', [
        'Address: ' + address,
        'Balance: ' + formatAeko(await client.getBalance(context.rpcUrl, address)),
      ]);
    }
    case 'account': {
      requireRpc(context);
      if (!args[0]) return response('error', ['Usage: account <address>']);
      return response(
        'output',
        formatAccount(args[0], await client.getAccountInfo(context.rpcUrl, args[0])),
      );
    }
    case 'transfer':
      return prepareEditorTransfer(args, context, client);
    case 'supply': {
      requireRpc(context);
      return response('output', formatSupply(await client.getSupply(context.rpcUrl)));
    }
    case 'validators': {
      requireRpc(context);
      return response('output', formatValidators(await client.getVoteAccounts(context.rpcUrl)));
    }
    default:
      return response('error', ['Unsupported AEKO shell command.']);
  }
}
