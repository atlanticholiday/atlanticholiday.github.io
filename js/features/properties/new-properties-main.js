/**
 * New Properties Onboarding App - Main Entry Point
 * Atlantic Holiday
 */

import { NewPropertiesManager } from './new-properties-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    const manager = new NewPropertiesManager({ containerId: 'new-properties-app' });
    manager.init();
    window.newPropertiesManager = manager;
});
