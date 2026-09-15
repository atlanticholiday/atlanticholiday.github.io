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
      "atlantic_holiday_property_reviews_cache_v4",
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

  test("deletePropertyReview removes review from platform-specific arrays", () => {
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
  });
});
