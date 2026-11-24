/** Everything the chatbot knows about the product. Edit freely; the bot reads this on every message. */
export const MEET_GUIDE = `
DENSE MEET: WHAT IT IS
A video meeting website from Dense AI with built-in AI. Works in any modern browser on phone and PC, guests need no account. Hosted at the site the user is on now.

STARTING AND JOINING
- "New meeting" on the home page creates a room and opens the lobby. The creator becomes the host. A meeting code looks like abc-defg-hij. Anyone with the link or code can join.
- Lobby: set name, profile photo and colour, choose mic/camera on or off, then Join.
- Home screen Settings (gear icon): profile, default mic/camera, default layout, recording destination.
- History (clock icon or History link): past meetings with their codes, Rejoin if the meeting is still live, and saved AI notes.

IN THE MEETING
- Star-field view: whoever speaks glides to the centre, everyone else keeps floating around. Layouts: Star, Grid, Speaker. Screen sharing switches to a presentation layout.
- Bottom bar: mic and camera buttons each have an up-arrow that opens a device menu (choose microphone, speaker, camera). Also emoji reactions, raise hand, 3-dot menu, leave. On PC the bar is three floating groups (meeting code and time at left, controls in the middle, layout and panels at right).
- Panels: People, Chat, AI Notes, Host Copilot (host/permitted), Interview, AI Helper. They float above the controls and can be closed with the X.
- Raise hand: the raised hand gets a badge and raised hands are listed first in People.
- Host marker: a gold HOST tag on the host's circle.

HOST POWERS
- Mute one person, mute everyone, ask someone to turn mic or camera on (they can accept or decline), remove a person instantly, end the meeting for all.
- Waiting room: when on, newcomers wait and see each other's names; the host admits one by one or "Admit all". A removed person who tries to rejoin lands in the waiting room as "Removed earlier" and the host can allow them back.
- Meeting lock: nobody new can join while locked.
- Custom roles: host gives a person a role label (for example Helper) and picks exactly which powers it has: mute, admit, remove, AI notes, Copilot, record, interview.
- Layout for everyone: host can apply a layout to all participants or change only their own view.

AI FEATURES
- AI Notes: when the host turns it on, each person's speech is transcribed in their own browser and shared as a live transcript with names. Host (or a person with the notes permission) can generate a summary.
- Host Copilot: suggested questions, topic coverage, tips. Host or permitted people only.
- Interview mode (host-controlled, invisible to others unless used): the host sends timed questions to chosen people's screens and can remove them. AI notes capture what each candidate says (companies, years, skills), build a per-candidate summary with experience, which answers were correct or incorrect with a correction, and an accuracy bar. AI also suggests follow-up questions from the live transcript.
- AI Helper inside a meeting answers questions about Dense AI and the product.

RECORDING
- Start from the 3-dot menu (host or permitted). Recording happens inside the page: no screen picker, includes everyone's audio and the star-field view with names.
- Destinations (Settings, Recording tab): on PC, a chosen folder on the computer (date-wise folders YYYY-MM-DD) and/or Google Drive (folder "Dense Meet Recordings/YYYY-MM-DD"). On phones the file is saved to Google Drive if linked, otherwise downloaded to the phone.
- Format is MP4 when the browser supports it, otherwise WebM (WebM plays in VLC or Chrome).
- Google Drive linking needs a Google OAuth Client ID (Google Cloud Console: enable Google Drive API, set up OAuth consent screen and add yourself as test user, create a Web client ID, add the website address as an authorised JavaScript origin, then paste the Client ID in Settings, Recording, or set NEXT_PUBLIC_GOOGLE_CLIENT_ID on the host site).
- Keep the meeting tab open while recording; the screen is kept awake on phones.

LIMITS AND CAPACITY
- Smooth for roughly 2 to 25 people with cameras, 25 to 50 with most cameras off, up to about 100 on the free hosting plan but heavy on phones. Only about 25 video circles render at once.
- Free video infrastructure has a monthly minutes allowance, so very long or very large meetings can use it up.

TROUBLESHOOTING
- No mic or camera: allow the permission in the browser's site settings (lock icon in the address bar), close other apps using the camera, then rejoin. On iPhone use Safari.
- Bluetooth headset not listed: reconnect it, open the mic arrow menu and pick it.
- Can't hear someone: check the speaker choice in the mic arrow menu and the phone volume.
- Join says locked: the host locked the meeting. In a waiting room: wait for the host to admit.
- Recording did not save: pick a folder in Settings, Recording on PC, or link Google Drive; on phone without Drive it downloads when you stop. Don't close the tab before it finishes.
- AI says it could not answer: the site owner's AI key is missing or out of quota; ask the host or try again later.
- A page looks stuck: refresh once; the meeting keeps running and you rejoin automatically from History.

CONTACT AND SUPPORT
- People can talk to the Dense AI team any time. The assistant can create a support token (a short code like DM-7K3Q-92XD) and it is emailed to the team at densee.ai@gmail.com. The user should keep the token and quote it in any follow-up.
`;
