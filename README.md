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
1. console.cloud.google.com > create a project > APIs and services > Library > enable **Google Drive API**.
2. OAuth consent screen: External, add yourself as a test user (or publish the app).
3. Credentials > Create credentials > OAuth client ID > Web application. Under Authorised JavaScript origins add your Vercel URL (and `http://localhost:3000` for local work).
4. Copy the client ID into Vercel as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and redeploy. Or paste it in the app under Settings > Recording.
5. Settings > Recording > Link Google Drive. Recordings go to *Dense Meet Recordings / YYYY-MM-DD*.

Recording happens inside the page (the stage is drawn to a canvas and every voice is mixed in), so nobody has to pick a screen, and it works on phones. On a computer you can also pick a local folder.

## Notes
- LiveKit free plan has a monthly participant-minute cap.
- Transcription uses the browser speech API (Chrome, Edge and Safari work best).
- Keep the meeting tab open while recording. On a phone keep the screen on (the app asks the phone to stay awake).
