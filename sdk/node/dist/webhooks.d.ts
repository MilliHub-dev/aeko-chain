import type { AccountInfoValue, SignatureStatus } from '@aeko-chain/web3.js/types';
import type { AekoConnection } from '@aeko-chain/web3.js/connection';
export interface PollingWebhookOptions {
    intervalMs?: number;
}
export interface SignatureWatcher {
    stop(): void;
}
export interface AccountWatcher {
    stop(): void;
}
export declare function watchSignatureStatus(connection: AekoConnection, signature: string, onUpdate: (status: SignatureStatus | null) => void | Promise<void>, options?: PollingWebhookOptions): SignatureWatcher;
export declare function watchAccountState(connection: AekoConnection, address: string, onUpdate: (account: AccountInfoValue | null) => void | Promise<void>, options?: PollingWebhookOptions): AccountWatcher;
