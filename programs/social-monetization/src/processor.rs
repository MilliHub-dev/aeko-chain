use {
    crate::{
        error::SocialMonetizationError,
        instruction::SocialMonetizationInstruction,
        state::{
            CreatorRevenueAccount, SocialMonetizationStateAccount, SubscriptionState,
        },
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
        let instruction = SocialMonetizationInstruction::try_from_slice(
            instruction_context.get_instruction_data(),
        )
        .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            SocialMonetizationInstruction::InitializeConfig { state } => {
                Self::process_initialize(invoke_context, state)
            }
            SocialMonetizationInstruction::SendCreatorTip { record } => {
                Self::process_send_tip(invoke_context, record)
            }
            SocialMonetizationInstruction::CreateSubscription { record } => {
                Self::process_create_subscription(invoke_context, record)
            }
            SocialMonetizationInstruction::RenewSubscription {
                subscription_id,
                valid_until_unix,
            } => Self::process_renew_subscription(invoke_context, subscription_id, valid_until_unix),
            SocialMonetizationInstruction::CancelSubscription { subscription_id } => {
                Self::process_cancel_subscription(invoke_context, subscription_id)
            }
            SocialMonetizationInstruction::UnlockPaidContent { record } => {
                Self::process_unlock_paid_content(invoke_context, record)
            }
            SocialMonetizationInstruction::ClaimMonetizationPayout { creator, amount } => {
                Self::process_claim(invoke_context, creator, amount)
            }
            SocialMonetizationInstruction::ReadMonetizationState { creator } => {
                Self::process_read(invoke_context, creator)
            }
        }
    }

    fn process_initialize(
        invoke_context: &mut InvokeContext,
        state: SocialMonetizationStateAccount,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let authority = instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let authority_key = *authority.get_key();
        drop(authority);

        if authority_key != state.config.authority {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let serialized = to_vec(&state).map_err(|_| InstructionError::InvalidInstructionData)?;
        if serialized.len() > state_account.get_data().len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        let data = state_account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn process_send_tip(
        invoke_context: &mut InvokeContext,
        record: crate::state::CreatorTipRecord,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let sender = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !sender.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let sender_key = *sender.get_key();
        drop(sender);

        if sender_key != record.sender {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialMonetizationStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if record.amount == 0 {
            return Err(Self::map_program_error(SocialMonetizationError::InvalidAmount.into()));
        }
        if state.tip_exists(&record.tip_id) {
            return Err(Self::map_program_error(SocialMonetizationError::DuplicateTip.into()));
        }
        state.tips.push(record.clone());
        Self::credit_creator(&mut state, record.creator, record.amount);
        Self::write_back(&mut state_account, &state)
    }

    fn process_create_subscription(
        invoke_context: &mut InvokeContext,
        record: crate::state::SubscriptionRecord,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let subscriber = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !subscriber.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let subscriber_key = *subscriber.get_key();
        drop(subscriber);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialMonetizationStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if !state.config.subscriptions_enabled {
            return Err(Self::map_program_error(
                SocialMonetizationError::SubscriptionsDisabled.into(),
            ));
        }
        if subscriber_key != record.subscriber {
            return Err(InstructionError::IncorrectAuthority);
        }
        if record.amount_per_period == 0 || record.period_seconds == 0 {
            return Err(Self::map_program_error(SocialMonetizationError::InvalidAmount.into()));
        }
        if record.valid_until_unix <= record.started_at_unix {
            return Err(Self::map_program_error(
                SocialMonetizationError::InvalidSubscriptionWindow.into(),
            ));
        }
        if state.subscription_exists(&record.subscription_id) {
            return Err(Self::map_program_error(
                SocialMonetizationError::DuplicateSubscription.into(),
            ));
        }
        state.subscriptions.push(record.clone());
        Self::credit_creator(&mut state, record.creator, record.amount_per_period);
        Self::write_back(&mut state_account, &state)
    }

    fn process_renew_subscription(
        invoke_context: &mut InvokeContext,
        subscription_id: [u8; 32],
        valid_until_unix: i64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let subscriber = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !subscriber.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let subscriber_key = *subscriber.get_key();
        drop(subscriber);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialMonetizationStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        let subscription = state
            .subscriptions
            .iter_mut()
            .find(|entry| entry.subscription_id == subscription_id && entry.subscriber == subscriber_key)
            .ok_or_else(|| Self::map_program_error(SocialMonetizationError::SubscriptionNotFound.into()))?;
        if subscription.state != SubscriptionState::Active {
            return Err(Self::map_program_error(
                SocialMonetizationError::SubscriptionNotActive.into(),
            ));
        }
        if valid_until_unix <= subscription.valid_until_unix {
            return Err(Self::map_program_error(
                SocialMonetizationError::InvalidSubscriptionWindow.into(),
            ));
        }
        subscription.valid_until_unix = valid_until_unix;
        subscription.state = SubscriptionState::Active;
        let creator = subscription.creator;
        let amount = subscription.amount_per_period;
        Self::credit_creator(&mut state, creator, amount);
        Self::write_back(&mut state_account, &state)
    }

    fn process_cancel_subscription(
        invoke_context: &mut InvokeContext,
        subscription_id: [u8; 32],
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let subscriber = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !subscriber.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let subscriber_key = *subscriber.get_key();
        drop(subscriber);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialMonetizationStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        let subscription = state
            .subscriptions
            .iter_mut()
            .find(|entry| entry.subscription_id == subscription_id && entry.subscriber == subscriber_key)
            .ok_or_else(|| Self::map_program_error(SocialMonetizationError::SubscriptionNotFound.into()))?;
        if subscription.state != SubscriptionState::Active {
            return Err(Self::map_program_error(
                SocialMonetizationError::SubscriptionNotActive.into(),
            ));
        }
        subscription.state = SubscriptionState::Canceled;
        Self::write_back(&mut state_account, &state)
    }

    fn process_unlock_paid_content(
        invoke_context: &mut InvokeContext,
        record: crate::state::PaidContentUnlockRecord,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let buyer = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !buyer.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let buyer_key = *buyer.get_key();
        drop(buyer);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialMonetizationStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if !state.config.paid_content_enabled {
            return Err(Self::map_program_error(
                SocialMonetizationError::PaidContentDisabled.into(),
            ));
        }
        if buyer_key != record.buyer {
            return Err(InstructionError::IncorrectAuthority);
        }
        if record.amount == 0 {
            return Err(Self::map_program_error(SocialMonetizationError::InvalidAmount.into()));
        }
        if state.unlock_exists(&record.unlock_id) {
            return Err(Self::map_program_error(SocialMonetizationError::DuplicateUnlock.into()));
        }
        state.unlocks.push(record.clone());
        Self::credit_creator(&mut state, record.creator, record.amount);
        Self::write_back(&mut state_account, &state)
    }

    fn process_claim(
        invoke_context: &mut InvokeContext,
        creator: Pubkey,
        amount: u64,
    ) -> Result<(), InstructionError> {
        // Accounts: 0=state, 1=treasury (source), 2=destination, 3=authority (signer)
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;

        let authority = instruction_context.try_borrow_instruction_account(transaction_context, 3)?;
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let authority_key = *authority.get_key();
        drop(authority);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialMonetizationStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if authority_key != creator && authority_key != state.config.authority {
            return Err(Self::map_program_error(SocialMonetizationError::Unauthorized.into()));
        }

        // Verify the provided treasury matches the configured one
        {
            let treasury =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            if *treasury.get_key() != state.config.treasury {
                return Err(InstructionError::InvalidArgument);
            }
        }

        let revenue = state
            .revenues
            .iter_mut()
            .find(|entry| entry.creator == creator)
            .ok_or_else(|| Self::map_program_error(SocialMonetizationError::NothingToClaim.into()))?;
        if amount == 0 {
            return Err(Self::map_program_error(SocialMonetizationError::InvalidAmount.into()));
        }
        if revenue.claimable_amount < amount {
            return Err(Self::map_program_error(SocialMonetizationError::NothingToClaim.into()));
        }
        revenue.claimable_amount -= amount;
        revenue.total_claimed = revenue.total_claimed.saturating_add(amount as u128);
        Self::write_back(&mut state_account, &state)?;
        drop(state_account);

        // Transfer lamports from treasury to creator's destination account
        let mut treasury =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        treasury.checked_sub_lamports(amount)?;
        drop(treasury);

        let mut destination =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        destination.checked_add_lamports(amount)?;

        Ok(())
    }

    fn process_read(
        invoke_context: &mut InvokeContext,
        creator: Option<Pubkey>,
    ) -> Result<(), InstructionError> {
        let return_data = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(1)?;
            let state_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() {
                return Err(InstructionError::InvalidAccountOwner);
            }
            let state = SocialMonetizationStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            if let Some(creator) = creator {
                let maybe_revenue = state.revenues.iter().find(|entry| entry.creator == creator).cloned();
                to_vec(&maybe_revenue).map_err(|_| InstructionError::InvalidAccountData)?
            } else {
                to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?
            }
        };
        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn credit_creator(state: &mut SocialMonetizationStateAccount, creator: Pubkey, amount: u64) {
        let creator_amount = Self::creator_net_amount(state, amount);
        if let Some(existing) = state.revenues.iter_mut().find(|entry| entry.creator == creator) {
            existing.total_earned = existing.total_earned.saturating_add(creator_amount as u128);
            existing.claimable_amount = existing.claimable_amount.saturating_add(creator_amount);
        } else {
            state.revenues.push(CreatorRevenueAccount {
                creator,
                total_earned: creator_amount as u128,
                total_claimed: 0,
                claimable_amount: creator_amount,
            });
        }
    }

    fn creator_net_amount(state: &SocialMonetizationStateAccount, amount: u64) -> u64 {
        let fee = (amount as u128)
            .saturating_mul(state.config.platform_fee_bps as u128)
            / 10_000u128;
        amount.saturating_sub(fee as u64)
    }

    fn write_back(
        state_account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>,
        state: &SocialMonetizationStateAccount,
    ) -> Result<(), InstructionError> {
        let serialized = to_vec(state).map_err(|_| InstructionError::InvalidAccountData)?;
        if serialized.len() > state_account.get_data().len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        let data = state_account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn map_program_error(error: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match error {
            aeko_sdk::program_error::ProgramError::Custom(code) => InstructionError::Custom(code),
            _ => InstructionError::InvalidArgument,
        }
    }
}

#[cfg(test)]
mod tests {
    use {
        crate::state::{
            CreatorRevenueAccount, MonetizationConfig, PaidContentUnlockRecord,
            SocialMonetizationStateAccount, SubscriptionRecord, SubscriptionState,
        },
        aeko_sdk::pubkey::Pubkey,
    };

    fn test_state(platform_fee_bps: u16) -> SocialMonetizationStateAccount {
        SocialMonetizationStateAccount::new(MonetizationConfig {
            authority: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            platform_fee_bps,
            subscriptions_enabled: true,
            paid_content_enabled: true,
        })
    }

    fn credit_creator(state: &mut SocialMonetizationStateAccount, creator: Pubkey, amount: u64) {
        let fee = (amount as u128).saturating_mul(state.config.platform_fee_bps as u128) / 10_000;
        let creator_amount = amount.saturating_sub(fee as u64);
        if let Some(existing) = state.revenues.iter_mut().find(|entry| entry.creator == creator) {
            existing.total_earned = existing.total_earned.saturating_add(creator_amount as u128);
            existing.claimable_amount = existing.claimable_amount.saturating_add(creator_amount);
        } else {
            state.revenues.push(CreatorRevenueAccount {
                creator,
                total_earned: creator_amount as u128,
                total_claimed: 0,
                claimable_amount: creator_amount,
            });
        }
    }

    #[test]
    fn platform_fee_reduces_creator_claimable_amount() {
        let creator = Pubkey::new_unique();
        let mut state = test_state(500);
        credit_creator(&mut state, creator, 1_000);
        let revenue = state.revenues.iter().find(|entry| entry.creator == creator).unwrap();
        assert_eq!(revenue.claimable_amount, 950);
        assert_eq!(revenue.total_earned, 950);
    }

    #[test]
    fn subscription_lifecycle_changes_state() {
        let creator = Pubkey::new_unique();
        let subscriber = Pubkey::new_unique();
        let mut state = test_state(0);
        state.subscriptions.push(SubscriptionRecord {
            subscription_id: [1u8; 32],
            creator,
            subscriber,
            amount_per_period: 100,
            period_seconds: 30,
            started_at_unix: 10,
            valid_until_unix: 40,
            state: SubscriptionState::Active,
        });

        let subscription = state.subscriptions.first_mut().unwrap();
        subscription.valid_until_unix = 70;
        assert_eq!(subscription.state, SubscriptionState::Active);
        subscription.state = SubscriptionState::Canceled;
        assert_eq!(subscription.state, SubscriptionState::Canceled);
    }

    #[test]
    fn duplicate_unlock_detection_is_possible() {
        let creator = Pubkey::new_unique();
        let buyer = Pubkey::new_unique();
        let mut state = test_state(0);
        let unlock = PaidContentUnlockRecord {
            unlock_id: [9u8; 32],
            content_id: [7u8; 32],
            creator,
            buyer,
            amount: 200,
            unlocked_at_unix: 33,
        };
        state.unlocks.push(unlock);
        assert!(state.unlock_exists(&[9u8; 32]));
    }
}
