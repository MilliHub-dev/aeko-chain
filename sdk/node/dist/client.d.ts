import { AekoConnection, type AekoConnectionOptions } from '@aeko-chain/web3.js/connection';
export interface AekoNodeClientOptions extends AekoConnectionOptions {
    appName?: string;
}
export declare class AekoNodeClient extends AekoConnection {
    readonly appName?: string;
    constructor(endpoint: string, options?: AekoNodeClientOptions);
}
