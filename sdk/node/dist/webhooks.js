export function watchSignatureStatus(connection, signature, onUpdate, options = {}) {
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
export function watchAccountState(connection, address, onUpdate, options = {}) {
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
