import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class PropertiesManager {
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
        this.properties = [];
        this.unsubscribe = null;
    }

    getPropertiesCollectionRef() {
        return collection(this.db, `users/${this.userId}/properties`);
    }

    async addProperty(propertyData) {
        try {
            const docRef = await addDoc(this.getPropertiesCollectionRef(), {
                ...propertyData,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            return docRef.id;
        } catch (error) {
            console.error('Error adding property:', error);
            throw error;
        }
    }

    async updateProperty(propertyId, updates) {
        try {
            const propertyRef = doc(this.db, `users/${this.userId}/properties`, propertyId);
            await updateDoc(propertyRef, {
                ...updates,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('Error updating property:', error);
            throw error;
        }
    }

    async deleteProperty(propertyId) {
        try {
            const propertyRef = doc(this.db, `users/${this.userId}/properties`, propertyId);
            await deleteDoc(propertyRef);
        } catch (error) {
            console.error('Error deleting property:', error);
            throw error;
        }
    }

    listenForPropertyChanges() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        this.unsubscribe = onSnapshot(this.getPropertiesCollectionRef(), (snapshot) => {
            this.properties = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.renderProperties();
        });
    }

    stopListening() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    renderProperties() {
        const propertiesGrid = document.getElementById('properties-grid');
        const noPropertiesMessage = document.getElementById('no-properties-message');

        if (this.properties.length === 0) {
            propertiesGrid.classList.add('hidden');
            noPropertiesMessage.classList.remove('hidden');
            return;
        }

        propertiesGrid.classList.remove('hidden');
        noPropertiesMessage.classList.add('hidden');

        propertiesGrid.innerHTML = this.properties.map(property => this.createPropertyCard(property)).join('');
    }

    createPropertyCard(property) {
        const stars = '★'.repeat(property.rating || 0) + '☆'.repeat(5 - (property.rating || 0));
        
        return `
            <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow property-card">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-gray-900 mb-1">${property.name}</h3>
                        <p class="text-sm text-gray-600 mb-2">${property.location}</p>
                        <div class="flex items-center mb-2">
                            <span class="text-yellow-400 text-sm mr-2">${stars}</span>
                            <span class="text-xs text-gray-500 capitalize px-2 py-1 bg-gray-100 rounded">${property.type}</span>
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <button onclick="editProperty('${property.id}')" class="text-blue-600 hover:text-blue-800 text-sm">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button onclick="deleteProperty('${property.id}')" class="text-red-600 hover:text-red-800 text-sm">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="mb-4">
                    <p class="text-sm text-gray-700 line-clamp-3">${property.description || 'No description available'}</p>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm text-gray-600">
                    <div class="flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m5 0h4M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a1 1 0 011-1h1a1 1 0 011 1v2m-4 0h4" />
                        </svg>
                        ${property.rooms || 0} rooms
                    </div>
                    <div class="flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Added ${new Date(property.createdAt?.toDate?.() || property.createdAt).toLocaleDateString()}
                    </div>
                </div>
            </div>
        `;
    }

    clearForm() {
        document.getElementById('property-name').value = '';
        document.getElementById('property-location').value = '';
        document.getElementById('property-type').value = '';
        document.getElementById('property-rooms').value = '';
        document.getElementById('property-rating').value = '';
        document.getElementById('property-description').value = '';
        document.getElementById('add-property-error').textContent = '';
    }

    validatePropertyData(data) {
        const errors = [];

        if (!data.name?.trim()) {
            errors.push('Property name is required');
        }
        if (!data.location?.trim()) {
            errors.push('Location is required');
        }
        if (!data.type) {
            errors.push('Property type is required');
        }
        if (data.rooms && (data.rooms < 1 || data.rooms > 10000)) {
            errors.push('Number of rooms must be between 1 and 10000');
        }
        if (data.rating && (data.rating < 1 || data.rating > 5)) {
            errors.push('Rating must be between 1 and 5 stars');
        }

        return errors;
    }

    getPropertyById(propertyId) {
        return this.properties.find(p => p.id === propertyId);
    }
} 