# Kyro Chat — Welcome / Onboarding Page

Animated introductory slideshow for Kyro Chat (HTML, CSS, vanilla JS).

## What’s included

- `index.html` — 7-slide welcome experience
- `styles.css` — dark theme, transitions, responsive layout
- `app.js` — auto-advance, dots, swipe, keyboard, skip
- `signup.html` / `login.html` — working auth (OTP + profile photo)
- `app.html` — main chat screen after login
- `js/kyro.js` — API client for `https://chat-backend-tnii.onrender.com`
- `images/` — generated illustrations

## Slides

1. Welcome to Kyro Chat  
2. Enhanced privacy  
3. Groups & communities  
4. Enhanced security  
5. Seamless calls  
6. Founders — Vael Tech & Jose Grid (frontend + backend repos)
7. Join today (Create account + Login)

## How it works

- Each slide auto-advances after **6.5 seconds**
- Progress bar, dots, arrows, swipe, and arrow keys all work
- Last slide stops auto-play and shows the two buttons
- Skip jumps straight to the join screen
- Buttons go to `signup.html` and `login.html`
- If a session already exists, welcome is skipped and `app.html` opens
- Logout clears the session and returns to login (next login asks for OTP)

## Auth + backend

Backend: `https://chat-backend-tnii.onrender.com`

- Register: `POST /api/auth/register` with `firstName`, `lastName`, `email`, `password`, `phone`
- OTP: `POST /api/auth/verify-otp` `{ email, otp }` and `POST /api/auth/resend-otp` `{ email }`
- Login: `POST /api/auth/login` `{ email, password }`
- Session: `GET /api/auth/me` with `Authorization: Bearer <token>`
- Chat: `GET /api/chats`, `GET /api/users/lookup`, `GET /api/messages/:id`, `POST /api/messages`

## Preview locally

Open `index.html` in a browser, or from this folder:

```bash
npx serve .
```

## Serve from your Node.js app on Render

Put this folder in `public/` (or `client/`) and serve static files:

```js
const path = require("path");
const express = require("express");
const app = express();

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Kyro Chat running on " + port));
```

Then point the signup/login forms at your MongoDB routes, for example:

- `POST /api/auth/signup`
- `POST /api/auth/login`

## Customize

- Slide timing: change `SLIDE_MS` in `app.js` and `--slide-ms` in `styles.css`
- Copy: edit text in `index.html`
- Colors: CSS variables at the top of `styles.css`

## Added features

- **Clickable links** — `http(s)://` and `www.` URLs in messages are tappable (`js/rich.js`)
- **@mentions** — in groups, type `@` to pick a member; mentions are highlighted, and messages that mention you get an outline
- **Voice notes** — waveform, tap-to-seek, 1x / 1.5x / 2x speed, one note plays at a time (`js/rich.js`)
- **App lock** — 4-digit PIN (Settings > Privacy and safety). Locks on open and after the chosen time in the background; 5 wrong tries triggers a timeout; "Forgot PIN" logs out (`js/lock.js`)

## Kyro extras (polish layer)

All additive. Files: `kyro-extras.css`, `js/extras.js`, `manifest.webmanifest`, `sw.js`. Remove the 3 hook lines in `app.html` to turn them off.

- **Accent colours** — Aurora, Ember, Mint, Rose, Mono (Account tab). Recolours buttons, sent bubbles, highlights
- **Look polish** — grouped bubbles, accent hairline under headers, pill tab indicator, press feedback, slim scrollbars
- **Emoji bursts** — a live emoji-only message (🎉 🥳 🔥 ❤️ 💜 🎂 💯) fires a burst
- **Offline banner** — shows when the connection drops and when it returns
- **Install app** — manifest, icons and a network-first service worker (install card in Account)
- **Haptics** — light vibration on tabs, + and send

## Chat extras (drafts, forward, stickers)

Files: `kyro-chat-extras.css`, `js/chat-extras.js` (two hook lines in `app.html`).

- **Drafts** — unsent text is saved per chat, restored when you reopen it, and shown as "Draft: …" in the chat list
- **Forward** — the Forward action now has search and multi-select ("Send to 3 chats"); groups are included
- **Stickers** — smiley button in the composer; Reactions and Vibes packs plus Recent. Stickers are 240×240 PNGs sent as normal image messages, so no backend change is needed
- **Group files** — videos and documents can now be sent in groups (and forwarded to them). Groups send one copy per member, so the limit is 10 MB for groups of 3 or fewer and shrinks as the group grows (30 MB total upload budget)

## Pins and polls

Files: `kyro-pinpoll.css`, `js/pin-poll.js` (two hook lines in `app.html`). **Needs the updated backend** (`routes/polls.js`, pin routes in `routes/chats.js`).

- **Pinned messages** — long-press a message, then Pin. A banner shows at the top of the chat (up to 3 pins; tap to jump, × to unpin). In one-to-one chats pins are shared with the other person; in groups they are saved on this device only
- **Polls in groups** — the bar-chart button in a group's composer. 2-6 options, optional multiple answers, live results, creator can close it. Members see the poll in their chat with the sender and vote from there

## Link previews, folders, quick replies

Files: `kyro-more.css`, `js/more-extras.js` (two hook lines in `app.html`). Link previews need the updated backend (`routes/links.js`).

- **Link previews** — a title, description and picture card under the first link in a message. On by default; switch it off in Account. The server fetches the page (private addresses are blocked), so turn it off if you share private links
- **Chat folders** — long-press a chat and choose Folder (long-press a group row too). Folder chips with unread counts appear next to All/Unread/Pinned/Archived. Folders are saved on this device
- **Quick replies** — the Replies tab in the sticker panel, or type `/` in the message box to see matching replies. Add and delete your own (up to 20)

## Profile polish

File: `kyro-profile.css` (one hook line in `app.html`, CSS only). Same look as before, with:
a soft glow behind the avatar, a slowly turning gradient ring, staggered rise-in of the profile
and its cards every time the tab opens, light-sweep on Edit profile, springy accent swatches, and
accent colours that cross-fade instead of snapping. Respects "reduce motion".

## Disappearing messages and view once

Files: `kyro-vanish.css`, `js/vanish.js` (two hook lines in `app.html`). View once needs the updated backend.

- **Disappearing messages** — clock button in the chat header opens a picker: Off, 5 minutes, 1 hour, 24 hours, 7 days, 30 days, 90 days (one-to-one chats). A small badge shows the active timer and each message shows a countdown
- **View once** — tap the dashed "1" button in the composer, then attach a photo or video (one-to-one chats). The receiver sees a card, taps it, and the file opens full screen once. The server wipes the file in the same step, so it can't be fetched again. The sender sees "Opened" when they have looked. View-once messages can't be forwarded and don't appear in the media gallery

## Redesign

File: `kyro-redesign.css` (one `<link>` in `app.html`, `login.html`, `signup.html`, `index.html`; CSS only). A modern, rounded, floating look with all colours unchanged.
Floating glass tab bar, squircle avatars and buttons, card-style chat rows with a purple edge on unread chats, pill filter chips, a single floating pill composer with a round send button, springy bubbles, grabber-style bottom sheets with blurred backdrops, and a glass sign-in card. Remove the `<link>` lines to go back to the previous look.

## Groups fix

Files: `kyro-groups.css`, `js/groups-fix.js` (two hook lines in `app.html`).

- **Add members from everyone you know** — the group picker and the manage-members list now show saved contacts and people you already chat with (before: saved contacts only, so it was often empty). Search appears when the list is long; you must pick at least one person
- **Members already in a group are never dropped** when you save the list
- **Group info** — tap the group's name inside the chat to see who is in it and (as an admin) add or remove members. The header shows the member count
- The tiny "+" on group rows is now a clear "add people" icon

## Polish pass

Files: `kyro-polish.css`, `js/polish.js` (two hook lines in `app.html`). Visual and feel only, no data changes.
A slow-moving purple and cyan glow behind the chat list, a header that shrinks smoothly as you scroll, the mic button turning into Send when you type (and back), pull-to-refresh on the chat list, and a softer scroll-to-bottom button.

## Ticks and swipe actions

Files: `kyro-ticks-swipe.css`, `js/ticks.js`, `js/swipe.js` (hook lines in `app.html`). Real "delivered" needs the updated backend (`realtime.js`).

- **Ticks** — drawn marks on your own messages: a pulsing clock while sending, one tick when sent, two ticks when delivered (the other person's app is online and has it), and two bright glowing white ticks with a small pop when they have seen it
- **Swipe actions** — swipe a chat right to pin or unpin; swipe left to reveal Mute and Archive (swipe all the way to archive at once). Uses the app's existing pin, mute and archive lists

## Design v2 (full UI refresh)

Files: `kyro-design.css`, `js/design.js` (linked last in `app.html`; the CSS is also linked in `index.html`, `login.html`, `signup.html`). Remove those link/script lines to go back to the previous look. One small edit in `js/ticks.js` (tick marks now work when time and ticks are grouped).

- **Chat list** — flat rows with inset hairlines, round avatars (groups are rounded squares), accent unread pills, pin and mute icons, instant search, filter chips with counts. The per-row call button moved to the chat header.
- **Header** — compact title, always-visible search, and a ⋮ menu (New group, Add contact, Starred, Settings, Log out).
- **Account** — a proper settings list with icon tiles (Edit profile, Appearance, Settings, Wallpaper, Starred, Blocked) and a Log out row. All rows trigger the existing features.
- **Chat** — grouped bubbles with time and ticks inside, date pills, a ⋮ menu for chat search and disappearing messages, a calm floating composer.
- **Navigation** — slimmer floating bar, accent pill on the active tab, unread badge beside the Chats icon.
- **Desktop (960px+)** — two panes: chat list on the left, conversation on the right.
- **Light theme, focus rings, reduced motion** respected. Sign in and Create account use the same inputs, buttons and logo mark.

## Smooth layer

Files: `kyro-smooth.css`, `js/smooth.js` (linked last in `app.html`). Motion and performance only. Remove those two lines to undo.

- **Chat open and close** slides in from the right and slides back out (phones and tablets); the chat list eases back behind it
- **Sheets and dialogs** (plus menu, add contact, create group) fade and rise on open and close, instead of vanishing
- **No replays** — the chat list stagger plays once on first load (not on every refresh), and only a newly arrived bubble pops in, not the whole history
- **Tabs** use a single short fade
- **Lighter glow** — soft gradients instead of heavy blur filters; the animation pauses when a chat covers it or the tab is hidden
- **Swipe back** — drag from the left edge of a chat and it follows your finger; release past a third of the screen (or flick) to go back
- **Touch** — no tap delay or grey tap flash, buttons ease instead of snapping, avatars and images fade in

## Skeleton upgrade

Files: `kyro-skeleton.css`, `js/skeleton.js` (hook lines in `app.html`). Remove them to undo. The app already showed grey placeholders for the chat list and messages; this makes them smoother and covers more.

- **Smoother shimmer** — drawn as a moving overlay (GPU) instead of animating the background, so it stays fluid while the page is busy
- **Slow-server note** — if placeholders are still showing after 4 seconds (the free server waking up), a small line explains the wait
- **More places** — the blocked contacts list and gallery now show placeholders instead of plain "Loading..." text

## Double-tap to react

Files: `kyro-doubletap.css`, `js/double-tap.js` (hook lines in `app.html`). Remove them to undo.

- **Double-tap a message** (or double-click on desktop) to add a heart; double-tap again to remove it. A big heart pops over the message with a light vibration
- Uses the app's own reaction code, so it syncs exactly like picking a reaction from the long-press menu
- One-to-one chats only (same as reactions today). Links, voice notes and buttons inside a message are ignored, so they still work normally

## Stickers plus

Files: `kyro-stickers-plus.css`, `js/stickers-plus.js` (hook lines in `app.html`). Remove them to undo. Plugs into the existing sticker picker; the built-in packs are untouched.

- **Three more packs** — Mood, Chat and Fun (12 stickers each). Stickers you send from them also show up in Recent
- **Make tab** — design your own: pick an emoji, type up to 16 characters of text, choose Classic (white outline) or a coloured tile, preview it live, then send
- Same format as the built-in stickers (240x240 PNG sent as an image message), so no backend change and the other person sees them as normal stickers
- The tab row now scrolls sideways when it gets long

## Message sounds and unread divider

Files: `js/sounds.js`, `kyro-unread.css`, `js/unread-divider.js` (hook lines in `app.html`). Remove them to undo. No backend change.

- **Message sounds** — a soft tick when you send and a two-note pop when a message arrives, with a short vibration on arrival. Two new switches under Settings > Notifications: "Message sounds" and "Vibrate on new message" (both on by default). Muted chats stay silent, and loading a chat's history never plays sounds. The sounds are synthesised, so there are no audio files. Browsers only allow audio after your first tap on the page
- **Unread divider** — open a chat from the list with unread messages and a "3 unread messages" line appears above the first one, and the chat scrolls to it. The scroll-to-latest button (with its new-message count) already in the app is unchanged

## Photo zoom

Files: `kyro-zoom.css`, `js/zoom.js` (hook lines in `app.html`). Remove them to undo. No backend change.

- **Tap a photo** in any chat to open it full screen. Tap the dark area, press the x, press Esc, or swipe down to close
- **Zoom** — pinch with two fingers, double-tap (double-click on desktop) to jump in and out, or use the + / - buttons. Mouse wheel and trackpad pinch work too, up to 600%. Keys: `+`, `-`, `0` (reset)
- **Move around** — drag while zoomed; the photo can't be dragged off screen. A Reset button appears when zoomed in
- The **Media gallery** photos open in the same zoom viewer
- Stickers and view-once photos are left alone. Double-tap-to-heart still works on text messages; on a photo the first tap opens it, so react to photos from the long-press menu

## Message tools, photo editor, GIFs

Files: `js/msg-tools.js`, `kyro-msgtools.css`, `js/photo-editor.js`, `kyro-editor.css`, `js/gif.js`, `js/gif-config.js`, `kyro-gif.css` (hook lines in `app.html`, plus 4 small `KyroMsg` lines in `js/app.js`). Remove the hook lines to undo. No backend change.

- **Copy** — long-press a text message, then Copy
- **Share** — long-press a text message or photo, then Share, to send it to another app. The photo viewer has a share button too. Needs a phone or browser that supports sharing; otherwise use Save to phone
- **Delete for me / Delete for everyone** — Delete now asks. "For me" hides the message on this device (it stays hidden after a reload, which the old Delete did not). "For everyone" works on your own messages and leaves "This message was deleted" on both sides. It travels as a hidden message like reactions do, and the other app only accepts it from the person who sent the original. Note: the server still holds the original until the backend gets a delete route
- **Text size** — Settings > Appearance > Text size (Small, Default, Large, Huge) with a live preview. Applies to messages, the typing box and timestamps
- **Photo editor** — choose a photo and an editor opens: draw (7 colours, brush size), add text (tap to place, drag to move, tap to edit), crop (drag corners), rotate, undo, reset. Send sends the edited picture. GIFs skip the editor
- **GIF search** — the GIF button next to the stickers button. Trending plus search, sent as a normal image message. Needs a free GIPHY key pasted into `js/gif-config.js` (Google closed Tenor's API in June 2026, so GIPHY is used)


## Frontend updates merged (voice, round video, multi-select, real delete)

Files: `js/voice-pro.js`, `kyro-voice.css`, `js/round-video.js`, `kyro-round.css`, `js/select-mode.js`, `kyro-select.css`, plus updated `js/msg-tools.js` and `kyro-msgtools.css` (hook lines in `app.html`). Remove the hook lines to undo. No backend change.

## Kyro Plus: Schedule send, Saved messages, Reminders and commands

Files: `js/kyro-plus.js`, `kyro-plus.css` (two hook lines at the end of the lists in `app.html`). Remove them to undo. No backend change: everything is stored on this device (per account) and messages go out through the app's own `sendChat()`, so encryption, groups and disappearing timers behave exactly as normal.

- **Schedule send** — type a message, then tap the clock button that appears next to Send (or hold Send). Pick In 1 hour / Tonight / Tomorrow, or any date and time. A bar above the composer shows what is waiting in this chat. Settings > Scheduled & reminders lists everything with Send now, Edit and Delete. Works in one-to-one chats and groups. Scheduled messages go out while Kyro is open; if the time passed while it was closed they are sent the next time you open Kyro
- **Saved messages** — a private space just for you, pinned at the top of the chat list (also in Settings). Long-press any message and tap **Add to Saved** (text, photos and small voice notes). You can also type notes, add photos, search, copy, share, set a reminder from a note, or jump back to the original chat. Photos are shrunk to keep storage small; videos and files are saved as a label only
- **Reminders** — long-press a message and tap **Remind me**, or use `/remind`. A pop-up appears with Open chat, Done and Snooze 10 min (plus a system notification if the tab is in the background and you allowed notifications)
- **Commands** — type `/` in the message box to see them:
  - `/recap` — instant catch-up card for the open chat: what you missed since you last replied, questions to answer, mentions of you, plans and times, links, photos/voice notes, and what people talked about. Tap an item to jump to it. `/recap 50` uses the last 50 messages, `/recap today` uses today. Built on your device from the messages on screen, never sent anywhere. Save recap stores it in Saved messages
  - `/remind 20m call mum` · `/remind 9pm pay rent` · `/remind tomorrow 8am gym`
  - `/schedule 9pm happy birthday!` · `/schedule tomorrow 8am good morning` (if the time isn't understood, the time picker opens)
  - `/saved buy milk` saves a note; `/saved` alone opens Saved messages
  - `/commands` lists them. Aliases: `/tldr`, `/catchup`, `/later`, `/note`
  - Commands are handled locally and never sent as a message. Anything that isn't one of these still works as before (quick replies on `/` are unchanged)
- **Time words understood** — `20m`, `in 2 hours`, `1.5h`, `3 days`, `9pm`, `9:30am`, `21:00`, `noon`, `midnight`, `tonight`, `tomorrow 8am`, `friday 6pm`
- **Limits** — up to 50 scheduled messages and 50 reminders. If the browser's storage is full, Saved tells you instead of failing silently

## Status Pro and Group Pro (Oct 16)
- `js/status-pro.js` + `kyro-status.css`: tall status cards, segmented rings, full-screen viewer (auto-advance, tap left/right, hold to pause, swipe down to close, emoji reactions), composer with coloured text, compressed photos with captions, and music.
- `js/group-pro.js` + `kyro-group-pro.css`: tap a group's header for a full group page with photo, description, Add/Search/Media/Exit, and Members / Media / Settings tabs. Admins can add people, make or dismiss admins, remove members and edit the group.
- Both still store data on this device (same `kyro.stories` and `kyro.groups` keys).


## Contact Info + About Me

- Tap a person's name or photo in a chat to open their **Contact Info** page (`js/contact-info.js`, `kyro-contact.css`).
  Shows photo, @username, phone/email (if shared), live presence, status, About, location, website, birthday,
  shared media/links/docs, mute, starred messages, disappearing messages, wallpaper, groups in common,
  a safety-number encryption check, share contact, block and report.
- **Account tab → About me** card: up to **500 characters**, a status (emoji + text), location, website,
  and per-field privacy (Everyone / My contacts / Nobody). The old 120 character bio stays as a short tagline.
- Backend: `GET /api/users/profile/:id`, and `PATCH /api/users/me` now accepts
  `about`, `statusEmoji`, `statusText`, `location`, `website`, `privacy`.

Founded by Mr Vael Tech

## Chat organizing

- **Lock chat** (long-press a chat, or Contact Info): hides the chat from the list behind its own 4-digit chat lock PIN
  (optional fingerprint / Face ID on supported devices). A **Locked chats** row appears at the top of Chats.
  Notifications for locked chats say "New message" only. It protects chats on this device, not on the server.
- **Favorites** chip + star, **Mark as unread / read**, **Clear chat** (for you only), **Delete chat**, **Export chat** (.txt),
  and a limit of 5 pinned chats. Folders and swipe actions were already in the app and still work.
- Backend: `DELETE /api/chats/:otherId/messages` clears a chat for the caller only.

## Privacy, per-chat themes, smart replies (Oct 16)

Files: `js/privacy.js` + `kyro-privacy.css`, `js/chat-theme.js` + `kyro-theme.css`, `js/smart-replies.js` + `kyro-smart.css` (hook lines at the end of `app.html`; one extra menu line in `js/design.js` and one extra row in `js/contact-info.js`). Remove the hook lines to undo. **Privacy needs the updated backend** (`realtime.js`, `utils/profilePrivacy.js`, `models/User.js`, `routes/users.js`, `routes/messages.js`, `routes/chats.js`).

- **Settings > Privacy and safety > Privacy**
  - **Read receipts** — off hides your blue ticks from others. Reciprocal: you stop seeing theirs too
  - **Last seen and online** — Everyone, My contacts or Nobody. The server only sends your presence to people allowed to see it. Reciprocal: choose Nobody and you stop seeing everyone else's
  - **Typing indicator** — hides "typing..." and "recording..." from others
  - **Profile photo** — Everyone, My contacts or Nobody (others see your initials; also applies to the picture on incoming calls)
  - Shortcuts to About me privacy and Blocked contacts. "My contacts" means people you have exchanged messages with. Group chats are not affected
- **Chat theme** (chat menu ⋮ > Chat theme, or Contact Info > Chat theme) — per chat: bubble colours plus a colour wallpaper, or a photo from your gallery or from the photos already in that chat, with Dim and Blur. Saved on this device only. The old Chat wallpaper is unchanged
- **Smart replies** — up to 3 suggested answers above the message box for the latest incoming text. English only (other languages show nothing). Built on your device, never sent anywhere. Tap one to send it. Switch: Settings > Chats > Smart replies

## App shell: full-screen polish and share target (Oct 16)

Files: `kyro-appshell.css`, `js/app-shell.js`, updated `manifest.webmanifest` and `sw.js` (hook lines in `app.html`). Frontend only, no backend change. Remove the hook lines to undo.

- **Full-screen polish** — safe-area padding for notches and the home bar (top bar, composer, landscape sides), a splash screen when launched from the home screen, the status bar colour follows the light/dark theme, no whole-page pull-to-refresh bounce, and UI text isn't selected by accident (messages and inputs still are). iPhone meta tags and touch icon added
- **Share target** — in another app's Share menu choose Kyro, pick a chat, and the text, link or first photo/file is placed in that chat's message box (you tap Send). Needs Kyro installed to the home screen: works on Android Chrome and desktop Chrome/Edge, not on iPhone Safari. Shared items are kept for 15 minutes, so signing in first still works
- Service worker cache bumped to `kyro-shell-v5`. After deploying, close and reopen the installed app once (Android may need a reinstall to pick up the new Share entry)
