#pragma once
/**
 * @brief AEKO return data system calls
**/

#include <aeko/types.h>
#include <aeko/pubkey.h>

#ifdef __cplusplus
extern "C"
{
#endif

/**
 * Maximum size of return data
 */
#define MAX_RETURN_DATA 1024

/**
 * Set the return data
 *
 * @param bytes byte array to set
 * @param bytes_len length of byte array. This may not exceed MAX_RETURN_DATA.
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/return_data.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
void aeko_set_return_data(const uint8_t *, uint64_t);
#else
typedef void(*aeko_set_return_data_pointer_type)(const uint8_t *, uint64_t);
static void aeko_set_return_data(const uint8_t * arg1, uint64_t arg2) {
  aeko_set_return_data_pointer_type aeko_set_return_data_pointer = (aeko_set_return_data_pointer_type) 2720453611;
  aeko_set_return_data_pointer(arg1, arg2);
}
#endif

/**
 * Get the return data
 *
 * @param bytes byte buffer
 * @param bytes_len maximum length of buffer
 * @param program_id the program_id which set the return data. Only set if there was some return data (the function returns non-zero).
 * @param result length of return data (may exceed bytes_len if the return data is longer)
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/return_data.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
uint64_t aeko_get_return_data(uint8_t *, uint64_t, AekoPubkey *);
#else
typedef uint64_t(*aeko_get_return_data_pointer_type)(uint8_t *, uint64_t, AekoPubkey *);
static uint64_t aeko_get_return_data(uint8_t * arg1, uint64_t arg2, AekoPubkey * arg3) {
  aeko_get_return_data_pointer_type aeko_get_return_data_pointer = (aeko_get_return_data_pointer_type) 1562527204;
  return aeko_get_return_data_pointer(arg1, arg2, arg3);
}
#endif

#ifdef __cplusplus
}
#endif

/**@}*/

