use {
    aeko_faucet::faucet::{request_airdrop_transaction, run_local_faucet},
    aeko_sdk::{
        hash::Hash,
        message::Message,
        signature::{Keypair, Signer},
        system_instruction,
        transaction::Transaction,
    },
};

#[test]
fn test_same_airdrop_intent_produces_same_signed_transaction() {
    let keypair = Keypair::new();
    let to = aeko_sdk::pubkey::new_rand();
    let lamports = 50;
    let blockhash = Hash::new_unique();
    let faucet_addr = run_local_faucet(keypair, None);

    let first = request_airdrop_transaction(&faucet_addr, &to, lamports, blockhash).unwrap();
    let replay = request_airdrop_transaction(&faucet_addr, &to, lamports, blockhash).unwrap();

    assert_eq!(first, replay);
    assert_eq!(first.signatures, replay.signatures);
    assert_eq!(first.message.recent_blockhash, blockhash);
}

#[test]
fn test_local_faucet() {
    let keypair = Keypair::new();
    let to = aeko_sdk::pubkey::new_rand();
    let lamports = 50;
    let blockhash = Hash::new(to.as_ref());
    let create_instruction = system_instruction::transfer(&keypair.pubkey(), &to, lamports);
    let message = Message::new(&[create_instruction], Some(&keypair.pubkey()));
    let expected_tx = Transaction::new(&[&keypair], message, blockhash);

    let faucet_addr = run_local_faucet(keypair, None);

    let result = request_airdrop_transaction(&faucet_addr, &to, lamports, blockhash);
    assert_eq!(expected_tx, result.unwrap());
}

