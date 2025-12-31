# Node Types

To participate in the AEKO Chain network, you can run different types of nodes depending on your hardware and intent.

## 1. Validator Node
*   **Role**: Produce blocks, vote on consensus, secure the network.
*   **Incentive**: Block rewards (AEKO inflation) + Transaction fees.
*   **Requirements**: High-end CPU (12+ cores), 128GB+ RAM, NVMe SSDs, 1Gbps+ Network.
*   **Risk**: Slashing (loss of stake) for malicious behavior (double signing).

## 2. RPC Node (Remote Procedure Call)
*   **Role**: Serve data to applications (Aeko Social, dApps, Wallets). They act as the gateway for users to read state and submit transactions.
*   **Incentive**: Often run by dApp developers or infrastructure providers (paid services).
*   **Requirements**: Similar to Validators but heavier on RAM/Storage for indexing historical data.

## 3. Archiver Node (History)
*   **Role**: Store the full history of the ledger (Terabytes of data). Validators offload old blocks to Archivers to keep their storage light.
*   **Incentive**: Storage fees (Proof-of-Replication).

## 4. Content Verifier Node (Specialized)
*   **Role**: A lightweight node specifically designed to verify off-chain media integrity. They listen for `ContentHash` events and check if the IPFS/Arweave link actually matches the hash.
*   **Incentive**: Specialized "Oracle" fees for content verification services.
