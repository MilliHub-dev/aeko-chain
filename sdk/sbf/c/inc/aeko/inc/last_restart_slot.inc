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
@SYSCALL u64 aeko_get_last_restart_slot(uint8_t *result);

#ifdef __cplusplus
}
#endif

/**@}*/

