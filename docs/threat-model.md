# Threat model

## Protected

- Financial records, policy details, notes, and attached documents at rest.
- Complete manual backups and Android structured-data snapshots.
- App content from casual access while the app is locked.

## Controls

- A random data-encryption key encrypts records and files with AES-256-GCM.
- Argon2id derives a key-encryption key from the app PIN; only the wrapped data key
  and versioned KDF parameters persist.
- The in-memory key is discarded on lock and after the configured background
  timeout.
- Unique nonces and authenticated record context prevent ciphertext substitution.
- Android has no network permission; CSP denies outbound web connections.
- CSP permits local WebAssembly compilation for Argon2id through
  `'wasm-unsafe-eval'`; ordinary JavaScript eval and remote scripts remain blocked.
- Logs and diagnostics never include plaintext business data or secrets.

## Boundaries

A six-character PIN can be guessed by a determined offline attacker despite a
memory-hard KDF. The UI recommends a longer passphrase. A compromised/rooted device,
malicious keyboard, screen capture, or modified operating system is outside the
guarantee. There is no server recovery: losing the PIN and all usable backups loses
the data.

Android's system backup is controlled by the OS and Google account. FinTrack only
creates an eligible encrypted snapshot after opt-in, requires client-side backup
encryption, and cannot truthfully report when the OS last uploaded it.
