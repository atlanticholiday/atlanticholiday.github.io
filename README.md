# Atlantic Holiday - Work Schedule Calculator

A web application for managing employee work schedules, vacations, and generating reports.

## Project Structure

The application has been refactored into a modular structure for better maintainability:

```
horario/
├── index.html              # Main HTML file
├── styles/
│   └── main.css           # Custom CSS styles
├── js/
│   ├── app.js             # Main application entry point
│   ├── config.js          # Configuration constants
│   ├── data-manager.js    # Firebase data operations
│   ├── ui-manager.js      # UI rendering and updates
│   ├── pdf-generator.js   # PDF report generation
│   ├── holiday-calculator.js # Holiday calculations
│   └── event-manager.js   # Event listeners and user interactions
└── README.md              # This file
```

## Architecture Overview

### Core Modules

1. **app.js** - Main entry point that initializes Firebase and coordinates all modules
2. **config.js** - Contains Firebase configuration and application constants
3. **data-manager.js** - Handles all Firebase operations and data management
4. **ui-manager.js** - Manages UI rendering, updates, and modal interactions
5. **pdf-generator.js** - Generates PDF reports for teams and individuals
6. **holiday-calculator.js** - Handles holiday calculations (placeholder for future expansion)
7. **event-manager.js** - Manages all event listeners and user interactions

### Key Features

- **Employee Management**: Add, edit, archive, and restore employees
- **Schedule Management**: Set working days, track attendance, and manage overrides
- **Vacation Planning**: Schedule and manage employee vacations
- **Holiday Integration**: Automatic holiday detection and handling
- **PDF Reports**: Generate team and individual reports
- **Drag & Drop**: Reorder employee list with drag and drop
- **Real-time Updates**: Live synchronization with Firebase

### Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Authentication, Firestore)
- **PDF Generation**: jsPDF with AutoTable plugin
- **Fonts**: Inter (Google Fonts)

## Getting Started

1. Open `index.html` in a web browser
2. Sign in with your Firebase credentials
3. Start managing your team's schedule!

## Development

The modular structure makes it easy to:
- Add new features by creating new modules
- Modify existing functionality without affecting other parts
- Test individual components in isolation
- Maintain clean separation of concerns

## File Descriptions

- **index.html**: Clean HTML structure with external CSS and JS references
- **styles/main.css**: All custom styles and CSS variables
- **js/app.js**: Application initialization and module coordination
- **js/config.js**: Firebase config and application constants
- **js/data-manager.js**: All data operations and Firebase interactions
- **js/ui-manager.js**: UI rendering, updates, and modal management
- **js/pdf-generator.js**: PDF report generation functionality
- **js/holiday-calculator.js**: Holiday calculation logic (expandable)
- **js/event-manager.js**: Event handling and user interaction management 