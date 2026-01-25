#pragma once
/**
 * @brief AEKO sha system call
 */

#include <aeko/types.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Length of a sha256 hash result
 */
#define SHA256_RESULT_LENGTH 32

/**
 * Sha256
 *
 * @param bytes Array of byte arrays
 * @param bytes_len Number of byte arrays
 * @param result 32 byte array to hold the result
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/sha.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
uint64_t aeko_sha256(const AekoBytes *, int, uint8_t *);
#else
typedef uint64_t(*aeko_sha256_pointer_type)(const AekoBytes *, int, uint8_t *);
static uint64_t aeko_sha256(const AekoBytes * arg1, int arg2, uint8_t * arg3) {
  aeko_sha256_pointer_type aeko_sha256_pointer = (aeko_sha256_pointer_type) 301243782;
  return aeko_sha256_pointer(arg1, arg2, arg3);
}
#endif

#ifdef __cplusplus
}
#endif

/**@}*/

