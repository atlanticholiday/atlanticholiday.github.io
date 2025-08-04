document.addEventListener('DOMContentLoaded', function () {
    const formSections = document.querySelectorAll('.form-section');

    formSections.forEach((section, index) => {
        const header = section.querySelector('.section-header');
        if (header) {
            // Add a toggle icon
            const toggleIcon = document.createElement('div');
            toggleIcon.classList.add('section-toggle');
            toggleIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
            header.appendChild(toggleIcon);

            header.addEventListener('click', () => {
                section.classList.toggle('collapsed');
            });

            // Collapse all sections by default except for the first one
            if (index > 0) {
                section.classList.add('collapsed');
            }
        }
    });

    // Handle back button
    const backButton = document.getElementById('back-to-dashboard');
    if(backButton) {
        backButton.addEventListener('click', () => {
            window.history.back();
        });
    }
});
// Creates a cleaner, shorter layout by collapsing sections and allowing users to expand when needed.
// Author: Cascade AI

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const sections = document.querySelectorAll('.form-section');
    sections.forEach((section, index) => {
      const header = section.querySelector('.section-header');
      if (!header) return;

      // Collapse all sections except the first for an uncluttered initial view
      if (index !== 0) {
        section.classList.add('collapsed');
      }

      // Make the whole header clickable to toggle collapse
      header.addEventListener('click', () => {
        section.classList.toggle('collapsed');
        // Smoothly scroll the opened section into view (optional UX enhancement)
        if (!section.classList.contains('collapsed')) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  });
})();
