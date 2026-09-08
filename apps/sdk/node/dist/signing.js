import { sendAndConfirmTransaction, } from '@aeko-chain/web3.js/transactions';
export async function signPreparedTransaction(signer, preparedTransactionBase64) {
    return signer.signPreparedTransaction(preparedTransactionBase64);
}
export async function sendSignedTransactionBatch(connection, signedTransactionsBase64, options = {}) {
    const results = [];
    for (const [index, signedTransaction] of signedTransactionsBase64.entries()) {
        try {
            const confirmed = await sendAndConfirmTransaction(connection, signedTransaction, options);
            results.push({
                index,
                signature: confirmed.signature,
                confirmed,
            });
        }
        catch (error) {
            results.push({
                index,
                error,
            });
        }
    }
    return results;
}
export async function signAndSendPreparedTransactionBatch(connection, signer, preparedTransactionsBase64, options = {}) {
    const signedTransactions = [];
    for (const prepared of preparedTransactionsBase64) {
        signedTransactions.push(await signPreparedTransaction(signer, prepared));
    }
    return sendSignedTransactionBatch(connection, signedTransactions, options);
}
