#![allow(clippy::arithmetic_side_effects)]
use {
    aeko_cli::cli::{process_command, CliCommand, CliConfig},
    aeko_faucet::faucet::run_local_faucet,
    aeko_rpc_client::rpc_client::RpcClient,
    aeko_sdk::{
        commitment_config::CommitmentConfig,
        native_token::aeko_to_lamports,
        signature::{Keypair, Signer},
    },
    aeko_streamer::socket::SocketAddrSpace,
    aeko_test_validator::TestValidator,
};

#[test]
fn test_cli_request_airdrop() {
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let faucet_addr = run_local_faucet(mint_keypair, None);
    let test_validator =
        TestValidator::with_no_fees(mint_pubkey, Some(faucet_addr), SocketAddrSpace::Unspecified);

    let mut bob_config = CliConfig::recent_for_tests();
    bob_config.json_rpc_url = test_validator.rpc_url();
    bob_config.command = CliCommand::Airdrop {
        pubkey: None,
        lamports: aeko_to_lamports(50.0),
    };
    let keypair = Keypair::new();
    bob_config.signers = vec![&keypair];

    let sig_response = process_command(&bob_config);
    sig_response.unwrap();

    let rpc_client =
        RpcClient::new_with_commitment(test_validator.rpc_url(), CommitmentConfig::processed());

    let balance = rpc_client
        .get_balance(&bob_config.signers[0].pubkey())
        .unwrap();
    assert_eq!(balance, aeko_to_lamports(50.0));
}

#[test]
fn test_cli_request_grant_direct_rpc() {
    // Grant mirrors airdrop at the RPC/faucet layer: same signing intent,
    // instant dispatch once submitted (approval is enforced above RPC by the
    // Explorer queue for public flows; direct RPC grants carry the credential).
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let faucet_addr = run_local_faucet(mint_keypair, None);
    let test_validator =
        TestValidator::with_no_fees(mint_pubkey, Some(faucet_addr), SocketAddrSpace::Unspecified);

    let mut bob_config = CliConfig::recent_for_tests();
    bob_config.json_rpc_url = test_validator.rpc_url();
    bob_config.command = CliCommand::Grant {
        pubkey: None,
        lamports: aeko_to_lamports(25.0),
        funding_authorization: None,
    };
    let keypair = Keypair::new();
    bob_config.signers = vec![&keypair];

    let sig_response = process_command(&bob_config);
    sig_response.unwrap();

    let rpc_client =
        RpcClient::new_with_commitment(test_validator.rpc_url(), CommitmentConfig::processed());

    let balance = rpc_client
        .get_balance(&bob_config.signers[0].pubkey())
        .unwrap();
    assert_eq!(balance, aeko_to_lamports(25.0));
}
