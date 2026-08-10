# SideFlip Android internal-test script

Use a dedicated synthetic SideFlip account and synthetic projects. Do not use production customer records.

## Installation and identity

- [ ] Install from Google Play Internal testing, not a locally sideloaded APK.
- [ ] Confirm Play Protect shows the expected app name and package `com.sideflip.app`.
- [ ] Confirm version name `1.0.0` and version code `1` in Play Console.
- [ ] Launch from a cold start and return from the background without a crash.

## Authentication and account lifecycle

- [ ] Sign up with a synthetic review email.
- [ ] Confirm email/login behavior and session persistence.
- [ ] Sign out and sign back in.
- [ ] Confirm Settings exposes Delete Account.
- [ ] Run the full deletion flow only on a disposable synthetic account; verify login no longer works and the app returns to authentication.

## Core project flow

- [ ] Create a project with explicit category selection.
- [ ] Enter purchase price and project metadata.
- [ ] Add, edit, and delete an expense, including labor time.
- [ ] Add a camera photo after granting camera permission.
- [ ] Add one or more images with the Android system photo picker.
- [ ] Verify Android never requests microphone or broad photo/media-library access.
- [ ] Close and reopen the app; verify project and photo references remain available.
- [ ] Mark the project sold and verify profit/ROI.
- [ ] Undo the sale and verify accounting state is restored.
- [ ] Delete the project through the accounting-safe path.

## Trade-Up Goals

- [ ] Create one active Goal on a Free account.
- [ ] Link a project and verify goal capital/progress.
- [ ] Sell the linked project and verify keep-in-goal/take-money-out behavior.
- [ ] Confirm the UI states that SideFlip tracks amounts only and does not hold or transfer sale money.

## Platform behavior

- [ ] Verify the Android back button does not trap or exit users unexpectedly.
- [ ] Verify keyboard actions remain reachable on project, expense, and sale forms.
- [ ] Verify edge-to-edge layouts do not place controls under system bars.
- [ ] Test a narrow phone and one larger Android layout.
- [ ] Test offline/error behavior without creating duplicate records.
- [ ] Confirm no Apple-only, App Store, StoreKit, or Stripe checkout copy is visible on Android.

## Pro entitlement and billing gates

Before Google Billing is implemented:

- [ ] A valid existing Pro entitlement may unlock Pro as consumption-only access.
- [ ] Android must not open Stripe/web checkout for digital Pro access.
- [ ] Android must not start a chargeable Google purchase until server verification is implemented.

After Google Billing is implemented:

- [ ] Monthly purchase succeeds with a Play license tester.
- [ ] Annual purchase succeeds with a Play license tester.
- [ ] Purchase is acknowledged only after server verification.
- [ ] Restore binds the purchase to the correct SideFlip account.
- [ ] Cross-account restore is rejected safely.
- [ ] Cancel, renewal, grace period, account hold, expiry, refund, and revoke transitions update entitlement correctly through RTDN.

## Release evidence

Record:

- Android device/model and OS version
- Play track and tester account
- AAB EAS build ID and Play version code
- Pass/fail for every item
- Screenshots using synthetic data only
- Any crash/ANR/log evidence

Do not promote beyond Closed testing until every production gate in `google-play-launch-checklist.md` passes.
