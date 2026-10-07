# Vendored libraries

- `stellar-sdk-16.3.1.min.js`: [@stellar/stellar-sdk](https://github.com/stellar/js-stellar-sdk) 16.3.1 browser build (`dist/stellar-sdk.min.js`), Apache-2.0. Served from this site so the live page depends on no third-party CDN.
- `stellar-wallets-kit-2.6.0.min.js`: [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit) 2.6.0 (MIT), bundled with esbuild from `@creit.tech/stellar-wallets-kit` with its default wallet modules (Freighter, xBull, Albedo, Lobstr, Hana, Rabet and others). Exposes `window.ScopeWallets`. Used to sign SEP-53 claims from a browser wallet.
