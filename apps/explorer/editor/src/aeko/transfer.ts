import {
  confirmSignature,
  formatAeko,
  getBalance,
  getFeeForMessage,
  getLatestBlockhash,
  sendTransaction,
} from './rpc'
import {
  buildLegacyMessageBase64,
  buildSignedLegacyTransaction,
  createSystemTransferInstruction,
  decodeBase58,
} from './transaction'
import type { DevelopmentWallet } from './wallet'

const LAMPORTS_PER_AEKO = 1_000_000_000n
const MAX_SAFE_LAMPORTS = BigInt(Number.MAX_SAFE_INTEGER)

export interface TransferReviewPayload {
  type: 'transfer'
  network: string
  from: string
  to: string
  amountAeko: string
  amountLamports: number
  feeLamports: number
  totalLamports: number
  balanceLamports: number
}

export interface TransferExecutionContext {
  network: string
  rpcUrl: string
  wallet: DevelopmentWallet | null
  onProgress?: (message: string) => void
}

function requireTransactionContext(context: TransferExecutionContext) {
  const rpcUrl = context.rpcUrl.trim()
  if (!rpcUrl) throw new Error('The selected network does not have an RPC endpoint configured.')
  if (!context.wallet?.address || !context.wallet.privateKeyPkcs8B64) {
    throw new Error('Create or select a browser-local development wallet before sending AEKO.')
  }
  return { rpcUrl, wallet: context.wallet, network: context.network || 'unknown' }
}

function parseAekoAmount(rawAmount: string): { amountAeko: string; lamports: number } {
  const value = rawAmount.trim()
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(value)
  if (!match) throw new Error('Transfer amount must be a positive AEKO decimal with at most 9 decimal places.')
  const whole = BigInt(match[1] ?? '0')
  const fractionText = match[2] ?? ''
  const fraction = BigInt(fractionText.padEnd(9, '0') || '0')
  const lamports = whole * LAMPORTS_PER_AEKO + fraction
  if (lamports <= 0n) throw new Error('Transfer amount must be greater than zero AEKO.')
  if (lamports > MAX_SAFE_LAMPORTS) throw new Error('Transfer amount is too large for the browser transaction builder.')
  const trimmedFraction = fractionText.replace(/0+$/, '')
  return {
    amountAeko: trimmedFraction ? `${match[1]}.${trimmedFraction}` : match[1] ?? '0',
    lamports: Number(lamports),
  }
}

export function parseEditorTransferArgs(args: string[]) {
  if (args.length !== 2) throw new Error('Usage: transfer <recipient> <amount-aeko>')
  const recipient = String(args[0] || '').trim()
  try {
    decodeBase58(recipient)
  } catch {
    throw new Error('Transfer recipient must be a valid AEKO public key.')
  }
  return { recipient, ...parseAekoAmount(String(args[1] || '')) }
}

async function loadTransferSnapshot({ rpcUrl, from, to, lamports }: {
  rpcUrl: string
  from: string
  to: string
  lamports: number
}) {
  const [balanceLamports, recentBlockhash] = await Promise.all([
    getBalance(rpcUrl, from),
    getLatestBlockhash(rpcUrl),
  ])
  if (!recentBlockhash) throw new Error('RPC did not return a recent blockhash.')
  const instruction = createSystemTransferInstruction({ from, to, lamports })
  const feeLamports = await getFeeForMessage(
    rpcUrl,
    buildLegacyMessageBase64({ feePayerAddress: from, recentBlockhash, instructions: [instruction] }),
  )
  const totalLamports = lamports + feeLamports
  if (!Number.isSafeInteger(totalLamports)) throw new Error('Transfer total exceeds the browser transaction builder limit.')
  return { balanceLamports, recentBlockhash, instruction, feeLamports, totalLamports }
}

function requireSpendableBalance(snapshot: { balanceLamports: number; totalLamports: number }) {
  if (snapshot.balanceLamports < snapshot.totalLamports) {
    throw new Error(
      `Insufficient balance. Transfer plus network fee requires ${formatAeko(snapshot.totalLamports)}, but the selected wallet has ${formatAeko(snapshot.balanceLamports)}.`,
    )
  }
}

export async function prepareEditorTransfer(
  args: string[],
  context: TransferExecutionContext,
): Promise<TransferReviewPayload> {
  const { rpcUrl, wallet, network } = requireTransactionContext(context)
  const parsed = parseEditorTransferArgs(args)
  const snapshot = await loadTransferSnapshot({
    rpcUrl,
    from: wallet.address,
    to: parsed.recipient,
    lamports: parsed.lamports,
  })
  requireSpendableBalance(snapshot)
  return {
    type: 'transfer',
    network,
    from: wallet.address,
    to: parsed.recipient,
    amountAeko: parsed.amountAeko,
    amountLamports: parsed.lamports,
    feeLamports: snapshot.feeLamports,
    totalLamports: snapshot.totalLamports,
    balanceLamports: snapshot.balanceLamports,
  }
}

export async function executeEditorTransfer(
  transaction: TransferReviewPayload,
  context: TransferExecutionContext,
) {
  const { rpcUrl, wallet, network } = requireTransactionContext(context)
  if (transaction.type !== 'transfer') throw new Error('Unsupported editor transaction request.')
  if (
    !Number.isSafeInteger(transaction.amountLamports)
    || transaction.amountLamports <= 0
    || !Number.isSafeInteger(transaction.feeLamports)
    || transaction.feeLamports < 0
  ) {
    throw new Error('Reviewed transfer payload is invalid. Run the transfer command again.')
  }
  decodeBase58(transaction.from)
  decodeBase58(transaction.to)
  if (network !== transaction.network) throw new Error('Selected network changed after review. Run the transfer command again.')
  if (wallet.address !== transaction.from) throw new Error('Selected wallet changed after review. Run the transfer command again.')

  context.onProgress?.('Rechecking wallet balance and network fee…')
  const snapshot = await loadTransferSnapshot({
    rpcUrl,
    from: transaction.from,
    to: transaction.to,
    lamports: transaction.amountLamports,
  })
  if (snapshot.feeLamports > transaction.feeLamports) {
    throw new Error('Network fee increased after review. Run the transfer command again to review the new fee.')
  }
  requireSpendableBalance(snapshot)

  context.onProgress?.('Signing the reviewed transaction in this browser…')
  const signedTransaction = await buildSignedLegacyTransaction({
    feePayer: wallet,
    recentBlockhash: snapshot.recentBlockhash,
    instructions: [snapshot.instruction],
  })
  context.onProgress?.('Submitting the signed transaction to the selected AEKO RPC…')
  const signature = await sendTransaction(rpcUrl, signedTransaction)
  try {
    context.onProgress?.(`Submitted ${signature}; waiting for confirmed chain status…`)
    const status = await confirmSignature(rpcUrl, signature)
    return { signature, status, feeLamports: snapshot.feeLamports }
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause || 'Transaction confirmation failed.'))
    throw Object.assign(error, { submittedSignature: signature })
  }
}
