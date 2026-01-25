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
@SYSCALL uint64_t aeko_remaining_compute_units();

#ifdef aeko_TEST
/**
 * Stub functions when building tests
 */

uint64_t aeko_remaining_compute_units() {
  return UINT64_MAX;
}
#endif

#ifdef __cplusplus
}
#endif

/**@}*/

