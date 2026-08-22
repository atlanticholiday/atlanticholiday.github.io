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

export function shouldFallbackToClientPasswordReset(error) {
    const code = String(error?.code || '').trim().toLowerCase();
    const message = String(error?.message || '').trim().toLowerCase();
    const isTargetAccountNotFound = code === 'functions/not-found'
        && (message.includes('email') || message.includes('login') || message.includes('account'));
    if (isTargetAccountNotFound) {
        return false;
    }

    if (isCallableUnavailableError(error)) {
        return true;
    }

    return code === 'functions/internal'
        || code === 'functions/failed-precondition';
}

export async function requestFirebasePasswordReset({
    email,
    createResetLink,
    sendResetEmail
}) {
    let resetResult = {};

    try {
        resetResult = await createResetLink(email) || {};
    } catch (error) {
        if (!shouldFallbackToClientPasswordReset(error)) {
            throw error;
        }
    }

    try {
        await sendResetEmail(email);
        return {
            ...resetResult,
            delivery: 'email'
        };
    } catch (error) {
        if (!resetResult.resetLink) {
            throw error;
        }

        return {
            ...resetResult,
            delivery: 'failed',
            deliveryError: String(error?.code || error?.message || 'unknown')
        };
    }
}
