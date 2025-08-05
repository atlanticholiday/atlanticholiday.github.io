document.addEventListener('DOMContentLoaded', function () {
    // Handle back button
    const backButton = document.getElementById('back-to-dashboard');
    if(backButton) {
        backButton.addEventListener('click', () => {
            window.history.back();
        });
    }
});

// All form sections are now always visible - no collapsible behavior
