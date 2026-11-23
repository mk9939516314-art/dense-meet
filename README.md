# Dense Meet

Video meetings for Dense AI: star-field UI, host roles and permissions, waiting room and lock, AI notes with per-candidate summaries, Host Copilot, an in-meeting Dense helper and Google Drive recording.

## Setup (all free tiers)
1. LiveKit Cloud project (livekit.io): copy the WebSocket URL, API key and secret.
2. Import the repo on Vercel and set:
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` (OpenAI-compatible; Gemini works with the defaults: model `gemini-2.5-flash`)
   - optional `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for recording to Google Drive
3. Deploy. To test the AI key open `/api/ai/status?test=1`.

## Google Drive recording
Google Cloud Console > APIs and services > enable Google Drive API > Credentials > OAuth client ID (Web). Add your Vercel domain under Authorised JavaScript origins and set the id as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Hosts then link Drive from Settings in a meeting.

## Notes
- LiveKit free plan has a monthly participant-minute cap.
- Transcription uses the browser speech API (Chrome, Edge and Safari work best).
- Recording captures the host's browser tab, so it works on desktop Chrome and Edge.
