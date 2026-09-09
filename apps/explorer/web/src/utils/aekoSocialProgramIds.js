const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;

  const digits = [0];
  for (let index = zeros; index < bytes.length; index += 1) {
    let carry = bytes[index];
    for (let digit = 0; digit < digits.length; digit += 1) {
      const value = digits[digit] * 256 + carry;
      digits[digit] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  return `${'1'.repeat(zeros)}${digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join('')}`;
}

function programId(fill) {
  return encodeBase58(new Uint8Array(32).fill(fill));
}

// Canonical native Social builtin IDs. Keep these byte-fill values aligned
// with programs/social-*/src/lib.rs and runtime/src/builtins.rs.
export const SOCIAL_REWARDS_PROGRAM_ID = programId(13);
export const SOCIAL_STAKING_PROGRAM_ID = programId(14);
export const SOCIAL_MONETIZATION_PROGRAM_ID = programId(15);
export const SOCIAL_ANTI_SPAM_PROGRAM_ID = programId(16);
export const SOCIAL_POSTS_PROGRAM_ID = programId(17);
