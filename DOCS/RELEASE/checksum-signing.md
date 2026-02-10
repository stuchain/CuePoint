# Signing the Checksum File with GPG

A simple, step-by-step guide to signing `SHA256SUMS` so users can verify that release files were not tampered with. **Optional**—if you don’t use GPG, releases still work; only the checksum file is unsigned.

---

## What you need

- **GPG** installed on your machine.  
  - Windows: [Gpg4win](https://www.gpg4win.org/) or `winget install GnuPG.GnuPG`  
  - macOS: `brew install gnupg`  
  - Linux: usually preinstalled; if not, `sudo apt install gnupg` or equivalent  
- About **10 minutes** for one-time setup.

---

## Part 1: One-time setup (create and publish your key)

Do this once. After that, you only sign files (or let CI do it).

### Step 1.1: Create a GPG key

Open a terminal and run:

```bash
gpg --full-generate-key
```

You will be asked:

1. **Key type**  
   Press **Enter** to accept the default (RSA and RSA), or choose **1** for RSA (sign only).

2. **Key size**  
   Enter **4096** (recommended) or **3072**, then Enter.

3. **Expiration**  
   Enter **0** for no expiry, or a number of days (e.g. **365** for one year), then Enter.

4. **Your name**  
   Example: `CuePoint Releases`

5. **Email**  
   Use a real or project email, e.g. `releases@yourproject.org`

6. **Comment**  
   Optional; you can leave it blank (Enter).

7. **Passphrase**  
   Enter a strong passphrase twice. You will need it when signing (and for CI if you use a passphrase).

When it finishes, you’ll see a line like:

```
pub   rsa4096 2026-02-01 [SC]
      ABCD1234EF5678901234567890ABCD1234EF567890
uid           [ ultimate ] CuePoint Releases <releases@example.org>
```

The **key ID** is the last 16 characters of the long hex line: `1234567890ABCD12` (or use the full fingerprint). You’ll use this key ID in the next steps.

### Step 1.2: Find your key ID (if you didn’t note it)

Run:

```bash
gpg --list-secret-keys --keyid-format=long
```

You’ll see something like:

```
sec   rsa4096/3AA5C34371567BD2 2026-02-01 [SC]
```

The part after `rsa4096/` is your **key ID**: `3AA5C34371567BD2`. Use this whenever the guide says `YOUR_KEY_ID`.

### Step 1.3: Export your public key (so users can verify)

Replace `YOUR_KEY_ID` with your key ID from step 1.2:

```bash
gpg --armor --export YOUR_KEY_ID > release-signing-key.asc
```

Example:

```bash
gpg --armor --export 3AA5C34371567BD2 > release-signing-key.asc
```

This creates a file `release-signing-key.asc` (text starting with `-----BEGIN PGP PUBLIC KEY BLOCK-----`).

**Publish this file** so users can import it once:

- Add it to your repo (e.g. in `docs/` or project root), or  
- Put it on your website or in release notes.

Users only need to import it **once**; after that they can verify any future release signed with the same key.

---

## Part 2: Signing the checksum file

You sign the file **SHA256SUMS** (the list of checksums for the release). The result is **SHA256SUMS.asc** (the signature). Both are published with the release.

### Option A: Sign on your own computer (manual release)

1. Make sure **SHA256SUMS** exists in the current folder (CI normally generates it; for a manual release you can generate it with `scripts/generate_checksums.py`).

2. Sign it (replace `YOUR_KEY_ID` with your key ID):

   ```bash
   gpg --detach-sign --armor --local-user YOUR_KEY_ID SHA256SUMS
   ```

   You’ll be prompted for your key passphrase.  
   This creates **SHA256SUMS.asc** in the same folder.

3. Or use the project script (no need to type the key ID if you have only one signing key):

   ```bash
   python scripts/sign_checksums.py SHA256SUMS
   ```

4. Upload both **SHA256SUMS** and **SHA256SUMS.asc** to the GitHub release.

### Option B: Let CI sign (recommended)

If you add your private key to GitHub as a secret, the release workflow will sign **SHA256SUMS** for you and upload **SHA256SUMS.asc**. See **Part 4** below.

---

## Part 3: How users verify the release

This is for **users** (or you testing). They need: the release files, **SHA256SUMS**, **SHA256SUMS.asc**, and your **release-signing-key.asc**.

### Step 3.1: Import your public key (once per machine)

```bash
gpg --import release-signing-key.asc
```

Expected: a line like `gpg: key XXXXX: public key "Your Name <email>" imported`.

### Step 3.2: Verify the signature on SHA256SUMS

```bash
gpg --verify SHA256SUMS.asc SHA256SUMS
```

**Good output** looks like:

```
gpg: Signature made ...
gpg:                using RSA key ...
gpg: Good signature from "CuePoint Releases <releases@example.org>"
```

If you see **"Good signature"**, the checksum file was signed by you and was not changed.

**Bad output** (e.g. "BAD signature" or "signature verification failed") means the file was modified or the wrong key was used—do not trust it.

### Step 3.3: Check that release files match the checksums

**Linux / WSL:**

```bash
sha256sum -c SHA256SUMS
```

**macOS:**

```bash
shasum -a 256 -c SHA256SUMS
```

**Windows (PowerShell):**  
You can check manually: for each line in SHA256SUMS, run `Get-FileHash -Algorithm SHA256 <file>` and compare the hash.

If all lines report "OK" (or hashes match), the downloaded files match what you signed.

---

## Part 4: Let CI sign (GitHub Actions)

So that every release is signed automatically:

### Step 4.1: Export your private key (armored)

On your machine (where you created the key), run (replace `YOUR_KEY_ID` with your key ID):

```bash
gpg --armor --export-secret-keys YOUR_KEY_ID
```

You’ll be asked for your key passphrase.  
The command **prints** the key to the terminal. It looks like:

```
-----BEGIN PGP PRIVATE KEY BLOCK-----
... many lines ...
-----END PGP PRIVATE KEY BLOCK-----
```

**Copy the entire block** (including the BEGIN and END lines).  
Do not save it in a file in the repo or share it; you’ll paste it into a GitHub secret.

### Step 4.2: Add GitHub secrets

1. Open your repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**:
   - **Name:** `GPG_PRIVATE_KEY`  
   - **Value:** paste the full private key block from step 4.1.
3. If your key has a passphrase, add another secret:
   - **Name:** `GPG_PASSPHRASE`  
   - **Value:** the passphrase for that key.  
   **How to know?** You set a passphrase when you created the key (you typed it twice). If you left it blank (pressed Enter twice), you don’t have one—skip this secret. To check: run `gpg --detach-sign --armor SHA256SUMS`; if it asks “Enter passphrase:”, you have one.

If you don’t set `GPG_PRIVATE_KEY`, the release workflow will **not** sign; it will only publish **SHA256SUMS** (no **SHA256SUMS.asc**).

### Step 4.3: What the release workflow does

When you create a release (e.g. by pushing a tag `v1.0.0`):

1. The workflow generates **SHA256SUMS** from the release artifacts.
2. If **GPG_PRIVATE_KEY** is set, it imports the key and runs the sign script to create **SHA256SUMS.asc**.
3. It creates the GitHub release and uploads the assets.
4. If **SHA256SUMS.asc** was created, it uploads that file to the same release.

So after a release, the release page will have **SHA256SUMS** and, if you configured the secret, **SHA256SUMS.asc**.

---

## Troubleshooting

| Problem | What to do |
|--------|------------|
| **"gpg: command not found"** | Install GPG (see “What you need” at the top). |
| **"No secret key"** when signing | Use `--local-user YOUR_KEY_ID` and make sure the key ID is correct (`gpg --list-secret-keys`). |
| **"Bad passphrase"** | The passphrase is wrong, or you’re not being prompted (e.g. in CI). In CI, set the **GPG_PASSPHRASE** secret. |
| **"Can't check signature: No public key"** (when verifying) | Import the public key first: `gpg --import release-signing-key.asc`. |
| **CI doesn’t create SHA256SUMS.asc** | Check that **GPG_PRIVATE_KEY** is set and that the pasted key includes the BEGIN/END lines and has no extra spaces or missing lines. |
| **Signature verification failed** | The file was changed after signing, or you’re using a different key. Re-download SHA256SUMS and SHA256SUMS.asc from the release. |

---

## Quick reference

| Task | Command |
|------|--------|
| Create key | `gpg --full-generate-key` |
| List key ID | `gpg --list-secret-keys --keyid-format=long` |
| Export public key | `gpg --armor --export YOUR_KEY_ID > release-signing-key.asc` |
| Sign SHA256SUMS | `gpg --detach-sign --armor --local-user YOUR_KEY_ID SHA256SUMS` |
| Or use script | `python scripts/sign_checksums.py SHA256SUMS` |
| Verify (user) | `gpg --verify SHA256SUMS.asc SHA256SUMS` |
| Check checksums (Linux) | `sha256sum -c SHA256SUMS` |
| Check checksums (macOS) | `shasum -a 256 -c SHA256SUMS` |

---

## See also

- [Key management](key-management.md) — where to store keys, rotation.
