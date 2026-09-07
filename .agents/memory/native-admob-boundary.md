---
name: Native AdMob boundary
description: Platform constraint for Google Mobile Ads in this Expo project
---

The Google Mobile Ads SDK is native-only and must not be imported directly from a shared screen that is bundled for web. Keep the native implementation in a platform-specific module and provide a web stub with the same interface.

**Why:** Metro's web bundler follows shared imports and fails on native codegen modules before runtime platform checks can run.

**How to apply:** Put AdMob initialization and rewarded-ad creation behind the `.web`/native module resolver boundary; keep web behavior informational and require a native development/release build for real ads.