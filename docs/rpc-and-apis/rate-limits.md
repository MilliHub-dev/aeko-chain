# Rate Limits and Access Tiers

This document defines the intended rate-limit and access model for AEKO RPC, WebSocket, and explorer-facing APIs in Phase 5.

These limits should be treated as deployment defaults, not hardcoded protocol law.

## Goals

- keep public infrastructure usable under load
- make abuse expensive and visible
- give developers a clear upgrade path
- support permissioned and regulated deployments
- allow AEKO Social and partner apps to operate with predictable throughput

## Access Tiers

### Public Tier

For anonymous or lightly identified public usage.

Suggested defaults:

| Limit | Value |
| --- | --- |
| HTTP requests / second / IP | 20 |
| WebSocket connections / IP | 3 |
| Daily request quota / IP | 100,000 |
| Burst policy | short burst, then throttle |

Expected capabilities:

- public RPC reads
- standard transaction submission
- public explorer APIs
- basic websocket subscriptions

### Developer Tier

For registered builders, SDK users, and app integrators.

Suggested defaults:

| Limit | Value |
| --- | --- |
| HTTP requests / second | 100 |
| WebSocket connections | 10 |
| Daily quota | higher than public |
| Priority | yes |

Expected capabilities:

- higher RPC throughput
- broader websocket use
- improved support for app backends and testing

### Partner / Validator Tier

For validators, enterprise deployments, backend services, and internal infrastructure.

Expected capabilities:

- very high throughput or negotiated limits
- internal or private RPC access
- privileged or permissioned channels where policy allows
- custom SLA and routing rules

## Enforcement Dimensions

Rate limits should be enforceable by several dimensions depending on the endpoint:

- IP address
- wallet address
- API key or service token
- origin or domain for approved browser apps
- authenticated partner identity

No single dimension is sufficient for every environment.

## Abuse Prevention

Phase 5 infrastructure should support:

- IP throttling
- signature verification before costly processing where feasible
- wallet-level abuse scoring
- endpoint-specific cooldowns
- domain allowlisting for approved applications if policy requires it
- permission checks for restricted endpoints

SocialFi-specific protections should align with [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md), especially:

- engagement proof spam control
- posting-rate protection
- stake or reputation gating where enabled

## WebSocket Limits

WebSocket usage should have its own policy rather than inheriting raw HTTP limits.

Suggested controls:

- max open connections per tier
- max active subscriptions per connection
- max subscription creation rate
- idle timeout policy
- heartbeat / ping requirements

## Restricted Endpoints

Some endpoints may require elevated access, especially:

- partner analytics feeds
- moderation or audit feeds
- regulated or permissioned environment endpoints
- write-heavy SocialFi ingestion surfaces

These should return clear authorization failures rather than generic rate-limit errors.

## Error Semantics

Rate-limit failures should be explicit.

Suggested error families:

- `rate_limited`
- `quota_exceeded`
- `tier_upgrade_required`
- `unauthorized`
- `permission_denied`

Where appropriate, responses should include:

- retry-after guidance
- current tier
- whether the failure is temporary or policy-based

## Deployment Notes

- published limits should match actual infrastructure behavior
- web and docs surfaces should not advertise endpoints or tiers that are not really live
- environment-specific deployments may override these defaults, but should document the override clearly
