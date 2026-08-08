export function isCallableUnavailableError(error) {
    const code = String(error?.code || '').trim().toLowerCase();
    if (code === 'functions/not-found' || code === 'functions/unavailable') {
        return true;
    }

    const message = String(error?.message || '').toLowerCase();
    return message.includes('failed to fetch')
        || message.includes('function not found')
        || message.includes('functions are unavailable');
}
