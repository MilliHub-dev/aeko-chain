#pragma once
/**
 * @brief AEKO logging utilities
 */

#include <aeko/types.h>
#include <aeko/string.h>
#include <aeko/entrypoint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Prints a string to stdout
 */
@SYSCALL void aeko_log_(const char *, uint64_t);
#define aeko_log(message) aeko_log_(message, aeko_strlen(message))

/**
 * Prints a 64 bit values represented in hexadecimal to stdout
 */
@SYSCALL void aeko_log_64_(uint64_t, uint64_t, uint64_t, uint64_t, uint64_t);
#define aeko_log_64 aeko_log_64_

/**
 * Prints the current compute unit consumption to stdout
 */
@SYSCALL void aeko_log_compute_units_();
#define aeko_log_compute_units() aeko_log_compute_units_()

/**
 * Prints the hexadecimal representation of an array
 *
 * @param array The array to print
 */
static void aeko_log_array(const uint8_t *array, int len) {
  for (int j = 0; j < len; j++) {
    aeko_log_64(0, 0, 0, j, array[j]);
  }
}

/**
 * Print the base64 representation of some arrays.
 */
@SYSCALL void aeko_log_data(AekoBytes *, uint64_t);

/**
 * Prints the program's input parameters
 *
 * @param params Pointer to a AekoParameters structure
 */
static void aeko_log_params(const AekoParameters *params) {
  aeko_log("- Program identifier:");
  aeko_log_pubkey(params->program_id);

  aeko_log("- Number of KeyedAccounts");
  aeko_log_64(0, 0, 0, 0, params->ka_num);
  for (int i = 0; i < params->ka_num; i++) {
    aeko_log("  - Is signer");
    aeko_log_64(0, 0, 0, 0, params->ka[i].is_signer);
    aeko_log("  - Is writable");
    aeko_log_64(0, 0, 0, 0, params->ka[i].is_writable);
    aeko_log("  - Key");
    aeko_log_pubkey(params->ka[i].key);
    aeko_log("  - lamports");
    aeko_log_64(0, 0, 0, 0, *params->ka[i].lamports);
    aeko_log("  - data");
    aeko_log_array(params->ka[i].data, params->ka[i].data_len);
    aeko_log("  - Owner");
    aeko_log_pubkey(params->ka[i].owner);
    aeko_log("  - Executable");
    aeko_log_64(0, 0, 0, 0, params->ka[i].executable);
    aeko_log("  - Rent Epoch");
    aeko_log_64(0, 0, 0, 0, params->ka[i].rent_epoch);
  }
  aeko_log("- Instruction data\0");
  aeko_log_array(params->data, params->data_len);
}

#ifdef aeko_TEST
/**
 * Stub functions when building tests
 */
#include <stdio.h>

void aeko_log_(const char *s, uint64_t len) {
  printf("Program log: %s\n", s);
}
void aeko_log_64(uint64_t arg1, uint64_t arg2, uint64_t arg3, uint64_t arg4, uint64_t arg5) {
  printf("Program log: %llu, %llu, %llu, %llu, %llu\n", arg1, arg2, arg3, arg4, arg5);
}

void aeko_log_compute_units_() {
  printf("Program consumption: __ units remaining\n");
}
#endif

#ifdef __cplusplus
}
#endif

/**@}*/

