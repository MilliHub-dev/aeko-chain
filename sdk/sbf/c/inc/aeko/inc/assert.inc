#pragma once
/**
 * @brief AEKO assert and panic utilities
 */

#include <aeko/types.h>

#ifdef __cplusplus
extern "C" {
#endif


/**
 * Panics
 *
 * Prints the line number where the panic occurred and then causes
 * the SBF VM to immediately halt execution. No accounts' data are updated
 */
@SYSCALL void aeko_panic_(const char *, uint64_t, uint64_t, uint64_t);
#define aeko_panic() aeko_panic_(__FILE__, sizeof(__FILE__), __LINE__, 0)

/**
 * Asserts
 */
#define aeko_assert(expr)  \
if (!(expr)) {          \
  aeko_panic(); \
}

#ifdef aeko_TEST
/**
 * Stub functions when building tests
 */
#include <stdio.h>
#include <stdlib.h>

void aeko_panic_(const char *file, uint64_t len, uint64_t line, uint64_t column) {
  printf("Panic in %s at %d:%d\n", file, line, column);
  abort();
}
#endif

#ifdef __cplusplus
}
#endif

/**@}*/

