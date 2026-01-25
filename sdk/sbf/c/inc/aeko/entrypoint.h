#pragma once
/**
 * @brief AEKO program entrypoint
 */

#include <aeko/constants.h>
#include <aeko/types.h>
#include <aeko/pubkey.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Keyed Account
 */
typedef struct {
  AekoPubkey *key;      /** Public key of the account */
  uint64_t *lamports;  /** Number of lamports owned by this account */
  uint64_t data_len;   /** Length of data in bytes */
  uint8_t *data;       /** On-chain data within this account */
  AekoPubkey *owner;    /** Program that owns this account */
  uint64_t rent_epoch; /** The epoch at which this account will next owe rent */
  bool is_signer;      /** Transaction was signed by this account's key? */
  bool is_writable;    /** Is the account writable? */
  bool executable;     /** This account's data contains a loaded program (and is now read-only) */
} AekoAccountInfo;

/**
 * Structure that the program's entrypoint input data is deserialized into.
 */
typedef struct {
  AekoAccountInfo* ka; /** Pointer to an array of AekoAccountInfo, must already
                          point to an array of AekoAccountInfos */
  uint64_t ka_num; /** Number of AekoAccountInfo entries in `ka` */
  const uint8_t *data; /** pointer to the instruction data */
  uint64_t data_len; /** Length in bytes of the instruction data */
  const AekoPubkey *program_id; /** program_id of the currently executing program */
} AekoParameters;

/**
 * Program instruction entrypoint
 *
 * @param input Buffer of serialized input parameters.  Use aeko_deserialize() to decode
 * @return 0 if the instruction executed successfully
 */
uint64_t entrypoint(const uint8_t *input);

#ifdef __cplusplus
}
#endif

/**@}*/

