# Post Signature Flow

This document details the lifecycle of a social media post on AEKO Chain.

## Step-by-Step

1.  **User Drafts Post**: User writes "Hello World" and attaches an image.
2.  **Upload Media**: The image is uploaded to IPFS.
    *   *Result*: `QmHash123...`
3.  **Create Metadata**: The app creates a JSON object:
    ```json
    {
      "content": "Hello World",
      "media": "ipfs://QmHash123...",
      "timestamp": 1700000000
    }
    ```
4.  **Hash**: The app calculates the SHA-256 hash of the JSON.
5.  **Sign**: The user signs the hash with their Wallet Private Key.
6.  **Submit**: The app sends a `MintCompressedNFT` transaction to AEKO Chain containing the hash and signature.
7.  **Verify**: Validators verify the signature and store the hash in the Merkle Tree.

## Result
The post is now **Immutable** and **Verifiable**. Anyone can check the chain to prove *who* posted it and *when*, and that it hasn't been edited.
