import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { ReviewsRatingsManager } from "../../../../js/features/operations/reviews-ratings-manager.js";

describe("ReviewsRatingsManager", () => {
  test("persists user-edited Airbnb link across mergeServerDataset refreshes", () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();

    const manager = new ReviewsRatingsManager();
    manager.state.rawProperties = [
      {
        id: "acanto-loft",
        name: "Acanto Loft",
        location: "Funchal",
        bookingUrl: "https://booking.com/acanto",
        airbnbUrl: "",
        booking: { score: 9.1, reviewCount: 28 },
        airbnb: null
      }
    ];
    manager.state.selectedProperty = manager.state.rawProperties[0];

    // User saves an Airbnb link
    manager.savePropertyLinks({
      airbnbUrl: "https://www.airbnb.pt/rooms/1371090652884733487",
      airbnbScore: "4.56",
      airbnbCount: "9"
    });

    assert.equal(manager.state.rawProperties[0].airbnbUrl, "https://www.airbnb.pt/rooms/1371090652884733487");
    assert.equal(manager.state.rawProperties[0].airbnb.score, 4.56);
    assert.equal(manager.state.rawProperties[0].airbnb.reviewCount, 9);

    // Simulate page update fetching static server JSON with empty Airbnb URL
    const serverDataset = {
      lastUpdated: "2026-09-15T22:00:00.000Z",
      properties: [
        {
          id: "acanto-loft",
          name: "Acanto Loft",
          location: "Funchal",
          bookingUrl: "https://booking.com/acanto",
          airbnbUrl: "", // Server still has empty string!
          booking: { score: 9.1, reviewCount: 28 },
          airbnb: null
        }
      ]
    };

    manager.mergeServerDataset(serverDataset);

    // User's Airbnb link and score MUST survive and not disappear!
    assert.equal(manager.state.rawProperties[0].airbnbUrl, "https://www.airbnb.pt/rooms/1371090652884733487");
    assert.equal(manager.state.rawProperties[0].airbnb.score, 4.56);
    assert.equal(manager.state.rawProperties[0].airbnb.reviewCount, 9);
  });

  test("loads user overrides from localStorage on fresh initialization", () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();

    // Pre-populate overrides in storage
    localStorage.setItem(
      "atlantic_holiday_reviews_user_overrides_v1",
      JSON.stringify({
        "acanto-loft": {
          airbnbUrl: "https://www.airbnb.pt/rooms/1371090652884733487",
          airbnbScore: 4.56
        }
      })
    );
    localStorage.setItem(
      "atlantic_holiday_property_reviews_cache_v5",
      JSON.stringify({
        properties: [
          {
            id: "acanto-loft",
            name: "Acanto Loft",
            airbnbUrl: ""
          }
        ]
      })
    );

    const freshManager = new ReviewsRatingsManager();
    assert.equal(freshManager.state.rawProperties[0].airbnbUrl, "https://www.airbnb.pt/rooms/1371090652884733487");
    assert.equal(freshManager.state.rawProperties[0].airbnb.score, 4.56);
  });

  test("mergeServerDataset properly imports server reviews when local cache had empty reviews", () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();

    const manager = new ReviewsRatingsManager();
    // Simulate stale local cache with empty reviews arrays
    manager.state.rawProperties = [
      {
        id: "acanto-loft",
        name: "Acanto Loft",
        bookingUrl: "https://booking.com/acanto",
        airbnbUrl: "https://airbnb.pt/rooms/1371090652884733487",
        booking: { score: 9.1, reviewCount: 28, reviews: [] },
        airbnb: { score: 4.56, reviewCount: 9, reviews: [] },
        reviews: []
      }
    ];

    const serverDataset = {
      lastUpdated: "2026-09-15T22:00:00.000Z",
      properties: [
        {
          id: "acanto-loft",
          name: "Acanto Loft",
          booking: {
            score: 9.1,
            reviewCount: 28,
            reviews: [
              { id: "rev-b1", author: "Marta", score: 8, comment: "Great" },
              { id: "rev-b2", author: "Nikola", score: 9, comment: "Nice" }
            ]
          },
          airbnb: {
            score: 4.56,
            reviewCount: 9,
            reviews: [
              { id: "rev-a1", author: "Louise", score: 4, comment: "Super" }
            ]
          },
          reviews: []
        }
      ]
    };

    manager.mergeServerDataset(serverDataset);

    const merged = manager.state.rawProperties.find((p) => p.id === "acanto-loft");
    assert.equal(merged.booking.reviews.length, 2, "Booking reviews must be imported from server");
    assert.equal(merged.airbnb.reviews.length, 1, "Airbnb reviews must be imported from server");
  });

  test("deletePropertyReview removes review from platform-specific arrays and persists across server refreshes", () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();

    const manager = new ReviewsRatingsManager();
    const testProp = {
      id: "prop-1",
      name: "Property 1",
      reviews: [],
      booking: {
        reviews: [
          { id: "rev-book-1", author: "Alice" },
          { id: "rev-book-2", author: "Bob" }
        ],
        fetchedReviewCount: 2
      },
      airbnb: {
        reviews: [
          { id: "rev-air-1", author: "Charlie" }
        ],
        fetchedReviewCount: 1
      }
    };
    manager.state.rawProperties = [testProp];
    manager.state.selectedProperty = testProp;

    manager.deletePropertyReview("rev-book-1");
    assert.equal(testProp.booking.reviews.length, 1);
    assert.equal(testProp.booking.reviews[0].id, "rev-book-2");
    assert.equal(testProp.booking.fetchedReviewCount, 1);

    manager.deletePropertyReview("rev-air-1");
    assert.equal(testProp.airbnb.reviews.length, 0);
    assert.equal(testProp.airbnb.fetchedReviewCount, 0);

    // Refresh from server containing the deleted reviews
    const serverDataset = {
      properties: [
        {
          id: "prop-1",
          name: "Property 1",
          booking: {
            reviews: [
              { id: "rev-book-1", author: "Alice" },
              { id: "rev-book-2", author: "Bob" }
            ]
          },
          airbnb: {
            reviews: [
              { id: "rev-air-1", author: "Charlie" }
            ]
          }
        }
      ]
    };
    manager.mergeServerDataset(serverDataset);

    const updated = manager.state.rawProperties.find((p) => p.id === "prop-1");
    assert.equal(updated.booking.reviews.length, 1, "rev-book-1 should remain deleted");
    assert.equal(updated.booking.reviews[0].id, "rev-book-2");
    assert.equal(updated.airbnb.reviews.length, 0, "rev-air-1 should remain deleted");
  });

  test("syncs archived properties from PropertiesManager and hides them from active views", () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();

    const mockPropertiesManager = {
      properties: [
        { id: "prop-active", name: "Active Villa", archived: false },
        { id: "prop-archived", name: "Archived Penthouse", archived: true }
      ]
    };

    const manager = new ReviewsRatingsManager(null, null, {
      getPropertiesManager: () => mockPropertiesManager
    });

    manager.state.rawProperties = [
      { id: "prop-active", name: "Active Villa", booking: { score: 9.2, reviewCount: 10 } },
      { id: "prop-archived", name: "Archived Penthouse by Atlantic Holiday", booking: { score: 8.5, reviewCount: 5 } }
    ];

    manager.updateCalculations();

    // Archived Penthouse must have been marked archived and excluded from active filteredProperties
    assert.equal(manager.state.filteredProperties.length, 1);
    assert.equal(manager.state.filteredProperties[0].id, "prop-active");
    assert.equal(manager.state.summary.totalProperties, 1);

    // If filter is set to 'archived', only the archived property appears
    manager.state.filter = "archived";
    manager.updateCalculations();
    assert.equal(manager.state.filteredProperties.length, 1);
    assert.equal(manager.state.filteredProperties[0].id, "prop-archived");
  });

  test("toggleArchiveProperty archives active property and restores it when clicked again", async () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();

    const manager = new ReviewsRatingsManager();
    manager.state.rawProperties = [
      { id: "p1", name: "Sunny Stay", booking: { score: 9.0, reviewCount: 12 } },
      { id: "p2", name: "Ocean Breeze", booking: { score: 9.5, reviewCount: 8 } }
    ];
    manager.updateCalculations();
    assert.equal(manager.state.filteredProperties.length, 2);

    // Archive p1
    await manager.toggleArchiveProperty("p1");
    assert.equal(manager.state.rawProperties.find(p => p.id === "p1").archived, true);
    assert.equal(manager.state.filteredProperties.length, 1);
    assert.equal(manager.state.filteredProperties[0].id, "p2");
    assert.equal(manager.state.summary.totalProperties, 1);

    // User override must be recorded
    assert.equal(manager.userOverrides["p1"].archived, true);

    // Restore p1
    await manager.toggleArchiveProperty("p1");
    assert.equal(manager.state.rawProperties.find(p => p.id === "p1").archived, false);
    assert.equal(manager.state.filteredProperties.length, 2);
    assert.equal(manager.userOverrides["p1"].archived, false);
  });

  test("supports improvements tab and category filtering in render", () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();

    const manager = new ReviewsRatingsManager();
    manager.state.rawProperties = [
      {
        id: "p1",
        name: "WiFi Issues Apartment",
        booking: {
          score: 8.5,
          subScores: { cleanliness: 9.0 },
          reviews: [
            { id: "r1", author: "Sam", negative: "wifi was broken and very slow", score: 7.0 }
          ]
        }
      }
    ];
    manager.updateCalculations();
    manager.render();

    // Verify Improvements tab button is rendered in the DOM
    const container = document.getElementById("reviews-ratings-page");
    const improvementsTabBtn = container.querySelector('[data-tab="improvements"]');
    assert.ok(improvementsTabBtn, "Improvements tab button should exist");

    // Click Improvements tab
    improvementsTabBtn.click();
    assert.equal(manager.state.activeTab, "improvements");

    // Container should now show the improvements section
    assert.ok(container.innerHTML.includes("Improvements &amp; Recommendations") || container.innerHTML.includes("Improvements & Recommendations"));
    assert.ok(container.innerHTML.includes("WiFi Issues Apartment"));
  });

  test("supports viewMode toggle between Asana cards and list table", () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();

    const manager = new ReviewsRatingsManager();
    manager.state.rawProperties = [
      {
        id: "p-asana",
        name: "Asana Villa",
        location: "Funchal",
        booking: { score: 9.4, reviewCount: 15, subScores: { cleanliness: 9.8 } },
        airbnb: { score: 4.85, reviewCount: 22, subScores: { cleanliness: 4.9 } },
        reviews: []
      }
    ];
    manager.updateCalculations();
    manager.render();

    const container = document.getElementById("reviews-ratings-page");

    // Attention is the landing view; Properties defaults to a table.
    container.querySelector('[data-tab="properties"]').click();
    assert.equal(manager.state.viewMode, "list");
    assert.ok(container.querySelector('[data-mode="cards"]'), "Cards view button should exist");
    const listBtn = container.querySelector('[data-mode="list"]');
    assert.ok(listBtn, "List view button should exist");

    // Card should render with compact Asana styling
    assert.ok(container.querySelector('.reviews-details-btn'), "Card details button exists");
    assert.ok(container.innerHTML.includes("Asana Villa"));

    // Switch to List view
    listBtn.click();
    assert.equal(manager.state.viewMode, "list");
    assert.equal(localStorage.getItem("atlantic_holiday_reviews_view_mode"), "list");

    // Table should now be rendered
    const table = container.querySelector("table");
    assert.ok(table, "Table element should be present in list mode");
    assert.ok(container.querySelector("th")?.textContent.includes("Property"), "Table header includes Property");
    assert.ok(container.querySelector(".reviews-details-btn"), "Action buttons exist in list row");

    // Switch back to cards
    const cardsBtn = container.querySelector('[data-mode="cards"]');
    cardsBtn.click();
    assert.equal(manager.state.viewMode, "cards");
    assert.equal(localStorage.getItem("atlantic_holiday_reviews_view_mode"), "cards");
  });

  test("restores viewMode from localStorage on initialization", () => {
    resetDom(`<div id="reviews-ratings-page"></div>`);
    localStorage.clear();
    localStorage.setItem("atlantic_holiday_reviews_view_mode", "list");

    const manager = new ReviewsRatingsManager();
    assert.equal(manager.state.viewMode, "list");
  });
});

