// Function to initialize the sidebar
function initSettingsSidebar() {
  const sidebar = document.getElementById('settings-sidebar');
  if (!sidebar) return;

  // List of sections with their display names (reordered for clearer flow)
  const sections = [
    // Core basics
    { id: 'section-basic-info-edit', name: 'Basic Information' },
    { id: 'section-maps-location', name: 'Maps & Location' },
    { id: 'section-access-parking', name: 'Access & Parking' },

    // Guest-facing content
    { id: 'section-media-content', name: 'Media & Content' },
    { id: 'section-google-drive', name: 'Google Drive' },
    { id: 'section-recommendations', name: 'Recommendations' },
    { id: 'section-frames', name: 'Frames' },
    { id: 'section-signage', name: 'Signage' },

    // Operations & utilities
    { id: 'section-equipment', name: 'Equipment' },
    { id: 'section-services-extras', name: 'Services & Extras' },
    { id: 'section-connectivity-utilities', name: 'Connectivity & Utilities' },

    // Platforms and compliance
    { id: 'section-online-services', name: 'Online Services' },
    { id: 'section-legal-compliance', name: 'Legal & Compliance' },
    { id: 'section-safety-maintenance', name: 'Safety Maintenance' },

    // Admin and building
    { id: 'section-contacts', name: 'Contacts' },
    { id: 'section-condominium-info', name: 'Condominium Information' }
  ];

  // Create the list
  const ul = document.createElement('ul');
  ul.className = 'category-list';

  sections.forEach(section => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = section.name;
    a.dataset.section = section.id;
    a.addEventListener('click', function(e) {
      e.preventDefault();
      const targetSection = document.getElementById(section.id);
      if (targetSection) {
        // Expand the section if it's collapsed
        if (!targetSection.classList.contains('expanded')) {
          targetSection.classList.add('expanded');
        }
        targetSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
    li.appendChild(a);
    ul.appendChild(li);
  });

  sidebar.appendChild(ul);
}

// Initialize the sidebar when the DOM is loaded
document.addEventListener('DOMContentLoaded', initSettingsSidebar);
