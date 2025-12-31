# Validator Guide

This guide covers setting up a Validator Node on the AEKO Chain Testnet/Mainnet.

## Hardware Requirements

| Component | Minimum Spec | Recommended Spec |
| :--- | :--- | :--- |
| **CPU** | 12 Cores / 24 Threads (2.8GHz+) | 16 Cores / 32 Threads (AMD Threadripper / EPYC) |
| **RAM** | 128 GB | 256 GB ECC |
| **Disk** | 2x 1TB NVMe SSD (PCIe Gen4) | 2x 2TB NVMe SSD (RAID 0) |
| **Network** | 1 Gbps Symmetric | 10 Gbps Symmetric |
| **GPU** | Optional (for PoH offloading) | CUDA-enabled (NVIDIA) |

## Software Prerequisites
*   Ubuntu 20.04 / 22.04 LTS
*   Rust (latest stable)
*   AEKO CLI Tools

## Installation Steps

### 1. Install AEKO CLI
```bash
sh -c "$(curl -sSfL https://release.aeko.chain/install)"
```

### 2. Generate Identity
```bash
aeko-keygen new -o validator-keypair.json
```

### 3. Tune System
You must optimize your Linux kernel for high-throughput networking (UDP buffers, file descriptors).
```bash
sudo aeko-sys-tuner --user aeko
```

### 4. Start the Validator
```bash
aeko-validator \
  --identity validator-keypair.json \
  --vote-account vote-account-keypair.json \
  --rpc-port 8899 \
  --entrypoint entrypoint.testnet.aeko.chain:8001 \
  --limit-ledger-size 50000000 \
  --log -
```

## Monitoring
Monitor your node using `aeko-gossip` and `aeko-validators` commands to ensure you are catching up to the cluster and voting successfully.
