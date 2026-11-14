# Reaching DSH from your phone: Cloudflare Tunnel + Access

[한국어](setup-cloudflare.md)

This setup lets your phone reach DSH on this Mac from anywhere. The gateway listens only inside the Mac (`127.0.0.1:3090`); outside requests go through Cloudflare, and only people who sign in get through.

```text
phone ──https──▶ Cloudflare Access (sign-in) ──▶ named tunnel ──▶ this Mac 127.0.0.1:3090
```

To let an AI tool do it for you, use the kit's [AI install guide](../../../docs/install-with-ai.md). The steps below are for doing it by hand.

## What you need

- A Cloudflare account and a domain connected to Cloudflare (for example `example.com`)
- `cloudflared` on this Mac. If it is missing, install it with `brew install cloudflared`.
- One address for your phone, for example `dsh.example.com`

## 1. Create the tunnel

Pick one of the two ways. Both end up the same.

### Option A: command line (fastest)

```bash
cloudflared tunnel login
```

A browser opens. Sign in to Cloudflare and pick the domain. Then:

```bash
cloudflared tunnel create dsh-handheld
```

```bash
cloudflared tunnel route dns dsh-handheld dsh.example.com
```

Save the tunnel token straight to a file without showing it on screen:

```bash
(umask 077 && mkdir -p ~/.dsh/dsh-handheld && cloudflared tunnel token dsh-handheld > ~/.dsh/dsh-handheld/tunnel-token)
```

For a tunnel made this way, the plugin passes the gateway address (`--url http://127.0.0.1:3090`) itself. Nothing else to configure.

### Option B: Cloudflare dashboard

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. Type **Cloudflared**, name `dsh-handheld`
3. In the install command shown, the long value after `--token` is the **tunnel token**. Copy it, but do not run the install command (the plugin runs cloudflared itself). You enter the token in step 3.
4. Add a **Public hostname**
   - Subdomain `dsh`, Domain `example.com`
   - Service: `HTTP` · `127.0.0.1:3090`

## 2. Create the Access application (Cloudflare dashboard)

1. **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. Application domain: `dsh.example.com` (leave the path empty)
3. Policy: **Allow**, Include → **Emails** → the email you will sign in with on your phone
4. Open the app's **Overview** and copy the **Application Audience (AUD) Tag**.
5. Your team domain is `<team>.cloudflareaccess.com`, shown near the top of **Settings** → **Custom pages** or in the sign-in address.
6. (Recommended) Turn on passkeys or one-time codes as the sign-in method. A session length of about 24 hours works well on a phone.

## 3. Enter the values on this Mac

From the kit folder, run the setup helper:

```bash
node plugins/handheld/scripts/configure.mjs
```

It asks for the phone address, team domain, AUD tag, allowed emails and tunnel token, in that order. The tunnel token is typed without being shown and saved to `~/.dsh/dsh-handheld/tunnel-token` (readable only by you). If you already saved it with option A, leave the token blank.

You can also set everything in one line without questions. The tunnel token file is left as it is:

```bash
node plugins/handheld/scripts/configure.mjs --origin https://dsh.example.com --team myteam.cloudflareaccess.com --aud <AUD tag> --emails me@example.com
```

Then restart DSH Desktop.

## 4. On your phone

1. Open `https://dsh.example.com/h/` in the phone's browser and sign in with Access.
2. **Add it to the home screen.**
   - iPhone: Safari share button → Add to Home Screen. Notifications need iOS 16.4 or later and only arrive when you open the app from the home-screen icon.
   - Android: Chrome menu → Install app
3. Open it from the home-screen icon and tap **설정 (Settings) → 알림 켜기 (Turn on notifications) → 시험 알림 (Test notification)**. One switch covers both approval requests and questions. The phone app's screens are in Korean.

## Check that it works

- `curl -sI https://dsh.example.com/h/` returns `302` and points to a `cloudflareaccess.com` sign-in address.
- Open a session on the phone and send a message; it should appear in DSH on the Mac.
- Ask DSH to write a file outside the workspace folder; an approval request notification arrives on the phone.

## Safety

- The gateway checks the sign-in token (JWT) that Access signs. Requests with no token, a token for another app, or an email that is not allowed are refused. If the Access settings are empty, every outside request is refused.
- Write requests (sending messages, approvals) and live connections must come from the phone address you configured (Origin check).
- Approvals are sent only when a person taps them on the phone. The allow and deny buttons in Android notifications are taps by a person too.
- The tunnel token and the notification signing key are stored in `~/.dsh/dsh-handheld/`, readable only by you (0600), and never written to logs.

## Turning it off

- Outside access only: set `"tunnel": false` in `~/.dsh/dsh-handheld/config.json` and restart Desktop, or delete the tunnel in Cloudflare.
- The whole plugin: turn off or remove the 휴대폰 작업 공간 (Phone workspace) card in DSH's plugin screen.
