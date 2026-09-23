# AEKO native-program upgrade runbook

This is the supported history-preserving procedure for adding the protocol-native programs that were introduced after the current public testnet genesis.

## Safety invariant

A validator restoring a historical frozen Bank must not unconditionally insert a native builtin that did not exist when that Bank was frozen. New native program bundles therefore remain dormant until their runtime feature is activated.

The existing five SocialFi builtins remain unconditional because they are already part of the established chain state. The eleven newer native programs are grouped behind two activation boundaries:

| Runtime feature | Public feature ID | Native programs |
| --- | --- | --- |
| `aeko_token_programs_v1` | `Ca5Lhktqd4epk3DDqsp7azXAunK3KZ8ZxeykU81oUUHT` | tokenomics, AEKO-20, public mint, AEKO-721, NFT marketplace |
| `aeko_permission_layer_v1` | `KBq8JBrCEbWJ6S2NXpcBvQDvt7J6hUZW3i61zzzZWxF` | wallet permissions, permission registry, revocation registry, subnet registry, emergency multisig, finality oracle |

The private keypairs corresponding to those two feature IDs are offline activation authorities. They are not stored in Git, Docker images, Compose state, or the validator key directory.

## Before the upgrade

Back up and identify all current state before touching the runtime:

- the validator ledger volume and its exact Docker/Coolify mount identity;
- `/data/aeko/keys` or the equivalent persistent key directory;
- Explorer PostgreSQL;
- `social-state`;
- `protocol-state`, if it already exists;
- `protocol-continuity`, once created, including its canonical keypairs and registry anchor;
- the current genesis hash and a recent finalized slot.

Keep these values disabled:

```text
AEKO_RESET_LEDGER=0
AEKO_REQUIRE_EXISTING_LEDGER=1
AEKO_ALLOW_PROTOCOL_AUTHORITY_GENERATION=0
AEKO_PROTOCOL_BOOTSTRAP_ENABLED=0
AEKO_REQUIRE_EXISTING_PROTOCOL_STATE=1
AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION=0
AEKO_PROTOCOL_CONTINUITY_ALLOW_ANCHOR_RECOVERY=0
AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE=0
```

On Coolify also keep `AEKO_ALLOW_CHAIN_KEY_GENERATION=0` so a missing key mount cannot silently replace the validator/vote/stake/faucet identities.

During Phase 1 compatibility deployment, a brand-new `protocol-authority-keypair.json` is **not required** while `AEKO_PROTOCOL_BOOTSTRAP_ENABLED=0` and no protocol registry/continuity anchor exists. This allows an established chain that predates protocol state to upgrade its validator without manufacturing unrelated protocol identity. Before the intentional first protocol bootstrap in Phase 3, set `AEKO_ALLOW_PROTOCOL_AUTHORITY_GENERATION=1` for the one deployment that creates the authority, back up the resulting key, and immediately return the flag to `0`. Once either `protocol-registry.env` or the independent `protocol-registry.anchor` exists, replacement authority generation is refused even if the flag is set, and the persisted authority key must derive the recorded `AEKO_PROTOCOL_AUTHORITY` public key.

Before deploying, inspect the live validator's `/ledger` mount and confirm `genesis.bin` is present. If a Coolify resource/project rename points Compose at a new empty named volume, the validator will now fail closed because `AEKO_REQUIRE_EXISTING_LEDGER=1`; fix the mount/volume identity instead of disabling the guard.

Do not delete the ledger or clear Explorer PostgreSQL for this upgrade.

## Phase 1: deploy compatibility code only

Deploy the new validator image while both new runtime features are still inactive.

Acceptance before feature activation:

1. the validator restores the existing ledger without the frozen-Bank builtin panic;
2. `getHealth` returns `"ok"`;
3. the genesis hash is unchanged;
4. finalized slots continue from the existing chain and advance;
5. historical transactions remain queryable;
6. `AEKO_PROTOCOL_BOOTSTRAP_ENABLED` is still `0`.

At this point the binary contains the eleven program implementations, but their program accounts have not entered Bank state.

## Phase 2: activate the runtime features

Use the offline feature keypairs and a funded operator fee payer. The repository helper verifies that each private key derives the compile-time public feature ID before it will submit an activation transaction.

```bash
export AEKO_RPC_URL=https://rpc.aeko.online
export AEKO_FEATURE_FEE_PAYER=/secure/operator-fee-payer.json
export AEKO_TOKEN_PROGRAMS_FEATURE_KEYPAIR=/secure/aeko-token-programs-v1-feature.json
export AEKO_PERMISSION_LAYER_FEATURE_KEYPAIR=/secure/aeko-permission-layer-v1-feature.json
export AEKO_FEATURE_CLUSTER=development

./scripts/activate-aeko-protocol-features.sh
```

The underlying CLI command is positional:

```text
aeko --url <RPC> feature activate <FEATURE_KEYPAIR> development
```

Do not substitute the public feature ID for the keypair path. Feature activation requires the feature account itself to sign its system allocation/assignment transaction.

After submission, use `aeko feature status <FEATURE_ID> --display-all`. A submitted feature is initially pending. Wait for both features to become active at the epoch boundary before continuing.

## Phase 3: initialize canonical protocol state

Only after both feature accounts report an activation slot, perform the intentional first protocol bootstrap by setting:

```text
AEKO_PROTOCOL_BOOTSTRAP_ENABLED=1
AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION=1
```

Redeploy the stack or run the one-shot `protocol-bootstrap` service. The service writes `protocol-registry.env` into `protocol-state`. The separately persisted `protocol-continuity` volume stores an exact registry anchor **and the canonical state/custody keypairs**. This keeps canonical addresses stable if the registry/state volume is replaced and makes independent replacement of either volume detectable before replacement canonical addresses can be created.

After the first bootstrap succeeds, immediately return:

```text
AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION=0
```

Normal public redeploys keep `AEKO_REQUIRE_EXISTING_PROTOCOL_STATE=1`. If the registry exists but its continuity anchor is missing, recovery requires `AEKO_PROTOCOL_CONTINUITY_ALLOW_ANCHOR_RECOVERY=1` only after independently verifying the existing registry and on-chain accounts. If the continuity anchor and canonical keypairs exist but the registry/state volume is missing, bootstrap fails closed unless `AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE=1` is deliberately enabled for disaster recovery. Recovery reuses the preserved canonical keypairs, verifies the existing on-chain accounts, and republishes the same registry addresses instead of generating a second canonical set.

The bootstrap first verifies both active runtime features and all eleven executable program accounts, then creates or verifies:

- tokenomics state;
- tokenomics treasury;
- validator-reward account;
- community-reward account;
- a canonical AEKO-20 testnet reference mint;
- public-mint policy state bound to that mint;
- permission-registry configuration;
- revocation-registry configuration;
- subnet-registry configuration;
- emergency-multisig configuration;
- finality-oracle configuration.

The bootstrap writes `protocol-registry.env` into the persistent `protocol-state` volume. Existing matching state is reused. If a completed registry exists but expected state is missing or has the wrong owner/configuration, bootstrap fails closed. `AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE=1` is reserved for deliberate recovery.

Resource-scoped state is not globally bootstrapped. AEKO-20 user mints/accounts, AEKO-721 collections/NFTs, marketplace listings, and per-wallet permission profiles are created by their normal instructions.

## Phase 4: acceptance

Explorer exposes both the generated registry and live RPC verification:

```bash
curl -s https://api.aeko.online/registry/protocol
curl -s https://api.aeko.online/protocol/status
```

Both responses must report `data.complete == true`.

Run the read-only end-to-end check:

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-protocol.py
```

The smoke check proves that the chain advances, both feature accounts are active, all eleven native program accounts are executable, eight canonical state accounts exist under their expected program owners, and the three custody accounts are system-owned zero-data accounts.

## Rollback boundary

Before either feature account is activated, rolling the validator back to the previous compatible binary does not leave new program accounts in Bank state.

After either feature is active, do not roll back to a binary that does not contain and understand that feature/program bundle. Roll forward with a compatible validator instead.

Feature activation is a protocol-state transition, not merely a Docker deployment toggle.

## Key separation

These key classes are intentionally distinct:

- validator identity, vote, stake and faucet keys continue chain/node operation;
- `protocol-authority-keypair.json` controls bootstrap-created protocol configuration and is persisted with operator keys;
- the two feature-authority keypairs are offline one-time activation authorities and should not be copied into the runtime key directory.

Back up the protocol authority after bootstrap. Keep feature-authority private keys in restricted operator storage even after activation for audit provenance; never commit them.

## Governance boundary

There is no dedicated `programs/governance/` implementation in the current repository. Until governance is separately specified, implemented and security-reviewed, tokenomics uses the dedicated protocol authority as its governance authority. This is explicit operator governance, not on-chain governance.

## Bridge boundary

The finality oracle provides on-chain proof material that a future bridge can consume. It is not itself a bridge. The current repository does not contain a production bridge program and relayer protocol, so bridge implementation remains a separate protocol/security project.
