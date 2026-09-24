# AEKO native-program lifecycle

AEKO Protocol is a mandatory network capability. New genesis creation activates the AEKO token and permission runtime feature accounts automatically, and the `protocol-bootstrap` service runs idempotently on every deployment. Operators do not enable or disable AEKO Protocol with deployment environment variables.

## Normal deployment

A normal redeploy preserves the validator ledger, chain keys, `social-state`, `protocol-state`, `protocol-continuity`, and Explorer PostgreSQL. The protocol bootstrap verifies the existing registry and continuity anchor and reuses the canonical on-chain accounts.

On a first genesis, no protocol registry exists. The shared key preflight creates the protocol authority, the genesis contains the mandatory AEKO runtime features, and protocol bootstrap creates the canonical protocol state. No `AEKO_PROTOCOL_BOOTSTRAP_ENABLED`, `AEKO_ALLOW_PROTOCOL_AUTHORITY_GENERATION`, `AEKO_REQUIRE_EXISTING_PROTOCOL_STATE`, or `AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION` setting is required.

## Intentional chain reset

`AEKO_RESET_LEDGER=1` is destructive. It creates a new genesis and therefore a new blockchain identity. The reset is propagated to SocialFi bootstrap, protocol bootstrap, and Explorer. SocialFi/protocol persisted state is cleared once for the new genesis, and Explorer drops and recreates its PostgreSQL `public` schema when the database is bound to a different or unknown genesis.

The validator records a reset marker in the ledger so leaving `AEKO_RESET_LEDGER=1` in place cannot repeatedly wipe the same reset genesis on container restart. Return the variable to `0` after the reset is accepted.

## Recovery controls

Disaster-recovery controls remain implemented inside the bootstrap binary for deliberate manual recovery, but they are not part of the normal Compose environment. A missing protocol registry with a surviving continuity anchor still fails closed unless an operator explicitly authorizes missing-state recovery. A missing continuity anchor with an established registry also fails closed unless deliberate anchor recovery is requested.

## Historical-chain compatibility

The runtime feature gates and `scripts/activate-aeko-protocol-features.sh` remain only for a history-preserving migration of a legacy chain whose genesis predates the AEKO protocol builtins. They are not part of a fresh deployment or a reset-to-genesis deployment.

If preserving such a legacy chain is required, do not reset the ledger or Explorer PostgreSQL. Use the activation helper with the original offline feature-authority keypairs, wait for the epoch activation boundary, and then let the normal idempotent protocol bootstrap establish canonical state.

## Acceptance

Verify the live protocol registry and state:

```bash
curl -s https://api.aeko.online/registry/protocol
curl -s https://api.aeko.online/protocol/status

AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-protocol.py
```

Both Explorer responses must report complete protocol state, all eleven native program accounts must be executable, and the canonical state/custody accounts must match the generated registry.
