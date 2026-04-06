use {
    crate::{
        error::SocialPostsError,
        instruction::SocialPostsInstruction,
        state::{EngagementProof, ModerationState, PostAnchor, SocialPostsStateAccount},
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey},
    aeko_social_anti_spam_program::state::{AntiSpamMode, SocialAntiSpamStateAccount},
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let instruction = SocialPostsInstruction::try_from_slice(
            instruction_context.get_instruction_data(),
        )
        .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            SocialPostsInstruction::InitializeState { state } => {
                Self::process_initialize(invoke_context, state)
            }
            SocialPostsInstruction::AnchorPost { post } => {
                Self::process_anchor_post(invoke_context, post)
            }
            SocialPostsInstruction::EditPost {
                post_id,
                editor,
                content_hash,
                metadata_hash,
                content_uri,
                edited_at_unix,
            } => Self::process_edit_post(
                invoke_context,
                post_id,
                editor,
                content_hash,
                metadata_hash,
                content_uri,
                edited_at_unix,
            ),
            SocialPostsInstruction::ModeratePost {
                post_id,
                authority,
                moderation_state,
            } => Self::process_moderate_post(invoke_context, post_id, authority, moderation_state),
            SocialPostsInstruction::RecordEngagement { proof } => {
                Self::process_record_engagement(invoke_context, proof)
            }
            SocialPostsInstruction::ReadPostsState { post_id } => {
                Self::process_read(invoke_context, post_id)
            }
        }
    }

    fn process_initialize(
        invoke_context: &mut InvokeContext,
        state: SocialPostsStateAccount,
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

    fn process_anchor_post(
        invoke_context: &mut InvokeContext,
        post: PostAnchor,
    ) -> Result<(), InstructionError> {
        // Accounts: 0=posts_state, 1=creator (signer), 2=anti_spam_state (optional, read-only)
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let creator = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !creator.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let creator_key = *creator.get_key();
        drop(creator);

        // If the caller includes an anti-spam state account (account 2), enforce gating rules.
        // The account is optional so that existing call-sites without anti-spam remain valid.
        let num_accounts = instruction_context.get_number_of_instruction_accounts();
        if num_accounts >= 3 {
            let anti_spam_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            // Only enforce if the account is actually owned by the anti-spam program
            if *anti_spam_account.get_owner() == aeko_social_anti_spam_program::id() {
                let anti_spam_state =
                    SocialAntiSpamStateAccount::deserialize_padded(anti_spam_account.get_data())
                        .map_err(|_| InstructionError::InvalidAccountData)?;
                if anti_spam_state.is_initialized {
                    Self::check_anti_spam_eligibility(&anti_spam_state, &creator_key)?;
                }
            }
            drop(anti_spam_account);
        }

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialPostsStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if !state.config.posting_enabled {
            return Err(Self::map_program_error(SocialPostsError::PostingDisabled.into()));
        }
        if creator_key != post.creator {
            return Err(InstructionError::IncorrectAuthority);
        }
        Self::validate_post_anchor(&state, &post)?;
        state.posts.push(post);
        Self::write_back(&mut state_account, &state)
    }

    /// Check whether a wallet is allowed to post based on the anti-spam program state.
    /// Mirrors the eligibility logic in `social-anti-spam`'s `evaluate_eligibility`, but
    /// runs read-only inside the social-posts program without a CPI.
    fn check_anti_spam_eligibility(
        anti_spam_state: &SocialAntiSpamStateAccount,
        wallet: &Pubkey,
    ) -> Result<(), InstructionError> {
        let profile = anti_spam_state.profile_for_wallet(wallet);

        // If the wallet is in a cooldown (gated) period, block posting regardless of mode.
        if let Some(profile) = profile {
            if profile.gated_until_epoch.is_some() {
                return Err(InstructionError::Custom(
                    aeko_social_anti_spam_program::error::SocialAntiSpamError::CooldownActive as u32,
                ));
            }
        }

        match anti_spam_state.config.mode {
            AntiSpamMode::ObserveOnly => Ok(()),
            AntiSpamMode::GateByReputation => {
                // Reputation score is computed externally; here we gate wallets that have
                // accumulated spam flags above a safe threshold (each flag is worth ~50 points
                // out of 1000 in the explorer reputation model).
                let spam_flags = profile.map(|p| p.spam_flags).unwrap_or(0);
                let estimated_score = 1_000u32
                    .saturating_sub(u32::from(spam_flags).saturating_mul(50))
                    as u16;
                if estimated_score < anti_spam_state.config.min_post_reputation {
                    return Err(InstructionError::Custom(
                        aeko_social_anti_spam_program::error::SocialAntiSpamError::ReputationTooLow
                            as u32,
                    ));
                }
                Ok(())
            }
            AntiSpamMode::GateByStake | AntiSpamMode::PenaltyEnabled => {
                // Stake enforcement requires the staking program's data which is not passed
                // into this instruction. Wallets with cooldowns are already blocked above;
                // full stake verification is left to the anti-spam program's CheckSpam
                // instruction which should be included in the same transaction.
                Ok(())
            }
        }
    }

    fn process_edit_post(
        invoke_context: &mut InvokeContext,
        post_id: [u8; 32],
        editor: Pubkey,
        content_hash: [u8; 32],
        metadata_hash: [u8; 32],
        content_uri: String,
        edited_at_unix: i64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let signer = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !signer.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let signer_key = *signer.get_key();
        drop(signer);

        if signer_key != editor {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialPostsStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        let max_uri_len = state.config.max_content_uri_len as usize;
        let post = state
            .posts
            .iter_mut()
            .find(|entry| entry.post_id == post_id)
            .ok_or_else(|| Self::map_program_error(SocialPostsError::PostNotFound.into()))?;
        if post.creator != editor || edited_at_unix < post.created_at_unix {
            return Err(Self::map_program_error(SocialPostsError::InvalidEdit.into()));
        }
        if content_uri.is_empty() || content_uri.len() > max_uri_len {
            return Err(Self::map_program_error(SocialPostsError::InvalidContentUri.into()));
        }
        post.content_hash = content_hash;
        post.metadata_hash = metadata_hash;
        post.content_uri = content_uri;
        post.edited_at_unix = Some(edited_at_unix);
        Self::write_back(&mut state_account, &state)
    }

    fn process_moderate_post(
        invoke_context: &mut InvokeContext,
        post_id: [u8; 32],
        authority: Pubkey,
        moderation_state: ModerationState,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let signer = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !signer.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let signer_key = *signer.get_key();
        drop(signer);

        if signer_key != authority {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialPostsStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_authority(&authority).map_err(Self::map_program_error)?;
        let post = state
            .posts
            .iter_mut()
            .find(|entry| entry.post_id == post_id)
            .ok_or_else(|| Self::map_program_error(SocialPostsError::PostNotFound.into()))?;
        post.moderation_state = moderation_state;
        Self::write_back(&mut state_account, &state)
    }

    fn process_record_engagement(
        invoke_context: &mut InvokeContext,
        proof: EngagementProof,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let actor = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !actor.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let actor_key = *actor.get_key();
        drop(actor);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialPostsStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if !state.config.engagement_enabled {
            return Err(Self::map_program_error(
                SocialPostsError::EngagementDisabled.into(),
            ));
        }
        if actor_key != proof.actor {
            return Err(InstructionError::IncorrectAuthority);
        }
        Self::validate_engagement_proof(&state, &proof)?;
        state.engagement_proofs.push(proof);
        Self::write_back(&mut state_account, &state)
    }

    fn process_read(
        invoke_context: &mut InvokeContext,
        post_id: Option<[u8; 32]>,
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
            let state = SocialPostsStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            if let Some(post_id) = post_id {
                let maybe_post = state.posts.iter().find(|entry| entry.post_id == post_id).cloned();
                to_vec(&maybe_post).map_err(|_| InstructionError::InvalidAccountData)?
            } else {
                to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?
            }
        };
        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn validate_post_anchor(
        state: &SocialPostsStateAccount,
        post: &PostAnchor,
    ) -> Result<(), InstructionError> {
        if state.post_exists(&post.post_id) {
            return Err(Self::map_program_error(SocialPostsError::DuplicatePost.into()));
        }
        if post.content_uri.is_empty()
            || post.content_uri.len() > state.config.max_content_uri_len as usize
        {
            return Err(Self::map_program_error(SocialPostsError::InvalidContentUri.into()));
        }
        if post.created_at_unix <= 0 {
            return Err(Self::map_program_error(SocialPostsError::InvalidTimestamp.into()));
        }
        Ok(())
    }

    fn validate_engagement_proof(
        state: &SocialPostsStateAccount,
        proof: &EngagementProof,
    ) -> Result<(), InstructionError> {
        if proof.action_weight == 0 || proof.unix_timestamp <= 0 {
            return Err(Self::map_program_error(SocialPostsError::InvalidTimestamp.into()));
        }
        if state.proof_exists(&proof.proof_id) {
            return Err(Self::map_program_error(
                SocialPostsError::DuplicateEngagementProof.into(),
            ));
        }
        if state.replay_guard_exists(&proof.replay_guard) {
            return Err(Self::map_program_error(
                SocialPostsError::DuplicateReplayGuard.into(),
            ));
        }
        Ok(())
    }

    fn write_back(
        state_account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>,
        state: &SocialPostsStateAccount,
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
        super::*,
        crate::state::{
            EngagementActionKind, EngagementProof, ModerationState, PostAnchor, PostKind,
            SocialPostsConfig, VisibilityClass,
        },
    };

    fn test_state() -> SocialPostsStateAccount {
        SocialPostsStateAccount::new(SocialPostsConfig {
            authority: Pubkey::new_unique(),
            posting_enabled: true,
            engagement_enabled: true,
            max_content_uri_len: 128,
        })
    }

    fn test_post(creator: Pubkey) -> PostAnchor {
        PostAnchor {
            post_id: [1u8; 32],
            creator,
            content_hash: [2u8; 32],
            metadata_hash: [3u8; 32],
            content_uri: "ipfs://post/1".to_string(),
            parent_post_id: None,
            post_kind: PostKind::Original,
            created_at_unix: 1_700_000_000,
            edited_at_unix: None,
            visibility: VisibilityClass::Public,
            moderation_state: ModerationState::Active,
            signature_ref: None,
        }
    }

    #[test]
    fn validate_post_anchor_rejects_duplicates() {
        let creator = Pubkey::new_unique();
        let mut state = test_state();
        let post = test_post(creator);
        state.posts.push(post.clone());
        let result = Processor::validate_post_anchor(&state, &post);
        assert!(result.is_err());
    }

    #[test]
    fn validate_engagement_proof_rejects_duplicate_replay_guard() {
        let creator = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let mut state = test_state();
        state.posts.push(test_post(creator));
        state.engagement_proofs.push(EngagementProof {
            proof_id: [4u8; 32],
            actor,
            target_post_id: Some([1u8; 32]),
            target_creator: creator,
            action_kind: EngagementActionKind::Like,
            action_weight: 1,
            slot: 9,
            unix_timestamp: 1_700_000_010,
            replay_guard: [8u8; 32],
        });

        let result = Processor::validate_engagement_proof(
            &state,
            &EngagementProof {
                proof_id: [5u8; 32],
                actor,
                target_post_id: Some([1u8; 32]),
                target_creator: creator,
                action_kind: EngagementActionKind::Share,
                action_weight: 2,
                slot: 10,
                unix_timestamp: 1_700_000_020,
                replay_guard: [8u8; 32],
            },
        );
        assert!(result.is_err());
    }
}
