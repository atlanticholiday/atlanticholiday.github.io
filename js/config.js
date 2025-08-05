export const Config = {
    // Firebase configuration should be loaded from environment variables
    // For production, create a separate firebase-config.js file with your actual values
    // This prevents sensitive information from being exposed in the codebase
    firebaseConfig: (() => {
        // Try to load from environment variables first (if using a build tool like Vite)
        if (typeof window !== 'undefined' && window.FIREBASE_CONFIG) {
            return window.FIREBASE_CONFIG;
        }
        
        // Fallback for development - replace these with your actual values
        // In production, these should be loaded from a secure configuration
        return {
            apiKey: "YOUR_API_KEY_HERE",
            authDomain: "YOUR_PROJECT.firebaseapp.com", 
            projectId: "YOUR_PROJECT_ID_HERE",
            storageBucket: "YOUR_PROJECT.appspot.com",
            messagingSenderId: "YOUR_SENDER_ID_HERE",
            appId: "YOUR_APP_ID_HERE"
        };
    })(),
    
    DAYS_OF_WEEK: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    MONTHS_OF_YEAR: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    STATUS_OPTIONS: ['Working', 'Off', 'Absent']
}; 