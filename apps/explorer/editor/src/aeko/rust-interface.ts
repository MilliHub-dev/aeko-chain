const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'
const RENT_SYSVAR_ID = 'SysvarRent111111111111111111111111111111111'
const CLOCK_SYSVAR_ID = 'SysvarC1ock11111111111111111111111111111111'

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function decodeBase58(value: string): Uint8Array {
  const input = value.trim()
  if (!input) throw new Error('Missing base58 value.')
  const bytes: number[] = []
  for (const character of input) {
    const index = BASE58_ALPHABET.indexOf(character)
    if (index < 0) throw new Error('Invalid base58 character "' + character + '".')
    let carry = index
    for (let offset = 0; offset < bytes.length; offset += 1) {
      const next = (bytes[offset] ?? 0) * 58 + carry
      bytes[offset] = next & 0xff
      carry = next >> 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (let index = 0; index < input.length && input[index] === '1'; index += 1) bytes.push(0)
  const decoded = Uint8Array.from(bytes.reverse())
  if (decoded.length !== 32) throw new Error('Expected a 32-byte public key, got ' + String(decoded.length) + '.')
  return decoded
}

export type InteractionCategory = 'create' | 'read' | 'update' | 'delete' | 'action'
export type InteractionFieldKind = 'string' | 'bool' | 'integer' | 'pubkey' | 'bytes' | 'unsupported'

export interface InteractionField {
  name: string
  rustType: string
  kind: InteractionFieldKind
  optional: boolean
  bits?: number
  signed?: boolean
  arrayLength?: number
}

export interface InteractionAccount {
  name: string
  isSigner: boolean
  isWritable: boolean
  defaultAddress: string | null
}

export interface RustInteractionOperation {
  id: string
  enumName: string
  variant: string
  variantIndex: number
  functionName: string | null
  category: InteractionCategory
  fields: InteractionField[]
  accounts: InteractionAccount[]
  supported: boolean
  unsupportedReason: string | null
}

export interface RustProgramInterface {
  enumName: string | null
  operations: RustInteractionOperation[]
  sourceFiles: string[]
}

export interface RustSource {
  path: string
  content: string
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function matchingIndex(source: string, start: number, open: string, close: string): number {
  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index] ?? ''
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === open) depth += 1
    if (character === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function splitTopLevel(source: string, separator = ','): string[] {
  const output: string[] = []
  let current = ''
  let angle = 0
  let brace = 0
  let bracket = 0
  let paren = 0
  let quote: string | null = null
  let escaped = false

  for (const character of source) {
    if (quote) {
      current += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '<') angle += 1
    else if (character === '>') angle = Math.max(0, angle - 1)
    else if (character === '{') brace += 1
    else if (character === '}') brace = Math.max(0, brace - 1)
    else if (character === '[') bracket += 1
    else if (character === ']') bracket = Math.max(0, bracket - 1)
    else if (character === '(') paren += 1
    else if (character === ')') paren = Math.max(0, paren - 1)

    if (character === separator && angle === 0 && brace === 0 && bracket === 0 && paren === 0) {
      if (current.trim()) output.push(current.trim())
      current = ''
      continue
    }
    current += character
  }

  if (current.trim()) output.push(current.trim())
  return output
}

function unwrapOption(type: string): { optional: boolean; inner: string } {
  const value = type.trim()
  const match = /^Option\s*<([\s\S]+)>$/.exec(value)
  return match ? { optional: true, inner: String(match[1] ?? '').trim() } : { optional: false, inner: value }
}

function classifyField(name: string, rustType: string): InteractionField {
  const option = unwrapOption(rustType)
  const type = option.inner.replace(/\s+/g, ' ').trim()
  if (type === 'String' || type === '&str') return { name, rustType, kind: 'string', optional: option.optional }
  if (type === 'bool') return { name, rustType, kind: 'bool', optional: option.optional }
  if (type === 'Pubkey') return { name, rustType, kind: 'pubkey', optional: option.optional }

  const integer = /^(u|i)(8|16|32|64|128)$/.exec(type)
  if (integer) {
    return {
      name,
      rustType,
      kind: 'integer',
      optional: option.optional,
      signed: integer[1] === 'i',
      bits: Number(integer[2]),
    }
  }

  const array = /^\[\s*u8\s*;\s*(\d+)\s*\]$/.exec(type)
  if (array) {
    return {
      name,
      rustType,
      kind: 'bytes',
      optional: option.optional,
      arrayLength: Number(array[1]),
    }
  }
  return { name, rustType, kind: 'unsupported', optional: option.optional }
}

function categoryFor(name: string): InteractionCategory {
  const value = name.toLowerCase()
  if (/^(initialize|create|register|mint|list|open|add)/.test(value)) return 'create'
  if (/^(read|get|fetch|query|inspect|view)/.test(value)) return 'read'
  if (/^(delete|remove|close|revoke|burn|cancel)/.test(value)) return 'delete'
  if (/^(set|update|edit|approve|transfer|freeze|thaw|moderate|record)/.test(value)) return 'update'
  return 'action'
}

interface VariantRecord {
  name: string
  index: number
  fields: InteractionField[]
  tuple: boolean
}

function parseVariants(body: string): VariantRecord[] {
  return splitTopLevel(body).map((raw, index) => {
    const named = /^([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*)\}$/.exec(raw.trim())
    if (named) {
      const fields = splitTopLevel(String(named[2] ?? '')).map((field) => {
        const match = /^(?:pub\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]+)$/.exec(field.trim())
        return match
          ? classifyField(String(match[1] ?? ''), String(match[2] ?? '').trim())
          : classifyField(field.trim(), 'unknown')
      })
      return { name: String(named[1] ?? ''), index, fields, tuple: false }
    }
    const tuple = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/.exec(raw.trim())
    if (tuple) return { name: String(tuple[1] ?? ''), index, fields: [], tuple: true }
    const unit = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(raw.trim())
    return { name: String(unit?.[1] ?? raw.trim()), index, fields: [], tuple: false }
  }).filter((variant) => Boolean(variant.name))
}

interface ConstructorRecord {
  functionName: string
  variant: string
  accounts: InteractionAccount[]
}

function normalizeAccountName(expression: string): string {
  const compact = expression.replace(/\s+/g, '')
  if (compact.includes('system_program::id()') || compact.includes('system_program::ID')) return 'system_program'
  if (compact.includes('sysvar::rent::id()')) return 'rent_sysvar'
  if (compact.includes('sysvar::clock::id()')) return 'clock_sysvar'
  return expression
    .replace(/[\s&*()]/g, '')
    .replace(/\.clone\(\)$/g, '')
    .replace(/_pubkey$/i, '')
    .replace(/_address$/i, '')
    .replace(/^crate::/, '')
    .trim() || 'account'
}

function defaultAccountAddress(expression: string): string | null {
  const compact = expression.replace(/\s+/g, '')
  if (compact.includes('system_program::id()') || compact.includes('system_program::ID')) return SYSTEM_PROGRAM_ID
  if (compact.includes('sysvar::rent::id()')) return RENT_SYSVAR_ID
  if (compact.includes('sysvar::clock::id()')) return CLOCK_SYSVAR_ID
  return null
}

function parseConstructors(source: string, enumName: string): ConstructorRecord[] {
  const records: ConstructorRecord[] = []
  const functionPattern = /pub\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  let match: RegExpExecArray | null

  while ((match = functionPattern.exec(source))) {
    const openParen = source.indexOf('(', match.index)
    const closeParen = matchingIndex(source, openParen, '(', ')')
    if (closeParen < 0) continue
    const openBrace = source.indexOf('{', closeParen)
    if (openBrace < 0) continue
    const closeBrace = matchingIndex(source, openBrace, '{', '}')
    if (closeBrace < 0) continue
    const body = source.slice(openBrace + 1, closeBrace)
    if (!body.includes('Instruction::new_with_borsh')) continue

    const variantPattern = new RegExp(enumName + '::([A-Za-z_][A-Za-z0-9_]*)')
    const variantMatch = variantPattern.exec(body)
    if (!variantMatch) continue

    const accounts: InteractionAccount[] = []
    const vecIndex = body.indexOf('vec![')
    if (vecIndex >= 0) {
      const openBracket = body.indexOf('[', vecIndex)
      const closeBracket = matchingIndex(body, openBracket, '[', ']')
      if (closeBracket >= 0) {
        for (const entry of splitTopLevel(body.slice(openBracket + 1, closeBracket))) {
          const meta = /AccountMeta::(new_readonly|new)\s*\(\s*([\s\S]+?)\s*,\s*(true|false)\s*\)/.exec(entry)
          if (!meta) continue
          const expression = String(meta[2] ?? '')
          accounts.push({
            name: normalizeAccountName(expression),
            isSigner: meta[3] === 'true',
            isWritable: meta[1] === 'new',
            defaultAddress: defaultAccountAddress(expression),
          })
        }
      }
    }

    records.push({
      functionName: String(match[1] ?? ''),
      variant: String(variantMatch[1] ?? ''),
      accounts,
    })
    functionPattern.lastIndex = closeBrace + 1
  }
  return records
}

function findInstructionEnum(source: string): { enumName: string; body: string } | null {
  const pattern = /pub\s+enum\s+([A-Za-z_][A-Za-z0-9_]*Instruction)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    const prelude = source.slice(Math.max(0, match.index - 420), match.index)
    if (!prelude.includes('BorshSerialize') || !prelude.includes('BorshDeserialize')) continue
    const openBrace = source.indexOf('{', match.index)
    const closeBrace = matchingIndex(source, openBrace, '{', '}')
    if (closeBrace < 0) continue
    return { enumName: String(match[1] ?? ''), body: source.slice(openBrace + 1, closeBrace) }
  }
  return null
}

export function parseRustProgramInterface(sources: RustSource[]): RustProgramInterface {
  const normalized = sources
    .filter((source) => source.path.endsWith('.rs'))
    .map((source) => ({ ...source, content: stripComments(source.content) }))

  let enumRecord: { enumName: string; body: string } | null = null
  for (const source of normalized) {
    enumRecord = findInstructionEnum(source.content)
    if (enumRecord) break
  }
  if (!enumRecord) return { enumName: null, operations: [], sourceFiles: normalized.map((item) => item.path) }

  const constructors = normalized.flatMap((source) => parseConstructors(source.content, enumRecord?.enumName ?? ''))
  const variants = parseVariants(enumRecord.body)
  const operations = variants.map<RustInteractionOperation>((variant) => {
    const constructor = constructors.find((item) => item.variant === variant.name) ?? null
    const unsupportedField = variant.fields.find((field) => field.kind === 'unsupported')
    const unsupportedReason = variant.tuple
      ? 'Tuple instruction variants are not auto-generated yet.'
      : unsupportedField
        ? 'Unsupported Rust field type: ' + unsupportedField.rustType
        : constructor
          ? null
          : 'No public Instruction::new_with_borsh constructor was found for this variant.'
    return {
      id: enumRecord!.enumName + ':' + variant.name,
      enumName: enumRecord!.enumName,
      variant: variant.name,
      variantIndex: variant.index,
      functionName: constructor?.functionName ?? null,
      category: categoryFor(constructor?.functionName ?? variant.name),
      fields: variant.fields,
      accounts: constructor?.accounts ?? [],
      supported: unsupportedReason === null,
      unsupportedReason,
    }
  })

  return { enumName: enumRecord.enumName, operations, sourceFiles: normalized.map((item) => item.path) }
}

function littleEndian(value: bigint, bytes: number, signed: boolean): Uint8Array {
  const bits = BigInt(bytes * 8)
  const min = signed ? -(1n << (bits - 1n)) : 0n
  const max = signed ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n
  if (value < min || value > max) throw new Error('Integer is outside the ' + (signed ? 'i' : 'u') + String(bytes * 8) + ' range.')
  let normalized = value
  if (signed && value < 0) normalized = (1n << bits) + value
  const output = new Uint8Array(bytes)
  for (let index = 0; index < bytes; index += 1) {
    output[index] = Number(normalized & 0xffn)
    normalized >>= 8n
  }
  return output
}

function encodeFixedBytes(value: string, length: number): Uint8Array {
  const trimmed = value.trim()
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === length * 2) {
    return Uint8Array.from(Array.from({ length }, (_, index) => Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16)))
  }
  const decoded = decodeBase58(trimmed)
  if (decoded.length !== length) throw new Error('Expected ' + String(length) + ' bytes.')
  return decoded
}

function encodeField(field: InteractionField, value: string | boolean): Uint8Array {
  const empty = typeof value === 'string' && value.trim() === ''
  if (field.optional) {
    if (empty) return Uint8Array.of(0)
    return concatBytes(Uint8Array.of(1), encodeField({ ...field, optional: false }, value))
  }

  if (field.kind === 'string') {
    const bytes = new TextEncoder().encode(String(value))
    return concatBytes(littleEndian(BigInt(bytes.length), 4, false), bytes)
  }
  if (field.kind === 'bool') return Uint8Array.of(value === true || value === 'true' ? 1 : 0)
  if (field.kind === 'pubkey') return decodeBase58(String(value))
  if (field.kind === 'bytes') return encodeFixedBytes(String(value), field.arrayLength ?? 0)
  if (field.kind === 'integer') {
    const raw = String(value).trim()
    if (!/^-?\d+$/.test(raw)) throw new Error(field.name + ' must be an integer.')
    return littleEndian(BigInt(raw), (field.bits ?? 64) / 8, Boolean(field.signed))
  }
  throw new Error('Cannot encode unsupported field ' + field.name + ': ' + field.rustType)
}

export function encodeRustOperation(
  operation: RustInteractionOperation,
  values: Record<string, string | boolean>,
): Uint8Array {
  if (!operation.supported) throw new Error(operation.unsupportedReason || 'Instruction cannot be encoded.')
  if (operation.variantIndex < 0 || operation.variantIndex > 255) throw new Error('Borsh enum variant index must fit in one byte.')
  return concatBytes(
    Uint8Array.of(operation.variantIndex),
    ...operation.fields.map((field) => encodeField(field, values[field.name] ?? '')),
  )
}

export function encodeRawInstruction(value: string, encoding: 'utf8' | 'hex'): Uint8Array {
  if (encoding === 'utf8') return new TextEncoder().encode(value)
  const compact = value.replace(/\s+/g, '')
  if (!compact) return new Uint8Array()
  if (!/^[0-9a-fA-F]+$/.test(compact) || compact.length % 2 !== 0) {
    throw new Error('Raw hex instruction data must contain complete hexadecimal bytes.')
  }
  return Uint8Array.from(
    Array.from({ length: compact.length / 2 }, (_, index) => Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16)),
  )
}

export interface RawAccountMeta {
  address: string
  isSigner: boolean
  isWritable: boolean
}

export function parseRawAccountMetas(value: string): RawAccountMeta[] {
  const rows = value.split(/\r?\n/).map((row) => row.trim()).filter(Boolean)
  return rows.map((row, index) => {
    const [address = '', signer = 'false', writable = 'false'] = row.split(',').map((part) => part.trim())
    if (!address) throw new Error('Raw account row ' + String(index + 1) + ' is missing an address.')
    decodeBase58(address)
    const truthy = (input: string) => ['1', 'true', 'yes', 'signer', 'writable'].includes(input.toLowerCase())
    return { address, isSigner: truthy(signer), isWritable: truthy(writable) }
  })
}
