# Requirements

## Functional Requirements

What the first useful version of DropShelf must do:

- The system should display a creator profile page with a name, bio, and profile image
- The system should display a list of products associated with a creator, each showing a title, description, price, and image
- The system should allow a buyer to initiate a Stripe Checkout session for a selected product
- The system should redirect the buyer to a confirmation page after a successful payment
- The system should allow a creator to add and edit their profile and product listings (admin-only, no public signup in v1)

## Data Requirements

- The system needs to store creator profile data: name, bio, and profile image URL
- The system needs to store product data: title, description, price, image URL, and associated creator
- The system needs to track Stripe product/price IDs linked to each product listing

## Non-Functional Requirements

- The storefront should be understandable to a new visitor within seconds — no instructions needed
- The checkout flow should use Stripe's hosted checkout page to keep payment handling secure and out of scope
- The project should be deployable to a public URL so creators can share their storefront link

## Out of Scope for the First Version

- This version will not include creator account registration or authentication
- This version will not track order history or send fulfillment notifications
- This version will not support digital file delivery after purchase
- This version will not include search, discovery, or multi-creator browsing
