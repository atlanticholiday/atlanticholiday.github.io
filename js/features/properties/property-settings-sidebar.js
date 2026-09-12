// Function to initialize the sidebar
function initSettingsSidebar() {
  const sidebar = document.getElementById('settings-sidebar');
  if (!sidebar) return;

  // Clear any existing content
  sidebar.innerHTML = '';

  // List of sections with their display names and icons
  const sections = [
    // Core basics
    { id: 'section-basic-info-edit', name: 'Basic Information', icon: 'fa-home' },
    { id: 'section-maps-location', name: 'Maps & Location', icon: 'fa-map-marker-alt' },
    { id: 'section-access-parking', name: 'Access & Parking', icon: 'fa-parking' },

    // Guest-facing content
    { id: 'section-media-content', name: 'Media & Content', icon: 'fa-photo-video' },
    { id: 'section-google-drive', name: 'Google Drive', icon: 'fab fa-google-drive' },
    { id: 'section-recommendations', name: 'Recommendations', icon: 'fa-star' },
    { id: 'section-frames', name: 'Frames', icon: 'fa-image' },
    { id: 'section-signage', name: 'Signage', icon: 'fa-sign' },

    // Operations & utilities
    { id: 'section-equipment', name: 'Equipment', icon: 'fa-tools' },
    { id: 'section-services-extras', name: 'Services & Extras', icon: 'fa-concierge-bell' },
    { id: 'section-connectivity-utilities', name: 'Connectivity & Utilities', icon: 'fa-wifi' },

    // Platforms and compliance
    { id: 'section-online-services', name: 'Online Services', icon: 'fa-globe' },
    { id: 'section-legal-compliance', name: 'Legal & Compliance', icon: 'fa-balance-scale' },
    { id: 'section-rnal-insurance', name: 'RNAL & Insurance', icon: 'fa-shield-alt' },
    { id: 'section-safety-maintenance', name: 'Safety Maintenance', icon: 'fa-first-aid' },
    { id: 'section-keys-house-rules', name: 'Keys & House Rules', icon: 'fa-key' },

    // Admin and building
    { id: 'section-owner', name: 'Owner', icon: 'fa-user-tie' },
    { id: 'section-accounting', name: 'Accounting', icon: 'fa-file-invoice-dollar' },
    { id: 'section-contacts', name: 'Cleaning', icon: 'fa-broom' },
    { id: 'section-condominium-info', name: 'Condominium Info', icon: 'fa-building' }
  ];

  // Create the list
  const ul = document.createElement('ul');
  ul.className = 'category-list';
  const links = new Map();

  function setActive(activeId) {
    links.forEach((link, id) => {
      if (id === activeId) {
        link.classList.add('is-active', 'active');
      } else {
        link.classList.remove('is-active', 'active');
      }
    });
  }

  sections.forEach(section => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${section.id}`;
    a.dataset.section = section.id;

    const icon = document.createElement('i');
    icon.className = section.icon.startsWith('fab ') ? section.icon : `fas ${section.icon}`;

    const text = document.createElement('span');
    text.textContent = section.name;

    a.appendChild(icon);
    a.appendChild(text);

    a.addEventListener('click', function(e) {
      e.preventDefault();
      const targetSection = document.getElementById(section.id);
      if (targetSection) {
        if (!targetSection.classList.contains('expanded')) {
          targetSection.classList.add('expanded');
        }
        const topbarHeight = 55;
        const targetTop = targetSection.getBoundingClientRect().top + window.pageYOffset - topbarHeight;
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
        setActive(section.id);
        if (window.history && window.history.pushState) {
          window.history.pushState(null, null, `#${section.id}`);
        }
      }
    });

    li.appendChild(a);
    ul.appendChild(li);
    links.set(section.id, a);
  });

  sidebar.appendChild(ul);

  // Set initial active state from hash or first section
  const initialHash = window.location.hash ? window.location.hash.substring(1) : null;
  if (initialHash && links.has(initialHash)) {
    setActive(initialHash);
  } else if (sections.length > 0) {
    setActive(sections[0].id);
  }

  // Scrollspy via IntersectionObserver
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActive(entry.target.id);
        }
      });
    }, {
      rootMargin: '-55px 0px -70% 0px',
      threshold: 0
    });

    sections.forEach(section => {
      const target = document.getElementById(section.id);
      if (target) {
        observer.observe(target);
      }
    });
  }
}

// Initialize the sidebar when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettingsSidebar);
} else {
  initSettingsSidebar();
}

