#pragma once
/**
 * @brief AEKO Blake3 system call
 */

#include <aeko/types.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Length of a Blake3 hash result
 */
#define BLAKE3_RESULT_LENGTH 32

/**
 * Blake3
 *
 * @param bytes Array of byte arrays
 * @param bytes_len Number of byte arrays
 * @param result 32 byte array to hold the result
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/blake3.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
uint64_t aeko_blake3(const AekoBytes *, int, const uint8_t *);
#else
typedef uint64_t(*aeko_blake3_pointer_type)(const AekoBytes *, int, const uint8_t *);
static uint64_t aeko_blake3(const AekoBytes * arg1, int arg2, const uint8_t * arg3) {
  aeko_blake3_pointer_type aeko_blake3_pointer = (aeko_blake3_pointer_type) 390877474;
  return aeko_blake3_pointer(arg1, arg2, arg3);
}
#endif

#ifdef __cplusplus
}
#endif

/**@}*/

