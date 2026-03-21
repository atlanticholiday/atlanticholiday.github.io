export class ChangeNotifier {
    constructor() {
        this.listeners = new Set();
    }

    subscribe(listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener must be a function');
        }

        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    notify(payload) {
        for (const listener of [...this.listeners]) {
            try {
                listener(payload);
            } catch (error) {
                console.error('[ChangeNotifier] Listener failed:', error);
            }
        }
    }
}
