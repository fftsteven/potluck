# Thanksgiving Potluck

1. `npm i -g vercel`, then run `vercel` in this folder (log in, accept defaults).
2. Vercel dashboard → this project → Storage → Create → Upstash (Redis), free plan → Connect to project.
3. Settings → Environment Variables → add `ADMIN_KEY` = any password you pick.
4. `vercel --prod`

Share: https://<your-project>.vercel.app
Your admin view (shows Remove buttons): https://<your-project>.vercel.app/?admin=YOUR_ADMIN_KEY
