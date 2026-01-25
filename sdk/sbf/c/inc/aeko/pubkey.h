#pragma once
/**
 * @brief AEKO Public key
 */

#include <aeko/types.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Size of Public key in bytes
 */
#define SIZE_PUBKEY 32

/**
 * Public key
 */
typedef struct {
  uint8_t x[SIZE_PUBKEY];
} AekoPubkey;

/**
 * Prints the hexadecimal representation of a public key
 *
 * @param key The public key to print
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/pubkey.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
void aeko_log_pubkey(const AekoPubkey *);
#else
typedef void(*aeko_log_pubkey_pointer_type)(const AekoPubkey *);
static void aeko_log_pubkey(const AekoPubkey * arg1) {
  aeko_log_pubkey_pointer_type aeko_log_pubkey_pointer = (aeko_log_pubkey_pointer_type) 2129692874;
  aeko_log_pubkey_pointer(arg1);
}
#endif

/**
 * Compares two public keys
 *
 * @param one First public key
 * @param two Second public key
 * @return true if the same
 */
static bool AekoPubkey_same(const AekoPubkey *one, const AekoPubkey *two) {
  for (int i = 0; i < sizeof(*one); i++) {
    if (one->x[i] != two->x[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Seed used to create a program address or passed to aeko_invoke_signed
 */
typedef struct {
  const uint8_t *addr; /** Seed bytes */
  uint64_t len; /** Length of the seed bytes */
} SolSignerSeed;

/**
 * Seeds used by a signer to create a program address or passed to
 * aeko_invoke_signed
 */
typedef struct {
  const SolSignerSeed *addr; /** An array of a signer's seeds */
  uint64_t len; /** Number of seeds */
} SolSignerSeeds;

/**
 * Create a program address
 *
 * @param seeds Seed bytes used to sign program accounts
 * @param seeds_len Length of the seeds array
 * @param program_id Program id of the signer
 * @param program_address Program address created, filled on return
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/pubkey.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
uint64_t aeko_create_program_address(const SolSignerSeed *, int, const AekoPubkey *, AekoPubkey *);
#else
typedef uint64_t(*aeko_create_program_address_pointer_type)(const SolSignerSeed *, int, const AekoPubkey *, AekoPubkey *);
static uint64_t aeko_create_program_address(const SolSignerSeed * arg1, int arg2, const AekoPubkey * arg3, AekoPubkey * arg4) {
  aeko_create_program_address_pointer_type aeko_create_program_address_pointer = (aeko_create_program_address_pointer_type) 2474062396;
  return aeko_create_program_address_pointer(arg1, arg2, arg3, arg4);
}
#endif

/**
 * Try to find a program address and return corresponding bump seed
 *
 * @param seeds Seed bytes used to sign program accounts
 * @param seeds_len Length of the seeds array
 * @param program_id Program id of the signer
 * @param program_address Program address created, filled on return
 * @param bump_seed Bump seed required to create a valid program address
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/pubkey.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
uint64_t aeko_try_find_program_address(const SolSignerSeed *, int, const AekoPubkey *, AekoPubkey *, uint8_t *);
#else
typedef uint64_t(*aeko_try_find_program_address_pointer_type)(const SolSignerSeed *, int, const AekoPubkey *, AekoPubkey *, uint8_t *);
static uint64_t aeko_try_find_program_address(const SolSignerSeed * arg1, int arg2, const AekoPubkey * arg3, AekoPubkey * arg4, uint8_t * arg5) {
  aeko_try_find_program_address_pointer_type aeko_try_find_program_address_pointer = (aeko_try_find_program_address_pointer_type) 1213221432;
  return aeko_try_find_program_address_pointer(arg1, arg2, arg3, arg4, arg5);
}
#endif

#ifdef aeko_TEST
/**
 * Stub functions when building tests
 */
#include <stdio.h>

void aeko_log_pubkey(
  const AekoPubkey *pubkey
) {
  printf("Program log: ");
  for (int i = 0; i < SIZE_PUBKEY; i++) {
    printf("%02 ", pubkey->x[i]);
  }
  printf("\n");
}

#endif

#ifdef __cplusplus
}
#endif

/**@}*/

