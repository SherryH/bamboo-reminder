# Bamboo Bank — 3rd Party Account Setup Guide

## Overview

You need 4 services set up before deploying the bot. Total setup time: ~20 minutes.

## 1. LINE Developer Account + Bot Channel

1. Go to [LINE Developers Console](https://developers.line.biz/) and login with your LINE account
2. **Create Provider**: Console → Create Provider (e.g. "Bamboo Bank")
3. **Create Channel**: Provider → Create Messaging API Channel
   - Channel name: "Bamboo Bank" (or your preferred name)
   - Channel description: "Daily good deed and donation reminder"
   - Category: "Utilities"
   - Subcategory: "Lifestyle"
4. **Get Channel Secret**: Channel → Basic Settings → Channel Secret
   - This becomes `LINE_CHANNEL_SECRET`
5. **Issue Access Token**: Channel → Messaging API → Issue long-lived channel access token (v2)
   - Click "Issue" button
   - This becomes `LINE_CHANNEL_ACCESS_TOKEN`
   - **Important**: Use the long-lived v2 token, NOT the short-lived one (which expires in 30 days)
6. **Get Your User ID**: Channel → Basic Settings → Your user ID
   - 33-character string starting with `U`
   - This becomes `LINE_USER_ID`
7. **Set Webhook URL** (after deploying to Render):
   - Channel → Messaging API → Webhook URL
   - Enter: `https://<your-app>.onrender.com/webhook`
   - Toggle "Use webhook" ON
8. **Disable Auto-Reply**:
   - Channel → Messaging API → Auto-reply messages → Disabled
   - This prevents the bot from sending default LINE auto-replies
9. **Add Bot as Friend**:
   - Channel → Messaging API → QR Code
   - Scan with your phone to add the bot as a LINE friend

## 2. Upstash Redis (Free Tier)

1. Go to [upstash.com](https://upstash.com/) and sign up (GitHub login works)
2. **Create Database**:
   - Console → Create Database
   - Name: "bamboo-reminder"
   - Type: Regional
   - Region: AP-Northeast-1 (Tokyo) — closest to Taiwan
   - Enable TLS: Yes (default)
3. **Get Credentials**:
   - Database → REST API section
   - Copy `UPSTASH_REDIS_REST_URL` (starts with `https://`)
   - Copy `UPSTASH_REDIS_REST_TOKEN`

**Free tier limits**: 10,000 commands/day, 256MB storage. This bot uses ~2 commands/day.

## 3. Render (Free Tier)

1. Go to [render.com](https://render.com/) and sign up
2. **Connect GitHub**: Settings → Git → Connect your GitHub account
3. **Create Web Service**:
   - Dashboard → New → Web Service
   - Connect repository: `bamboo-reminder`
   - Name: "bamboo-reminder" (this determines your URL)
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free
4. **Set Environment Variables** (Service → Environment):
   - `LINE_CHANNEL_ACCESS_TOKEN` = (from LINE Developer Console)
   - `LINE_CHANNEL_SECRET` = (from LINE Developer Console)
   - `LINE_USER_ID` = (from LINE Developer Console)
   - `UPSTASH_REDIS_REST_URL` = (from Upstash Console)
   - `UPSTASH_REDIS_REST_TOKEN` = (from Upstash Console)
5. **Note Your URL**: Copy `https://bamboo-reminder.onrender.com` (or whatever name you chose)
   - This is needed for GitHub Actions and LINE webhook

**Free tier behavior**: Service sleeps after 15 minutes of inactivity. Wakes on incoming request (takes 30-90 seconds).

## 4. GitHub Repository + Actions Secret

1. **Create GitHub Repo**:
   ```bash
   cd ~/Projects/bamboo-reminder
   gh repo create bamboo-reminder --private --source=. --push
   ```
   Or create manually on GitHub and push.

2. **Add Repository Secret**:
   - Repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `RENDER_URL`
   - Value: `https://bamboo-reminder.onrender.com` (your Render URL, no trailing slash)

3. **Enable GitHub Actions**: Should be enabled by default. The workflow at `.github/workflows/daily-reminder.yml` will run automatically.

## Credential Summary

| Variable | Source | Where Used |
|----------|--------|-----------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developer Console → Channel → Messaging API | Render env var |
| `LINE_CHANNEL_SECRET` | LINE Developer Console → Channel → Basic Settings | Render env var |
| `LINE_USER_ID` | LINE Developer Console → Channel → Basic Settings | Render env var |
| `UPSTASH_REDIS_REST_URL` | Upstash Console → Database → REST API | Render env var |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console → Database → REST API | Render env var |
| `RENDER_URL` | Render Dashboard → Service URL | GitHub Actions secret |

## Setup Order

1. **LINE Developer Console** → get 3 credentials
2. **Upstash** → get 2 credentials
3. **Push code to GitHub** → needed for Render + Actions
4. **Render** → deploy, set 5 env vars, get URL
5. **GitHub Actions** → add `RENDER_URL` secret
6. **LINE Developer Console** → set webhook URL to Render URL
7. **Test** → manually trigger GitHub Actions workflow → receive LINE message

## Verification Checklist

- [ ] LINE Bot channel created with Messaging API
- [ ] Long-lived v2 access token issued (not short-lived)
- [ ] Bot added as LINE friend on your phone
- [ ] Auto-reply disabled
- [ ] Upstash Redis database created in AP-Northeast-1
- [ ] Code pushed to GitHub
- [ ] Render web service deployed and running
- [ ] All 5 env vars set in Render
- [ ] `RENDER_URL` secret set in GitHub repo
- [ ] LINE webhook URL set to Render URL
- [ ] Manual workflow_dispatch test successful
- [ ] Daily message received on LINE
