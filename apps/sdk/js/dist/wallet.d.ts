export interface AekoWalletCapabilities {
    connect: boolean;
    disconnect: boolean;
    signMessage: boolean;
    signAndSendTransaction: boolean;
}
export interface AekoWalletAdapter {
    id: string;
    name: string;
    publicKey: string;
    isConnected: boolean;
    capabilities: AekoWalletCapabilities;
    connect(): Promise<string>;
    disconnect(): Promise<void>;
    signMessage(message: Uint8Array | string): Promise<unknown>;
    signAndSendTransaction(preparedTransactionBase64: string): Promise<unknown>;
}
export declare function listInjectedAekoWalletAdapters(): AekoWalletAdapter[];
export declare function detectInjectedAekoWalletAdapter(): AekoWalletAdapter | null;
