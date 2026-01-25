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
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/compute_units.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
uint64_t aeko_remaining_compute_units();
#else
typedef uint64_t(*aeko_remaining_compute_units_pointer_type)();
static uint64_t aeko_remaining_compute_units() {
  aeko_remaining_compute_units_pointer_type aeko_remaining_compute_units_pointer = (aeko_remaining_compute_units_pointer_type) 3991886574;
  return aeko_remaining_compute_units_pointer();
}
#endif

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

