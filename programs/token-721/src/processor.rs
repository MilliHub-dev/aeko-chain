use {
    crate::{
        error::Token721Error,
        instruction::Token721Instruction,
        state::{Aeko721Collection, Aeko721Token, NftMetadata},
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey},
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let instruction_data = instruction_context.get_instruction_data();
        let instruction = Token721Instruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            Token721Instruction::InitializeCollection {
                name,
                symbol,
                base_uri,
            } => Self::process_initialize_collection(invoke_context, name, symbol, base_uri),
            Token721Instruction::MintNft {
                token_id,
                owner,
                creator,
                royalty_bps,
                metadata,
            } => Self::process_mint_nft(
                invoke_context,
                token_id,
                owner,
                creator,
                royalty_bps,
                metadata,
            ),
            Token721Instruction::FreezeNft => Self::process_set_frozen(invoke_context, true),
            Token721Instruction::ThawNft => Self::process_set_frozen(invoke_context, false),
            Token721Instruction::TransferNft { new_owner } => {
                Self::process_transfer_nft(invoke_context, new_owner)
            }
            Token721Instruction::UpdateMetadata { metadata } => {
                Self::process_update_metadata(invoke_context, metadata)
            }
        }
    }

    fn process_initialize_collection(
        invoke_context: &mut InvokeContext,
        name: String,
        symbol: String,
        base_uri: Option<String>,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        let mut collection_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *collection_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }

        let collection = Aeko721Collection {
            authority: authority_key,
            name,
            symbol,
            base_uri,
            total_minted: 0,
            is_initialized: true,
        };
        Self::write_borsh_account(&mut collection_account, &collection)
    }

    fn process_mint_nft(
        invoke_context: &mut InvokeContext,
        token_id: u64,
        owner: aeko_sdk::pubkey::Pubkey,
        creator: aeko_sdk::pubkey::Pubkey,
        royalty_bps: u16,
        metadata: crate::state::NftMetadata,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        let collection_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut collection = Aeko721Collection::deserialize_padded(collection_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !collection.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if collection.authority != authority_key {
            return Err(InstructionError::IncorrectAuthority);
        }
        drop(collection_account);

        Self::validate_metadata(&metadata)?;
        Self::validate_royalty(royalty_bps)?;

        let mut token_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if *token_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        if token_account.get_data().iter().any(|byte| *byte != 0)
            && Aeko721Token::deserialize_padded(token_account.get_data())
                .map(|token| token.is_initialized)
                .unwrap_or(false)
        {
            return Err(Self::map_program_error(Token721Error::DuplicateTokenId.into()));
        }

        let token = Aeko721Token {
            collection: *instruction_context
                .try_borrow_instruction_account(transaction_context, 0)?
                .get_key(),
            token_id,
            owner,
            creator,
            royalty_bps,
            metadata,
            frozen: false,
            is_initialized: true,
        };

        collection.total_minted = collection.total_minted.saturating_add(1);
        Self::write_borsh_account(&mut token_account, &token)?;
        drop(token_account);

        let mut collection_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        Self::write_borsh_account(&mut collection_account, &collection)
    }

    fn process_transfer_nft(
        invoke_context: &mut InvokeContext,
        new_owner: Pubkey,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let owner_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let owner_key = *owner_account.get_key();
        if !owner_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(owner_account);

        let mut token_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *token_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let mut token = Aeko721Token::deserialize_padded(token_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !token.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if token.owner != owner_key {
            return Err(Self::map_program_error(Token721Error::InvalidOwner.into()));
        }
        if token.frozen {
            return Err(Self::map_program_error(Token721Error::AccountFrozen.into()));
        }

        token.owner = new_owner;
        Self::write_borsh_account(&mut token_account, &token)
    }

    fn process_set_frozen(
        invoke_context: &mut InvokeContext,
        frozen: bool,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        let mut token_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *token_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let mut token = Aeko721Token::deserialize_padded(token_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !token.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if token.creator != authority_key {
            return Err(Self::map_program_error(Token721Error::InvalidOwner.into()));
        }

        token.frozen = frozen;
        Self::write_borsh_account(&mut token_account, &token)
    }

    fn process_update_metadata(
        invoke_context: &mut InvokeContext,
        metadata: NftMetadata,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        Self::validate_metadata(&metadata)?;

        let mut token_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *token_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let mut token = Aeko721Token::deserialize_padded(token_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !token.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if token.creator != authority_key && token.owner != authority_key {
            return Err(Self::map_program_error(Token721Error::InvalidOwner.into()));
        }
        if token.frozen {
            return Err(Self::map_program_error(Token721Error::AccountFrozen.into()));
        }

        token.metadata = metadata;
        Self::write_borsh_account(&mut token_account, &token)
    }

    fn validate_metadata(metadata: &NftMetadata) -> Result<(), InstructionError> {
        let valid_uri = |value: &str| {
            value.starts_with("https://")
                || value.starts_with("http://")
                || value.starts_with("ipfs://")
                || value.starts_with("ar://")
        };

        if metadata.name.trim().is_empty()
            || metadata.name.len() > 100
            || metadata.uri.trim().is_empty()
            || metadata.uri.len() > 256
            || !valid_uri(&metadata.uri)
        {
            return Err(Self::map_program_error(Token721Error::InvalidMetadata.into()));
        }
        if metadata
            .description
            .as_ref()
            .map(|description| description.len() > 512)
            .unwrap_or(false)
        {
            return Err(Self::map_program_error(Token721Error::InvalidMetadata.into()));
        }
        if metadata
            .image_uri
            .as_ref()
            .map(|image_uri| image_uri.len() > 256 || !valid_uri(image_uri))
            .unwrap_or(false)
        {
            return Err(Self::map_program_error(Token721Error::InvalidMetadata.into()));
        }
        if metadata.attributes.len() > 32
            || metadata
                .attributes
                .iter()
                .any(|attribute| {
                    attribute.trait_type.trim().is_empty()
                        || attribute.value.trim().is_empty()
                        || attribute.trait_type.len() > 64
                        || attribute.value.len() > 128
                })
        {
            return Err(Self::map_program_error(Token721Error::InvalidMetadata.into()));
        }
        Ok(())
    }

    fn validate_royalty(royalty_bps: u16) -> Result<(), InstructionError> {
        if royalty_bps > 10_000 {
            return Err(Self::map_program_error(Token721Error::InvalidRoyalty.into()));
        }
        Ok(())
    }

    fn write_borsh_account<T: borsh::BorshSerialize>(
        account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>,
        value: &T,
    ) -> Result<(), InstructionError> {
        let serialized = to_vec(value).map_err(|_| InstructionError::InvalidAccountData)?;
        if serialized.len() > account.get_data().len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        let data = account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn map_program_error(error: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match error {
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token721Error::InvalidRoyalty as u32 =>
            {
                InstructionError::InvalidArgument
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token721Error::DuplicateTokenId as u32 =>
            {
                InstructionError::AccountAlreadyInitialized
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token721Error::InvalidOwner as u32 =>
            {
                InstructionError::IncorrectAuthority
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token721Error::AccountFrozen as u32 =>
            {
                InstructionError::InvalidArgument
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token721Error::InvalidMetadata as u32 =>
            {
                InstructionError::InvalidInstructionData
            }
            _ => InstructionError::InvalidInstructionData,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use {
        crate::{id, instruction, state::MetadataAttribute, Entrypoint},
        aeko_program_runtime::invoke_context::mock_process_instruction,
        aeko_sdk::{
            account::{AccountSharedData, ReadableAccount, WritableAccount},
            instruction::AccountMeta,
            signature::{Keypair, Signer},
        },
    };

    const ACCOUNT_SPACE: usize = 16_384;

    fn sample_metadata(name: &str, uri: &str) -> NftMetadata {
        NftMetadata {
            name: name.to_string(),
            description: Some("AEKO NFT".to_string()),
            uri: uri.to_string(),
            image_uri: Some("https://cdn.aeko.chain/nft.png".to_string()),
            attributes: vec![MetadataAttribute {
                trait_type: "Tier".to_string(),
                value: "Genesis".to_string(),
            }],
        }
    }

    fn process_instruction(
        instruction_data: &[u8],
        transaction_accounts: Vec<(Pubkey, AccountSharedData)>,
        instruction_accounts: Vec<AccountMeta>,
        expected_result: Result<(), InstructionError>,
    ) -> Vec<AccountSharedData> {
        mock_process_instruction(
            &id(),
            Vec::new(),
            instruction_data,
            transaction_accounts,
            instruction_accounts,
            expected_result,
            Entrypoint::vm,
            |_invoke_context| {},
            |_invoke_context| {},
        )
    }

    #[test]
    fn mint_nft_writes_token_and_updates_collection() {
        let authority = Keypair::new();
        let owner = Pubkey::new_unique();
        let collection_pubkey = Pubkey::new_unique();
        let token_pubkey = Pubkey::new_unique();

        let collection = Aeko721Collection {
            authority: authority.pubkey(),
            name: "AEKO Genesis".to_string(),
            symbol: "AGEN".to_string(),
            base_uri: Some("https://cdn.aeko.chain".to_string()),
            total_minted: 0,
            is_initialized: true,
        };
        let mut collection_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let collection_bytes = to_vec(&collection).unwrap();
        collection_account.data_as_mut_slice()[..collection_bytes.len()]
            .copy_from_slice(&collection_bytes);

        let ix = instruction::mint_nft(
            &id(),
            &collection_pubkey,
            &token_pubkey,
            &authority.pubkey(),
            1,
            owner,
            authority.pubkey(),
            500,
            sample_metadata("Genesis #1", "https://arweave.net/genesis-1"),
        );

        let accounts = process_instruction(
            &ix.data,
            vec![
                (collection_pubkey, collection_account),
                (token_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(collection_pubkey, false),
                AccountMeta::new(token_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
        );

        let updated_collection = Aeko721Collection::deserialize_padded(accounts[0].data()).unwrap();
        let token = Aeko721Token::deserialize_padded(accounts[1].data()).unwrap();
        assert_eq!(updated_collection.total_minted, 1);
        assert_eq!(token.owner, owner);
        assert_eq!(token.royalty_bps, 500);
    }

    #[test]
    fn transfer_nft_updates_owner() {
        let current_owner = Keypair::new();
        let new_owner = Pubkey::new_unique();
        let token_pubkey = Pubkey::new_unique();
        let token = Aeko721Token {
            collection: Pubkey::new_unique(),
            token_id: 7,
            owner: current_owner.pubkey(),
            creator: current_owner.pubkey(),
            royalty_bps: 750,
            metadata: sample_metadata("Creator Pass", "https://ipfs.io/ipfs/creator-pass"),
            frozen: false,
            is_initialized: true,
        };
        let mut token_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let token_bytes = to_vec(&token).unwrap();
        token_account.data_as_mut_slice()[..token_bytes.len()].copy_from_slice(&token_bytes);

        let ix = instruction::transfer_nft(&id(), &token_pubkey, &current_owner.pubkey(), new_owner);
        let accounts = process_instruction(
            &ix.data,
            vec![
                (token_pubkey, token_account),
                (current_owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(token_pubkey, false),
                AccountMeta::new_readonly(current_owner.pubkey(), true),
            ],
            Ok(()),
        );

        let updated = Aeko721Token::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.owner, new_owner);
    }

    #[test]
    fn update_metadata_requires_creator_or_owner() {
        let creator = Keypair::new();
        let outsider = Keypair::new();
        let token_pubkey = Pubkey::new_unique();
        let token = Aeko721Token {
            collection: Pubkey::new_unique(),
            token_id: 9,
            owner: Pubkey::new_unique(),
            creator: creator.pubkey(),
            royalty_bps: 250,
            metadata: sample_metadata("OG Badge", "https://ipfs.io/ipfs/og-badge"),
            frozen: false,
            is_initialized: true,
        };
        let mut token_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let token_bytes = to_vec(&token).unwrap();
        token_account.data_as_mut_slice()[..token_bytes.len()].copy_from_slice(&token_bytes);

        let ix = instruction::update_metadata(
            &id(),
            &token_pubkey,
            &outsider.pubkey(),
            sample_metadata("Updated Badge", "https://arweave.net/updated-badge"),
        );
        process_instruction(
            &ix.data,
            vec![
                (token_pubkey, token_account),
                (outsider.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(token_pubkey, false),
                AccountMeta::new_readonly(outsider.pubkey(), true),
            ],
            Err(InstructionError::IncorrectAuthority),
        );
    }

    #[test]
    fn update_metadata_replaces_metadata_for_creator() {
        let creator = Keypair::new();
        let token_pubkey = Pubkey::new_unique();
        let token = Aeko721Token {
            collection: Pubkey::new_unique(),
            token_id: 10,
            owner: Pubkey::new_unique(),
            creator: creator.pubkey(),
            royalty_bps: 250,
            metadata: sample_metadata("Badge", "https://ipfs.io/ipfs/badge"),
            frozen: false,
            is_initialized: true,
        };
        let mut token_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let token_bytes = to_vec(&token).unwrap();
        token_account.data_as_mut_slice()[..token_bytes.len()].copy_from_slice(&token_bytes);

        let ix = instruction::update_metadata(
            &id(),
            &token_pubkey,
            &creator.pubkey(),
            sample_metadata("Badge v2", "https://arweave.net/badge-v2"),
        );
        let accounts = process_instruction(
            &ix.data,
            vec![
                (token_pubkey, token_account),
                (creator.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(token_pubkey, false),
                AccountMeta::new_readonly(creator.pubkey(), true),
            ],
            Ok(()),
        );

        let updated = Aeko721Token::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.metadata.name, "Badge v2");
        assert_eq!(updated.metadata.uri, "https://arweave.net/badge-v2");
    }

    #[test]
    fn freeze_and_thaw_nft_updates_frozen_state() {
        let creator = Keypair::new();
        let token_pubkey = Pubkey::new_unique();
        let token = Aeko721Token {
            collection: Pubkey::new_unique(),
            token_id: 11,
            owner: Pubkey::new_unique(),
            creator: creator.pubkey(),
            royalty_bps: 250,
            metadata: sample_metadata("Badge", "https://arweave.net/badge"),
            frozen: false,
            is_initialized: true,
        };
        let mut token_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let token_bytes = to_vec(&token).unwrap();
        token_account.data_as_mut_slice()[..token_bytes.len()].copy_from_slice(&token_bytes);

        let freeze_ix = instruction::freeze_nft(&id(), &token_pubkey, &creator.pubkey());
        let accounts = process_instruction(
            &freeze_ix.data,
            vec![
                (token_pubkey, token_account),
                (creator.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(token_pubkey, false),
                AccountMeta::new_readonly(creator.pubkey(), true),
            ],
            Ok(()),
        );
        let frozen = Aeko721Token::deserialize_padded(accounts[0].data()).unwrap();
        assert!(frozen.frozen);

        let thaw_ix = instruction::thaw_nft(&id(), &token_pubkey, &creator.pubkey());
        let accounts = process_instruction(
            &thaw_ix.data,
            vec![
                (token_pubkey, accounts[0].clone()),
                (creator.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(token_pubkey, false),
                AccountMeta::new_readonly(creator.pubkey(), true),
            ],
            Ok(()),
        );
        let thawed = Aeko721Token::deserialize_padded(accounts[0].data()).unwrap();
        assert!(!thawed.frozen);
    }

    #[test]
    fn invalid_metadata_is_rejected() {
        let authority = Keypair::new();
        let collection_pubkey = Pubkey::new_unique();
        let token_pubkey = Pubkey::new_unique();

        let collection = Aeko721Collection {
            authority: authority.pubkey(),
            name: "AEKO Genesis".to_string(),
            symbol: "AGEN".to_string(),
            base_uri: Some("https://cdn.aeko.chain".to_string()),
            total_minted: 0,
            is_initialized: true,
        };
        let mut collection_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let collection_bytes = to_vec(&collection).unwrap();
        collection_account.data_as_mut_slice()[..collection_bytes.len()]
            .copy_from_slice(&collection_bytes);

        let ix = instruction::mint_nft(
            &id(),
            &collection_pubkey,
            &token_pubkey,
            &authority.pubkey(),
            77,
            Pubkey::new_unique(),
            authority.pubkey(),
            500,
            sample_metadata("Bad Uri", "not-a-valid-uri"),
        );

        process_instruction(
            &ix.data,
            vec![
                (collection_pubkey, collection_account),
                (token_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(collection_pubkey, false),
                AccountMeta::new(token_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Err(InstructionError::InvalidInstructionData),
        );
    }
}
