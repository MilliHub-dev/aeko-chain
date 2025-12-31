# Backend Integration (Node.js)

For developers building social bots or alternative frontends.

## Listening for New Posts

To build a "Feed Service", you need to index posts as they happen.

```javascript
import { Connection, PublicKey } from '@aeko-chain/web3.js';

const connection = new Connection("wss://api.mainnet-beta.aeko.chain");
const PROGRAM_ID = new PublicKey("SocialProtocol11111111111111111111111111");

// Subscribe to Logs
connection.onLogs(PROGRAM_ID, (logs, context) => {
    if (logs.err) return;
    
    // Parse log for "NewPost" event
    const event = parseLog(logs.logs);
    if (event.type === 'NewPost') {
        console.log(`New Post by ${event.author}: ${event.contentHash}`);
        // Fetch full content from IPFS and update local database
    }
});
```
