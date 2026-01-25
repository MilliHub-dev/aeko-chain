#pragma once
/**
 * @brief AEKO poseidon system call
**/

#include <aeko/types.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Length of a Poseidon hash result
 */
#define POSEIDON_RESULT_LENGTH 32

/**
 * Configuration using the Barreto–Naehrig curve with an embedding degree of
 * 12, defined over a 254-bit prime field.
 *
 * Configuration Details:
 * - S-Box: x^5
 * - Width: 2 <= t <= 13
 * - Inputs: 1 <= n <= 12
 * - Full rounds: 8
 * - Partial rounds: Depending on width: [56, 57, 56, 60, 60, 63, 64, 63,
 *   60, 66, 60, 65]
 */
#define POSEIDON_PARAMETERS_BN254_X5 0

/**
 * Big-endian inputs and output
 */
#define POSEIDON_ENDIANNESS_BIG_ENDIAN 0

/**
 * Little-endian inputs and output
 */
#define POSEIDON_ENDIANNESS_LITTLE_ENDIAN 1

/**
 * Poseidon
 *
 * @param parameters Configuration parameters for the hash function
 * @param endianness Endianness of inputs and result
 * @param bytes Array of byte arrays
 * @param bytes_len Number of byte arrays
 * @param result 32 byte array to hold the result
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/poseidon.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
uint64_t aeko_poseidon(
  const uint64_t parameters,
  const uint64_t endianness,
  const AekoBytes *bytes,
  const uint64_t bytes_len,
  uint8_t *result
);
#else
typedef uint64_t(*aeko_poseidon_pointer_type)(
  const uint64_t parameters,
  const uint64_t endianness,
  const AekoBytes *bytes,
  const uint64_t bytes_len,
  uint8_t *result
);
static uint64_t aeko_poseidon(
  const uint64_t parameters arg1,
  const uint64_t endianness arg2,
  const AekoBytes *bytes arg3,
  const uint64_t bytes_len arg4,
  uint8_t *result
 arg5) {
  aeko_poseidon_pointer_type aeko_poseidon_pointer = (aeko_poseidon_pointer_type) 3298065441;
  return aeko_poseidon_pointer(arg1, arg2, arg3, arg4, arg5);
}
#endif

#ifdef __cplusplus
}
#endif

/**@}*/

