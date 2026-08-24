# SideFlip Google Play launch checklist

## Current build identity

- App: SideFlip
- Android package: `com.sideflip.app`
- Initial version: `1.0.0`
- Internal-test candidate version code: `2`
- Expo project: `@dtyler92/sideflip`
- EAS project ID: `5a788085-4849-4264-a346-e459e1bd005d`
- Release branch: `release/android-1.0.0`
- Android worktree: `/root/sideflip-android-1.0.0`
- Build format: Android App Bundle (`.aab`)
- Target SDK: Expo SDK 54 targets Android 16 / API 36

## Create the Play Console app

From Play Console Home, choose **Create app** and use:

- App name: **SideFlip: Project Ledger**
- Default language: **English (United States) – en-US**
- App or game: **App**
- Free or paid: **Free**
- Confirm the developer-program and export-law declarations, then create the app.

The app is free to install even though optional Pro subscriptions will be offered later through Google Play Billing.

## First-track sequence

1. Create the app record.
2. Complete Android developer/account verification if Play Console shows it as pending.
3. Upload the signed AAB to **Internal testing** first.
4. Verify install, authentication, photo picker/camera, project CRUD, expense flow, Goals, account deletion, privacy-safe analytics preference, and existing Pro entitlement access on a physical Android device.
5. Move a validated candidate to **Closed testing**.
6. If Play Console applies the new-personal-account gate, keep at least 12 opted-in testers continuously enrolled for 14 days, then apply for production access.
7. Do not promote to production until Google Billing purchase/restore/server verification and Real-time Developer Notifications are complete.

Official testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465

## App-content forms

- Privacy policy: `https://sideflip.org/privacy`
- Support: `https://sideflip.org/support`
- Ads: **No**
- App category: **Finance** or **Business/Productivity** (choose the closest available Play category after viewing current choices)
- Target audience: adults; do not target children
- App access: login is required for core functionality; provide a dedicated review account before review
- Content rating: answer based on the actual app; SideFlip has no violence, gambling, sexual content, or user-to-user social content
- Financial features: SideFlip records costs/profit only; it does not hold, transfer, or process item-sale money

## Account deletion gate

Google requires both:

1. Discoverable in-app deletion — already implemented in authenticated Settings.
2. A public web URL entered in Data safety where a user can initiate account deletion without reinstalling the app.

`https://sideflip.org/support` is not sufficient by itself unless it contains a clear, working deletion-initiation flow. Add and verify a dedicated public deletion page before production submission.

Official requirement: https://support.google.com/googleplay/android-developer/answer/13327111

## Data safety inventory

Reconcile the final form with code and the live privacy policy. Expected categories include:

- Account information: email and user ID
- User content: project text, photos, receipts, goals
- Financial information: user-entered purchase prices, expenses, sale prices, and profits (record keeping only)
- Purchase history/subscription state
- App interactions and diagnostics/analytics when the user enables analytics
- Device or pseudonymous identifiers used by enabled analytics

Receipt images are sent to Anthropic for user-requested extraction. PostHog processing and the in-app opt-out must match the live policy and Data safety answers. SideFlip does not sell data or use it for cross-app advertising.

## Photo-permission policy

The Android build uses the system photo picker for user-selected images and requests camera permission only when taking a new photo. It blocks broad media/storage access and microphone permission.

Official policy: https://support.google.com/googleplay/android-developer/answer/14115180

## Google Play subscriptions — not enabled yet

Do not expose a chargeable Android purchase until all of these are complete:

- Create Google Play subscriptions/base plans for monthly `$12.99` and annual `$99.99` pricing.
- Add platform-specific Google product IDs to the native catalog.
- Implement Google purchase requests with the Play offer token.
- Send the purchase token, package name, and product ID to an authenticated SideFlip server endpoint.
- Verify subscription state server-side with Google Play Developer API `purchases.subscriptionsv2.get`.
- Bind a verified purchase token to one SideFlip user and reject cross-account restores.
- Persist a normalized `google` entitlement and preserve valid Apple/Stripe access.
- Acknowledge/finalize only after successful server verification.
- Implement Google Real-time Developer Notifications through Cloud Pub/Sub.
- Apply lifecycle ordering, replay protection, cancellation/expiry/refund/hold/grace handling, deletion tombstone suppression, and analytics outbox behavior equivalent to Apple/Stripe.
- Add Restore Purchases and Google Play subscription-management copy.
- Test purchases with Play license testers on a closed/internal track.

Official billing lifecycle: https://developer.android.com/google/play/billing/lifecycle/subscriptions

## Store listing assets still needed

- 512×512 high-resolution app icon
- 1024×500 feature graphic
- At least two real Android phone screenshots; prepare 6–8 showing onboarding, project list, project detail/expenses, photo workflow, profit result, and Trade-Up Goal
- Short description (80 characters maximum)
- Full description
- Contact email and support URL

Store listing assets must show actual Android behavior and must not advertise unimplemented Google subscription purchasing.

Official preview-asset guide: https://support.google.com/googleplay/android-developer/answer/9866151

## Production release gate

- [ ] Play Console app record created
- [ ] Developer verification complete
- [ ] Signed AAB uploaded and install-tested
- [ ] Physical Android workflow test passed
- [ ] 12-tester / 14-day gate completed if required
- [ ] Google Billing purchase and restore pass with license testers
- [ ] Backend verification and RTDN pass replay/lifecycle tests
- [ ] External account-deletion URL live and verified
- [ ] Data safety matches app, PostHog, Anthropic, and privacy policy
- [ ] Store listing/assets complete
- [ ] Independent security/compliance review passes
- [ ] User explicitly approves production rollout
