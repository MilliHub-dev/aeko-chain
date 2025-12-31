# Content Layer

AEKO Chain stores content efficiently using a hybrid On-Chain/Off-Chain model.

## Storage Strategy

| Data Type | Storage Location | Cost | Persistence |
| :--- | :--- | :--- | :--- |
| **Post Text** (< 280 chars) | On-Chain (Compressed NFT) | Low | Permanent |
| **Images / Video** | IPFS / Arweave | Low | Permanent |
| **Comments** | On-Chain (Event Logs) | Very Low | Ephemeral (Indexed by nodes) |

## Content Addressing
All content is referenced by a Content ID (CID).
*   Format: `ipfs://<CID>` or `arweave://<TX_ID>`

## Moderation
The **Content Signature Layer** allows the Citizen House to flag illegal content.
*   Flagged content CIDs are added to a "Deny List" in the client, but the data remains on the blockchain (censorship resistance at the protocol level, moderation at the client level).
