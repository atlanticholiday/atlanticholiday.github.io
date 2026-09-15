import { describe, test, assert } from "../../../test-harness.js";
import {
  findBookingReviewObjects,
  mergeReviews,
  normalizeAirbnbReview,
  normalizeBookingReview,
  stripReviewHtml
} from "../../../../scripts/reviews/review-scraper-utils.js";

describe("review-scraper-utils", () => {
  test("normalizes Airbnb reviews and records whether the host answered", () => {
    const review = normalizeAirbnbReview({
      id: "123",
      comments: "Lovely flat.<br/>Very clean.",
      createdAt: "2026-08-04T10:00:00Z",
      rating: 5,
      reviewer: { firstName: "Ana" },
      responder: { hostName: "Atlantic Holiday" },
      response: "Thank you, Ana!",
      localizedRespondedDate: "August 2026"
    });

    assert.equal(review.id, "airbnb-123");
    assert.equal(review.author, "Ana");
    assert.equal(review.comment, "Lovely flat.\nVery clean.");
    assert.equal(review.responseAuthor, "Atlantic Holiday");
    assert.equal(review.hasResponse, true);
  });

  test("normalizes Booking reviews and nested property responses", () => {
    const review = normalizeBookingReview({
      reviewUrl: "abc",
      reviewer: { name: "Ben", countryName: "Ireland" },
      reviewScore: "8,5",
      positiveText: "Great location",
      ownerResponse: { text: "Thanks for the feedback", author: "Team" }
    });

    assert.equal(review.id, "booking-abc");
    assert.equal(review.score, 8.5);
    assert.equal(review.positive, "Great location");
    assert.equal(review.response, "Thanks for the feedback");
    assert.equal(review.hasResponse, true);
  });

  test("finds review arrays and deduplicates paginated results", () => {
    const payload = {
      data: {
        reviewListFrontend: {
          reviewCards: [
            { reviewId: "one", reviewerName: "A", reviewText: "First" },
            { reviewId: "two", reviewerName: "B", reviewText: "Second" }
          ]
        }
      }
    };
    const found = findBookingReviewObjects(payload);
    const normalized = found.map(normalizeBookingReview);
    const merged = mergeReviews(normalized, [{ ...normalized[0], response: "Answered", hasResponse: true }]);

    assert.equal(found.length, 2);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((review) => review.id === "booking-one").hasResponse, true);
    assert.equal(stripReviewHtml("Hello<br>world &amp; friends"), "Hello\nworld & friends");
  });
});
