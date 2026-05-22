# Self-Signed Certificates

By default, Sonixd Redux verifies the SSL/TLS certificate of your server against your system's trust store. If your server uses a certificate signed by a recognised Certificate Authority (CA) - including a private CA that you have imported into your OS - the connection will work without any additional configuration.

If your server uses a self-signed certificate that is not in your system trust store, connections will fail. The **Accept self-signed certificates** toggle on the login screen allows you to bypass certificate verification in that situation.

---

## What this toggle does

When enabled, certificate verification is disabled for all three network stacks that Sonixd Redux uses:

| Stack                                     | What it covers                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **API calls (Chromium)**                  | All requests to the Subsonic or Jellyfin API: library browsing, playback control, scrobbling, bookmarks, etc. |
| **Audio streaming (Chromium)**            | The actual audio stream delivered to the player                                                               |
| **Cover art and song caching (Chromium)** | Background downloads of cover images and songs to the local cache                                             |

All three stacks use Electron's Chromium-based network module, which means the OS certificate store is used on all platforms (Windows, macOS, Linux). The toggle applies consistently across all of them.

---

## Security implications

**The connection is still encrypted.** Disabling certificate verification does not remove TLS encryption - your traffic is still protected in transit. This is not equivalent to using plain HTTP.

What certificate verification provides is **identity assurance** - a guarantee that the server you are connecting to is actually your server. Without it:

- **No identity verification** - there is no way to confirm that the server you are connecting to is actually your server. Any machine on your network could present a certificate and Sonixd Redux would accept it.
- **Susceptible to man-in-the-middle attacks** - on an untrusted network, a third party could intercept your connection, present their own certificate, and transparently forward your traffic without you knowing. The data would still be encrypted between you and the attacker, but the attacker could read it.

In practice, on a trusted home network, this risk is low. On a public or untrusted network it is a real concern.

For these reasons, **only enable this toggle if you are certain you signed the certificate that the server is using, and you trust your network**.

The recommended approach is to avoid self-signed certificates entirely by setting up a private CA, signing your server certificate with it, and importing the CA into your system trust store. This gives you the security benefits of certificate verification without needing to disable it. Sonixd Redux automatically picks up CA certificates from the system trust store on all platforms.

---

## How to use it

1. On the login screen, check **Accept self-signed certificates**
2. A warning message will appear - read it and confirm you understand the implications
3. Connect to your server as normal
4. To disable it later, disconnect from your server (Settings → Disconnect), uncheck the toggle, and reconnect

---

## Settings export and import

The **Accept self-signed certificates** setting is intentionally excluded from settings exports and ignored on import. This prevents the following scenario: a user exports settings from a machine where a self-signed certificate was necessary, then imports them on a machine connected to a server with a properly signed certificate - silently disabling certificate verification where it is not needed.

Because of this, you will need to re-enable the toggle manually on each machine where it is required.
