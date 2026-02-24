# Beatport API v4: Obtaining an Access Token

CuePoint’s **inCrate** feature (Discover, charts, label releases) uses the [Beatport API v4](https://api.beatport.com/v4/docs/) with **OAuth2**. You need an **access token** and can optionally use a **refresh token** to get new access tokens when they expire.

**Where to set the token in CuePoint:** **Settings → inCrate → Beatport API token**, or the environment variable `BEATPORT_ACCESS_TOKEN` (overrides Settings).

---

## When do I know the token works?

- **In CuePoint:** The token is working when inCrate uses it successfully:
  - **Genres load** – On the inCrate page, the **Discover** section shows a list of genres (e.g. House, Techno). If the list is empty and you've set a token, the token may be missing, wrong, or expired.
  - **Discover returns results** – After you click **Discover** (with at least one genre selected and an imported inventory), the **Results** table fills with tracks from charts and new releases. If you get no results and your inventory has artists/labels, try checking the token or trying again later.
- **Quick check in Settings:** Use **Settings → inCrate → Test connection** (if available). It calls the API once (e.g. list genres or introspect) and shows "Token OK" or an error message so you don't have to run a full Discover to verify.

If the token is invalid or expired, you'll typically see empty genres, no Discover results, or an error in the UI or logs. Get a new token (or refresh it) and update Settings or `BEATPORT_ACCESS_TOKEN`.

---

## Quick start: “How do I get the token?”

You don’t look up an existing token—you **request API access** from Beatport, then **exchange** that for a token.

### 1. Request API access from Beatport

- Go to **[Beatport’s API key request form](https://accounts.beatport.com/developer/request-api-key)**.
- Fill out the form (e.g. app name, use case). Submit and wait for approval.
- When approved, Beatport will give you:
  - **Client ID** (and possibly **Client secret**), and
  - Any rules (e.g. which OAuth flows you’re allowed to use).

If you’re not approved yet or don’t have a client ID/secret, you can’t get a token until you do.

### 2. Get an access token using your credentials

After you have **Client ID** (and **Client secret** if they gave you one), use one of the flows below to get an **access token**:

- **If you have a Beatport account and a client secret:** Use the **User Password** flow (see [User Password Grant Flow](#user-password-grant-flow)): send `client_id`, `client_secret`, your Beatport `username` and `password`, and `grant_type=password` to the token URL. The response JSON will contain `"access_token": "..."`.
- **If you only have a client ID (e.g. public app):** Use the **Authorization Code** flow (see [Authorization Code Grant Flow](#authorization-code-grant-flow)): open the authorize URL in a browser, sign in and approve, then exchange the `code` you get for an access token.

### 3. Put the token in CuePoint

- Copy the **`access_token`** value from the JSON response (the long string).
- In CuePoint: **Settings → inCrate → Beatport API token** → paste it there and save.
- Or set the environment variable **`BEATPORT_ACCESS_TOKEN`** to that value.

The token usually expires after a while (e.g. `expires_in` in the response). When it stops working, repeat step 2 (or use the refresh token if you have one) and update CuePoint again.

---

## Prerequisites

- Never publicly share your **client secret**.
- **Browser / redirect flow:** Use the Authorization Code flow if you have no server (e.g. JavaScript app).
- **Server / CLI:** Use the secret-based flows (Password or Client Credentials) when you can keep the secret safe.

---

## Step 1: Obtaining an Access Token

### Authorization Code Grant Flow

Use this when you have a redirect URI (e.g. a simple local server or a “post-message” style page) and want to authorize in the browser.

1. Open in a browser (replace `<CLIENT_ID>` and `<REDIRECT_URI>` with your OAuth app values):

   ```
   https://api.beatport.com/v4/auth/o/authorize/?client_id=<CLIENT_ID>&response_type=code&redirect_uri=<REDIRECT_URI>
   ```

2. Click **Authorize** to accept the scope grants. A `code` will be returned to your redirect URI as a query parameter.

3. Exchange the grant `code` for an access token (form-encoded POST). Example with [HTTPie](https://httpie.io/):

   ```bash
   # -f = form-encoding
   http -f https://api.beatport.com/v4/auth/o/token/ \
     client_id=$CLIENT_ID \
     code=$CODE \
     grant_type=authorization_code \
     redirect_uri=https://api.beatport.com/v4/auth/o/post-message
   ```

### User Password Grant Flow

Use this when your OAuth application allows it and you have a Beatport username and password (e.g. for a desktop app or script).

```bash
CLIENT_ID="YOUR_CLIENT_ID"
CLIENT_SECRET="YOUR_CLIENT_SECRET"
USERNAME="YOUR_BEATPORT_USERNAME"
PASSWORD="YOUR_BEATPORT_PASSWORD"

http -f https://api.beatport.com/v4/auth/o/token/ \
  client_id=$CLIENT_ID \
  client_secret=$CLIENT_SECRET \
  username=$USERNAME \
  password=$PASSWORD \
  grant_type=password
```

### Client Credentials Grant Flow

Use this when the app only needs application-level access (no user context).

```bash
CLIENT_ID="YOUR_CLIENT_ID"
CLIENT_SECRET="YOUR_CLIENT_SECRET"

http -f https://api.beatport.com/v4/auth/o/token/ \
  client_id=$CLIENT_ID \
  client_secret=$CLIENT_SECRET \
  grant_type=client_credentials
```

### Access Token Response

A successful token response looks like:

```json
{
  "access_token": "YOUR_ACCESS_TOKEN",
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "expires_in": 36000,
  "scope": "...",
  "token_type": "Bearer"
}
```

Use the **`access_token`** value in CuePoint (Settings → inCrate → Beatport API token, or `BEATPORT_ACCESS_TOKEN`).

---

## Step 2: Using the Access Token

CuePoint sends the token in the `Authorization` header on every API request:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Example (introspect current user):

```bash
http https://api.beatport.com/v4/auth/o/introspect/ \
  "Authorization:Bearer $ACCESS_TOKEN"
```

---

## Step 3: Refreshing the Access Token

When `expires_in` has passed, use the refresh token to get a new access token (form-encoded POST):

```bash
http -f https://api.beatport.com/v4/auth/o/token/ \
  "Authorization:Bearer $ACCESS_TOKEN" \
  client_id=$CLIENT_ID \
  refresh_token=$REFRESH_TOKEN \
  grant_type=refresh_token
```

CuePoint currently does not auto-refresh; when the token expires, obtain a new one and update Settings or `BEATPORT_ACCESS_TOKEN`.

---

## Step 4: Revoking the Access Token

To revoke a token:

```bash
http -f POST "https://api.beatport.com/v4/auth/o/revoke/?client_id=$CLIENT_ID&token=$ACCESS_TOKEN"
```

---

## Error codes (summary)

- **404 Not Found** – Resource does not exist or you don’t have access; body often `{"detail": "Not found."}`.
- **400 Bad Request** – Invalid filter/value (e.g. wrong type for `id`); body describes the error.
- **403 Forbidden** – Not allowed to perform the action; body may include `"detail": "You do not have permission to perform this action."`.
- **401 Unauthorized** – Invalid or expired token; get a new access token (or refresh) and update CuePoint.

---

## References

- [Beatport API v4 docs](https://api.beatport.com/v4/docs/)
- inCrate design: [incrate-02-beatport-api.md](incrate-02-beatport-api.md)
