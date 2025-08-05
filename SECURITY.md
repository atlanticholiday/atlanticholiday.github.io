# Security Guidelines

## RNAL Data Protection

This application now stores RNAL (Registro Nacional de Alojamento Local) data securely in Firebase Firestore with the following security measures:

### Data Storage Security

1. **Firebase Firestore**: All RNAL data is stored in Firebase Firestore, not in browser localStorage
2. **User Authentication**: Only authenticated users can access their own RNAL data
3. **User Isolation**: Each user can only access RNAL data they have uploaded
4. **Secure Document IDs**: Document IDs include user ID and timestamp for uniqueness and security

### Configuration Security

1. **No Hardcoded Credentials**: Firebase configuration is no longer hardcoded in the source code
2. **Environment Variables**: Configuration should be loaded from secure environment variables
3. **Gitignore Protection**: Sensitive configuration files are excluded from version control

### Setup Instructions

1. **Copy the configuration template**:
   ```bash
   cp firebase-config.example.js firebase-config.js
   ```

2. **Update firebase-config.js** with your actual Firebase project credentials

3. **Verify .gitignore** includes firebase-config.js to prevent accidental commits

4. **Ensure HTML includes** the configuration script before the main app:
   ```html
   <script src="firebase-config.js"></script>
   ```

### RNAL Data Access Control

- Users must be authenticated to upload, view, or manage RNAL data
- Each user's RNAL data is isolated using Firestore security rules
- Data queries are filtered by user ID to prevent cross-user data access
- No sensitive RNAL information is exposed in browser console logs or DOM attributes

### Best Practices

1. Never commit actual Firebase credentials to version control
2. Use production Firestore security rules to restrict data access
3. Regularly review access logs for unauthorized access attempts
4. Keep Firebase SDK updated to latest security patches

### Firestore Security Rules

Recommended Firestore security rules for RNAL data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // RNAL data - users can only access their own data
    match /rnal_data/{document} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
    }
    
    // Allow authenticated users to create new RNAL documents
    match /rnal_data/{document} {
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.userId;
    }
  }
}
```

### Compliance Notes

- RNAL data contains personal and business information that may be subject to GDPR
- Ensure appropriate data retention and deletion policies are in place
- Document access logs for compliance auditing
- Provide users with ability to export and delete their data upon request 