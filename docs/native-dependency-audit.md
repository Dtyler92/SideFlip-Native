# Native dependency audit — 2026-08-09

Command: `npm audit --omit=dev --json`

## Result

- Critical: 0
- High: 11
- Moderate: 11
- Low: 0
- Total: 22

The advisory paths are through Expo/React Native build tooling: `@expo/cli`, Expo config/prebuild packages, Metro, `image-size`, `postcss`, `xcode`, and `uuid`. No advisory path originates from `posthog-react-native` or SideFlip application code.

The reported `image-size` and `postcss` issues require malicious build-time image/CSS/source-map input; `uuid` is reached by the Xcode project-file parser. They are not exposed as SideFlip network endpoints in the shipped app. npm proposes major Expo/React Native version changes, including Expo 57, rather than a compatible patch.

## Release decision

Do not force npm overrides or perform a major Expo/React Native upgrade inside the App Review rescue. That would create materially greater StoreKit/navigation/native-build regression risk. Treat the current findings as accepted build-pipeline risk for this rescue, with these controls:

- Builds use repository-controlled source/assets only.
- No untrusted CSS, source maps, Xcode project files, or images enter the build pipeline.
- EAS build access remains restricted.
- No critical advisory exists.
- Schedule a separately tested Expo/React Native upgrade after the App Review rescue.

## Remaining archive gate

PostHog is JavaScript-only in the generated iOS project and adds no CocoaPod. This Linux host cannot run CocoaPods, so inspect the merged `PrivacyInfo.xcprivacy` report from the first PostHog-enabled EAS archive before App Store submission.
