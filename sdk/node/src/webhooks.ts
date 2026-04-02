import type {
  AccountInfoValue,
  SignatureStatus,
} from '@aeko-chain/web3.js/types';
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

export function watchSignatureStatus(
  connection: AekoConnection,
  signature: string,
  onUpdate: (status: SignatureStatus | null) => void | Promise<void>,
  options: PollingWebhookOptions = {},
): SignatureWatcher {
  const intervalMs = options.intervalMs ?? 2_000;
  const timer = setInterval(async () => {
    const [status] = await connection.getSignatureStatuses([signature]);
    await onUpdate(status ?? null);
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

export function watchAccountState(
  connection: AekoConnection,
  address: string,
  onUpdate: (account: AccountInfoValue | null) => void | Promise<void>,
  options: PollingWebhookOptions = {},
): AccountWatcher {
  const intervalMs = options.intervalMs ?? 5_000;
  const timer = setInterval(async () => {
    const account = await connection.getAccountInfo(address);
    await onUpdate(account);
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
