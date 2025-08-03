// Property Settings page enhancements: collapsible accordion for each section
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
