import { AekoConnection } from '@aeko-chain/web3.js/connection';
export class AekoNodeClient extends AekoConnection {
    appName;
    constructor(endpoint, options = {}) {
        super(endpoint, options);
        this.appName = options.appName;
    }
}
