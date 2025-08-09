document.addEventListener('DOMContentLoaded', function () {
    // Handle back button
    const backButton = document.getElementById('back-to-dashboard');
    if(backButton) {
        backButton.addEventListener('click', () => {
            window.history.back();
        });
    }
});

// Reorder sections to match the sidebar's logical flow
document.addEventListener('DOMContentLoaded', function () {
  const order = [
    'section-basic-info-edit',
    'section-maps-location',
    'section-access-parking',
    'section-media-content',
    'section-google-drive',
    'section-recommendations',
    'section-frames',
    'section-signage',
    'section-equipment',
    'section-services-extras',
    'section-connectivity-utilities',
    'section-online-services',
    'section-legal-compliance',
    'section-safety-maintenance',
    'section-contacts',
    'section-condominium-info'
  ];

  const form = document.getElementById('property-settings-form');
  if (!form) return;

  const actions = form.querySelector('.actions');
  const anchor = actions || null; // insert before actions if present, otherwise append

  order.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement === form) {
      if (anchor) {
        form.insertBefore(el, anchor);
      } else {
        form.appendChild(el);
      }
    }
  });
});

// All form sections are now always visible - no collapsible behavior
