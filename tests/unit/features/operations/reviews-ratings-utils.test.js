import { describe, test, assert } from "../../../test-harness.js";
import {
  round,
  formatScore,
  getCleanlinessStatus,
  isAttentionNeeded,
  calculatePortfolioSummary,
  filterAndSortProperties
} from "../../../../js/features/operations/reviews-ratings-utils.js";

describe("reviews-ratings-utils", () => {
  const sampleProperties = [
    {
      id: "funchal-essence",
      name: "Funchal Essence",
      location: "Funchal",
      booking: {
        score: 9.5,
        reviewCount: 36,
        subScores: { cleanliness: 9.9 }
      },
      airbnb: {
        score: 5.0,
        reviewCount: 10,
        badge: "Guest favourite",
        subScores: { cleanliness: 5.0 }
      }
    },
    {
      id: "villa-de-la-ponte",
      name: "Villa de la Ponte",
      location: "Arco da Calheta",
      booking: {
        score: 9.0,
        reviewCount: 10,
        subScores: { cleanliness: 8.1 } // Alert (< 9.0)
      },
      airbnb: {
        score: 4.74,
        reviewCount: 31,
        subScores: { cleanliness: 4.8 }
      }
    },
    {
      id: "ocean-view-apt",
      name: "Ocean View Studio",
      location: "Funchal",
      booking: {
        score: 8.2, // Alert (< 8.5)
        reviewCount: 15,
        subScores: { cleanliness: 8.8 } // Alert (< 9.0)
      },
      airbnb: {
        score: 4.55, // Alert (< 4.60)
        reviewCount: 20,
        subScores: { cleanliness: 4.6 }
      }
    }
  ];

  test("round rounds values to given decimals", () => {
    assert.equal(round(4.745, 2), 4.75);
    assert.equal(round(9.5, 1), 9.5);
    assert.equal(round(null), null);
    assert.equal(round(undefined), null);
  });

  test("formatScore returns formatted score or dash fallback", () => {
    assert.equal(formatScore(4.9, 5), "4.9 / 5");
    assert.equal(formatScore(9.5, 10), "9.5 / 10");
    assert.equal(formatScore(null), "—");
    assert.equal(formatScore(undefined), "—");
  });

  test("getCleanlinessStatus identifies alerts and excellent scores", () => {
    // Funchal Essence: 5.0 on Airbnb and 9.9 on Booking
    assert.equal(getCleanlinessStatus(sampleProperties[0]), "excellent");

    // Villa de la Ponte: 8.1 on Booking is below 9.0 target
    assert.equal(getCleanlinessStatus(sampleProperties[1]), "alert");

    // Ocean View: 4.6 on Airbnb and 8.8 on Booking
    assert.equal(getCleanlinessStatus(sampleProperties[2]), "alert");
  });

  test("isAttentionNeeded flags properties with low cleanliness or low overall score", () => {
    assert.equal(isAttentionNeeded(sampleProperties[0]), false);
    assert.equal(isAttentionNeeded(sampleProperties[1]), true); // Due to 8.1 cleanliness on Booking
    assert.equal(isAttentionNeeded(sampleProperties[2]), true); // Due to both score & cleanliness
  });

  test("calculatePortfolioSummary computes accurate portfolio metrics", () => {
    const summary = calculatePortfolioSummary(sampleProperties);

    assert.equal(summary.totalProperties, 3);
    assert.equal(summary.totalReviews, 122); // 36 + 10 + 10 + 31 + 15 + 20
    assert.equal(summary.attentionNeededCount, 2);

    // Airbnb Avg: (5.0 + 4.74 + 4.55) / 3 = 14.29 / 3 = 4.76
    assert.equal(summary.airbnbAvg, 4.76);

    // Booking Avg: (9.5 + 9.0 + 8.2) / 3 = 26.7 / 3 = 8.90
    assert.equal(summary.bookingAvg, 8.9);

    // Cleanliness Airbnb Avg: (5.0 + 4.8 + 4.6) / 3 = 14.4 / 3 = 4.80
    assert.equal(summary.cleanlinessAvgAirbnb, 4.8);
  });

  test("filterAndSortProperties filters by search query and category", () => {
    // Search
    const calhetaProps = filterAndSortProperties(sampleProperties, { search: "Calheta" });
    assert.equal(calhetaProps.length, 1);
    assert.equal(calhetaProps[0].id, "villa-de-la-ponte");

    // Filter by Attention
    const attentionList = filterAndSortProperties(sampleProperties, { filter: "attention" });
    assert.equal(attentionList.length, 2);

    // Filter by Guest Favourite
    const guestFavs = filterAndSortProperties(sampleProperties, { filter: "guest-favourite" });
    assert.equal(guestFavs.length, 1);
    assert.equal(guestFavs[0].id, "funchal-essence");
  });

  test("filterAndSortProperties sorts by different criteria", () => {
    // Highest Booking
    const sortedBooking = filterAndSortProperties(sampleProperties, { sort: "booking-desc" });
    assert.equal(sortedBooking[0].id, "funchal-essence");
    assert.equal(sortedBooking[2].id, "ocean-view-apt");

    // Most Reviews
    const sortedReviews = filterAndSortProperties(sampleProperties, { sort: "reviews-desc" });
    assert.equal(sortedReviews[0].id, "funchal-essence"); // 46 total reviews
  });
});
