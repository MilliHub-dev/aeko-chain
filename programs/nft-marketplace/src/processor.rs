use {
    crate::{
        error::MarketplaceError,
        instruction::NftMarketplaceInstruction,
        state::{ListingState, NftListing},
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey},
    aeko_token_721_program::state::Aeko721Token,
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let instruction_data = instruction_context.get_instruction_data();
        let instruction = NftMarketplaceInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            NftMarketplaceInstruction::ListNft {
                collection,
                creator,
                price_lamports,
                royalty_bps,
                expires_at_slot,
            } => Self::process_list_nft(
                invoke_context,
                collection,
                creator,
                price_lamports,
                royalty_bps,
                expires_at_slot,
            ),
            NftMarketplaceInstruction::BuyNft => Self::process_buy_nft(invoke_context),
            NftMarketplaceInstruction::CancelListing => {
                Self::process_cancel_listing(invoke_context)
            }
        }
    }

    fn process_list_nft(
        invoke_context: &mut InvokeContext,
        collection: Pubkey,
        creator: Pubkey,
        price_lamports: u64,
        royalty_bps: u16,
        expires_at_slot: Option<u64>,
    ) -> Result<(), InstructionError> {
        if price_lamports == 0 {
            return Err(Self::map_error(MarketplaceError::InvalidPrice.into()));
        }
        if royalty_bps > 10_000 {
            return Err(Self::map_error(MarketplaceError::InvalidRoyalty.into()));
        }

        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let seller_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let seller_key = *seller_account.get_key();
        if !seller_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(seller_account);

        // Verify seller currently owns the token.
        let token_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let token = Aeko721Token::deserialize_padded(token_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        let token_pubkey = *token_account.get_key();
        if !token.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if token.owner != seller_key {
            return Err(Self::map_error(MarketplaceError::TokenNotOwnedBySeller.into()));
        }
        drop(token_account);

        let mut listing_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *listing_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }

        let listing = NftListing {
            seller: seller_key,
            collection,
            token_account: token_pubkey,
            creator,
            price_lamports,
            royalty_bps,
            expires_at_slot,
            state: ListingState::Active,
            buyer: None,
            is_initialized: true,
        };
        Self::write_borsh_account(&mut listing_account, &listing)
    }

    fn process_buy_nft(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let buyer_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let buyer_key = *buyer_account.get_key();
        if !buyer_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(buyer_account);

        let mut listing_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *listing_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let mut listing = NftListing::deserialize_padded(listing_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !listing.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if listing.state != ListingState::Active {
            return Err(Self::map_error(MarketplaceError::ListingNotActive.into()));
        }
        if let Some(expires_at_slot) = listing.expires_at_slot {
            let current_slot = invoke_context.get_sysvar_cache().get_clock()
                .map(|clock| clock.slot)
                .unwrap_or(0);
            if current_slot > expires_at_slot {
                return Err(Self::map_error(MarketplaceError::ListingExpired.into()));
            }
        }

        listing.state = ListingState::Sold;
        listing.buyer = Some(buyer_key);
        Self::write_borsh_account(&mut listing_account, &listing)
    }

    fn process_cancel_listing(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let seller_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let seller_key = *seller_account.get_key();
        if !seller_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(seller_account);

        let mut listing_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *listing_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let mut listing = NftListing::deserialize_padded(listing_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !listing.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if listing.state != ListingState::Active {
            return Err(Self::map_error(MarketplaceError::ListingNotActive.into()));
        }
        if listing.seller != seller_key {
            return Err(Self::map_error(MarketplaceError::InvalidSeller.into()));
        }

        listing.state = ListingState::Cancelled;
        Self::write_borsh_account(&mut listing_account, &listing)
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

    fn map_error(error: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match error {
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == MarketplaceError::ListingNotActive as u32 =>
            {
                InstructionError::InvalidArgument
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == MarketplaceError::InvalidSeller as u32 =>
            {
                InstructionError::IncorrectAuthority
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == MarketplaceError::ListingExpired as u32 =>
            {
                InstructionError::InvalidArgument
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == MarketplaceError::TokenNotOwnedBySeller as u32 =>
            {
                InstructionError::IncorrectAuthority
            }
            _ => InstructionError::InvalidInstructionData,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use {
        crate::{id, instruction, Entrypoint},
        aeko_program_runtime::invoke_context::mock_process_instruction,
        aeko_sdk::{
            account::{AccountSharedData, ReadableAccount, WritableAccount},
            instruction::AccountMeta,
            pubkey::Pubkey,
            signature::{Keypair, Signer},
        },
        aeko_token_721_program::state::{Aeko721Token, MetadataAttribute, NftMetadata},
        borsh::to_vec,
    };

    const ACCOUNT_SPACE: usize = 16_384;

    fn sample_token(owner: Pubkey, creator: Pubkey) -> Aeko721Token {
        Aeko721Token {
            collection: Pubkey::new_unique(),
            token_id: 1,
            owner,
            creator,
            royalty_bps: 500,
            metadata: NftMetadata {
                name: "Test NFT".to_string(),
                description: Some("A test NFT".to_string()),
                uri: "https://arweave.net/test".to_string(),
                image_uri: None,
                attributes: vec![MetadataAttribute {
                    trait_type: "Tier".to_string(),
                    value: "Gold".to_string(),
                }],
            },
            frozen: false,
            is_initialized: true,
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
    fn list_nft_creates_active_listing() {
        let seller = Keypair::new();
        let collection = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let listing_pubkey = Pubkey::new_unique();
        let token_pubkey = Pubkey::new_unique();

        let token = sample_token(seller.pubkey(), creator);
        let mut token_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_token_721_program::id());
        let token_bytes = to_vec(&token).unwrap();
        token_account.data_as_mut_slice()[..token_bytes.len()].copy_from_slice(&token_bytes);

        let ix = instruction::list_nft(
            &id(),
            &listing_pubkey,
            &token_pubkey,
            &seller.pubkey(),
            collection,
            creator,
            1_000_000_000,
            500,
            None,
        );

        let accounts = process_instruction(
            &ix.data,
            vec![
                (listing_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (token_pubkey, token_account),
                (seller.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(listing_pubkey, false),
                AccountMeta::new_readonly(token_pubkey, false),
                AccountMeta::new_readonly(seller.pubkey(), true),
            ],
            Ok(()),
        );

        let listing = NftListing::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(listing.state, ListingState::Active);
        assert_eq!(listing.seller, seller.pubkey());
        assert_eq!(listing.price_lamports, 1_000_000_000);
        assert_eq!(listing.royalty_bps, 500);
        assert!(listing.buyer.is_none());
    }

    #[test]
    fn buy_nft_marks_listing_sold_with_buyer() {
        let seller = Keypair::new();
        let buyer = Keypair::new();
        let collection = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let listing_pubkey = Pubkey::new_unique();

        let listing = NftListing {
            seller: seller.pubkey(),
            collection,
            token_account: Pubkey::new_unique(),
            creator,
            price_lamports: 500_000_000,
            royalty_bps: 250,
            expires_at_slot: None,
            state: ListingState::Active,
            buyer: None,
            is_initialized: true,
        };
        let mut listing_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let listing_bytes = to_vec(&listing).unwrap();
        listing_account.data_as_mut_slice()[..listing_bytes.len()]
            .copy_from_slice(&listing_bytes);

        let ix = instruction::buy_nft(&id(), &listing_pubkey, &buyer.pubkey());
        let accounts = process_instruction(
            &ix.data,
            vec![
                (listing_pubkey, listing_account),
                (buyer.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(listing_pubkey, false),
                AccountMeta::new_readonly(buyer.pubkey(), true),
            ],
            Ok(()),
        );

        let updated = NftListing::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.state, ListingState::Sold);
        assert_eq!(updated.buyer, Some(buyer.pubkey()));
    }

    #[test]
    fn buy_nft_rejects_inactive_listing() {
        let buyer = Keypair::new();
        let listing_pubkey = Pubkey::new_unique();

        let listing = NftListing {
            seller: Pubkey::new_unique(),
            collection: Pubkey::new_unique(),
            token_account: Pubkey::new_unique(),
            creator: Pubkey::new_unique(),
            price_lamports: 1_000_000_000,
            royalty_bps: 500,
            expires_at_slot: None,
            state: ListingState::Cancelled,
            buyer: None,
            is_initialized: true,
        };
        let mut listing_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let listing_bytes = to_vec(&listing).unwrap();
        listing_account.data_as_mut_slice()[..listing_bytes.len()]
            .copy_from_slice(&listing_bytes);

        let ix = instruction::buy_nft(&id(), &listing_pubkey, &buyer.pubkey());
        process_instruction(
            &ix.data,
            vec![
                (listing_pubkey, listing_account),
                (buyer.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(listing_pubkey, false),
                AccountMeta::new_readonly(buyer.pubkey(), true),
            ],
            Err(InstructionError::InvalidArgument),
        );
    }

    #[test]
    fn cancel_listing_by_seller_succeeds() {
        let seller = Keypair::new();
        let listing_pubkey = Pubkey::new_unique();

        let listing = NftListing {
            seller: seller.pubkey(),
            collection: Pubkey::new_unique(),
            token_account: Pubkey::new_unique(),
            creator: Pubkey::new_unique(),
            price_lamports: 1_000_000_000,
            royalty_bps: 500,
            expires_at_slot: None,
            state: ListingState::Active,
            buyer: None,
            is_initialized: true,
        };
        let mut listing_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let listing_bytes = to_vec(&listing).unwrap();
        listing_account.data_as_mut_slice()[..listing_bytes.len()]
            .copy_from_slice(&listing_bytes);

        let ix = instruction::cancel_listing(&id(), &listing_pubkey, &seller.pubkey());
        let accounts = process_instruction(
            &ix.data,
            vec![
                (listing_pubkey, listing_account),
                (seller.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(listing_pubkey, false),
                AccountMeta::new_readonly(seller.pubkey(), true),
            ],
            Ok(()),
        );

        let updated = NftListing::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.state, ListingState::Cancelled);
    }

    #[test]
    fn cancel_listing_by_non_seller_fails() {
        let seller = Keypair::new();
        let outsider = Keypair::new();
        let listing_pubkey = Pubkey::new_unique();

        let listing = NftListing {
            seller: seller.pubkey(),
            collection: Pubkey::new_unique(),
            token_account: Pubkey::new_unique(),
            creator: Pubkey::new_unique(),
            price_lamports: 1_000_000_000,
            royalty_bps: 500,
            expires_at_slot: None,
            state: ListingState::Active,
            buyer: None,
            is_initialized: true,
        };
        let mut listing_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let listing_bytes = to_vec(&listing).unwrap();
        listing_account.data_as_mut_slice()[..listing_bytes.len()]
            .copy_from_slice(&listing_bytes);

        let ix = instruction::cancel_listing(&id(), &listing_pubkey, &outsider.pubkey());
        process_instruction(
            &ix.data,
            vec![
                (listing_pubkey, listing_account),
                (outsider.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(listing_pubkey, false),
                AccountMeta::new_readonly(outsider.pubkey(), true),
            ],
            Err(InstructionError::IncorrectAuthority),
        );
    }

    #[test]
    fn list_nft_rejects_non_owner_seller() {
        let seller = Keypair::new();
        let real_owner = Pubkey::new_unique();
        let collection = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let listing_pubkey = Pubkey::new_unique();
        let token_pubkey = Pubkey::new_unique();

        // Token is owned by real_owner, not seller
        let token = sample_token(real_owner, creator);
        let mut token_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_token_721_program::id());
        let token_bytes = to_vec(&token).unwrap();
        token_account.data_as_mut_slice()[..token_bytes.len()].copy_from_slice(&token_bytes);

        let ix = instruction::list_nft(
            &id(),
            &listing_pubkey,
            &token_pubkey,
            &seller.pubkey(),
            collection,
            creator,
            1_000_000_000,
            500,
            None,
        );

        process_instruction(
            &ix.data,
            vec![
                (listing_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (token_pubkey, token_account),
                (seller.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(listing_pubkey, false),
                AccountMeta::new_readonly(token_pubkey, false),
                AccountMeta::new_readonly(seller.pubkey(), true),
            ],
            Err(InstructionError::IncorrectAuthority),
        );
    }
}
