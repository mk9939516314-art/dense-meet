# Dense Meet

Video meetings for Dense AI: star-field UI, live AI notes, interview summaries, Host Copilot and an in-meeting Dense helper.

## Setup (free)
1. Create a free LiveKit Cloud project (livekit.io, no card). Copy the WebSocket URL, API key and secret.
2. Import this repo on Vercel and add env vars: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. AI (add later): `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` (any OpenAI-compatible API, e.g. Gemini, Groq).
4. Deploy. Open the site, click New meeting.

Local: `npm install && cp .env.example .env.local && npm run dev`.

## Notes
- Free LiveKit tier has a monthly participant-minute cap.
- Transcription uses the browser speech API (Chrome/Edge/Safari best).
- Planned: cloud video recording, waiting room, meeting lock.
