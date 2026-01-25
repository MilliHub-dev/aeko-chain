#pragma once
/**
 * @brief AEKO Last Restart Slot system call
 */

#include <aeko/types.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Get Last Restart Slot
 */
/* DO NOT MODIFY THIS GENERATED FILE. INSTEAD CHANGE sdk/sbf/c/inc/sol/inc/last_restart_slot.inc AND RUN `cargo run --bin gen-headers` */
#ifndef aeko_SBFV2
u64 aeko_get_last_restart_slot(uint8_t *result);
#else
typedef u64(*aeko_get_last_restart_slot_pointer_type)(uint8_t *result);
static u64 aeko_get_last_restart_slot(uint8_t *result arg1) {
  aeko_get_last_restart_slot_pointer_type aeko_get_last_restart_slot_pointer = (aeko_get_last_restart_slot_pointer_type) 411697201;
  return aeko_get_last_restart_slot_pointer(arg1);
}
#endif

#ifdef __cplusplus
}
#endif

/**@}*/

