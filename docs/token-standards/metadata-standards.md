# Metadata Standards

To ensure your tokens and NFTs display correctly in the Aeko Social App and Explorer, you must follow the **AEKO Metadata Standard** (based on Metaplex).

## JSON Structure

The `uri` field in your token should point to a JSON file (hosted on IPFS/Arweave) with this structure:

```json
{
  "name": "My Social Token",
  "symbol": "MST",
  "description": "The official token of the Cool Cats community.",
  "image": "https://arweave.net/image-hash.png",
  "external_url": "https://coolcats.com",
  "attributes": [
    {
      "trait_type": "Tier",
      "value": "Gold"
    },
    {
      "trait_type": "Access Level",
      "value": 5
    }
  ],
  "properties": {
    "files": [
      {
        "uri": "https://arweave.net/image-hash.png",
        "type": "image/png"
      }
    ],
    "category": "image"
  }
}
```

## Special Types for SocialFi

For social posts, we recommend adding a `content_type` attribute:

*   `post`: Standard text post.
*   `video`: Short form video.
*   `article`: Long form text.
