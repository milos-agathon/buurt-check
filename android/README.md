# Android Wrapper

This directory holds the Bubblewrap-generated Trusted Web Activity project for the Google Play build.

## Commands

- `npm install`
- `npm run android:manifest`
- `npm run android:sync`
- `npm run android:keygen`
- `npm run android:build`
- `npm run android:store-listing:phone` to regenerate `android/store-listing/01_search.png`

## Required env

- `BUURT_BASE_URL=https://app.buurt-check.nl`
- `BUURT_GOOGLE_PLAY_PACKAGE_NAME=nl.buurtcheck.app`
- `BUURT_GOOGLE_PLAY_PRODUCT_ID=full_dossier_unlock`
- `BUURT_ANDROID_KEYSTORE_PATH=./android/android-upload-key.jks`
- `BUURT_ANDROID_KEY_ALIAS=upload`
- `BUURT_ANDROID_KEYSTORE_PASSWORD=...`
- `BUURT_ANDROID_KEY_PASSWORD=...`

## Optional env

- `BUURT_ANDROID_ASSET_ORIGIN=http://127.0.0.1:4173`
- `BUURT_ANDROID_VERSION_CODE=1`
- `BUURT_ANDROID_VERSION_NAME=1`
- `BUURT_GOOGLE_PLAY_SERVICE_ACCOUNT_FILE=...`
- `BUURT_ANDROID_SKIP_PWA_VALIDATION=true`
- `BUURT_ANDROID_SKIP_SIGNING=true`

Set `BUURT_ANDROID_ASSET_ORIGIN` only when the production domain is not live yet and you need Bubblewrap to fetch the manifest and icons from a local preview server.
