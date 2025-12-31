# Rust SDK (Smart Contracts)

To write high-performance programs for AEKO Chain, use the Rust SDK.

## Project Structure

A typical AEKO program looks like this:

```rust
use aeko_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    msg,
};

// Declare the entry point
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    
    msg!("Hello AEKO Chain!");
    
    // Logic goes here...
    
    Ok(())
}
```

## Building and Deploying

1.  **Build**:
    ```bash
    cargo build-bpf
    ```

2.  **Deploy**:
    ```bash
    aeko program deploy target/deploy/my_program.so
    ```
