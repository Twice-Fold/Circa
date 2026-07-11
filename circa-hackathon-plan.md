# Circa — Hackathon Build Plan
**Track:** Solo Hack | General Track
**Goal:** AI-powered schedule app that reads your sleep/energy patterns and builds your day around your actual biology.

---

## 1. The Pitch (one paragraph)

> "Most schedule apps treat every hour the same. Circa doesn't. Upload a screenshot of your sleep data from any health app — Apple Health, Google Fit, Fitbit, whatever — and Circa's AI reads it, understands your energy patterns, and builds your day around *you*: when to do deep work, when to take a break, even when to grab coffee. Your raw data stays encrypted on a home server I built myself; the key is managed separately in the cloud, so no single breach exposes anything. Only anonymized signals ever reach the AI."

This one paragraph hits: the hook (personalized, not generic), the technical wow (vision parsing + AI reasoning), and the trust story (encryption split) — all in ~15 seconds.

---

## 2. Core Architecture

```
[User] --screenshot--> [Web App / Firebase Frontend]
                              |
                    vision model parses image
                    (sleep times, duration, etc.)
                              |
                    structured data --> [Greg: home server]
                    (encrypted at rest)
                              |
              decryption key stored separately
              (Firebase doc or Cloud KMS)
                              |
        anonymized signals only --> [Featherless API]
        (DeepSeek / Kimi / GLM — reasoning model)
                              |
                    schedule suggestions --> back to user
```

**Key principle to repeat in your pitch:** raw data and the key to unlock it are never in the same place. Neither half alone is useful to an attacker.

---

## 3. Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend | Simple web app (React or plain HTML/JS) hosted on Firebase | Free tier covers a demo easily, fast to deploy |
| Vision parsing | Featherless vision-capable model (check catalog) or Gemini via AI Pro | Reads sleep screenshots into structured data |
| Reasoning / suggestions | Featherless — DeepSeek, Kimi, or GLM (test a couple, pick best output) | Turns sleep/energy data into schedule suggestions with real reasoning shown |
| Data storage | Greg (home server) — encrypted at rest | Sensitive data never touches a third party |
| Key management | Firebase doc (simplified) — or Cloud KMS if time allows Saturday | Splits data from the key that unlocks it |
| Hosting/infra backstop | Google Cloud credits ($10/mo via AI Pro) | Covers anything Firebase free tier doesn't |
| Coding | Claude Code | Scaffolding, backend, frontend, Greg's server config |

---

## 4. Feature Scope

### MVP — must have by Sunday demo
1. Upload a sleep-data screenshot (any health app)
2. Vision model extracts sleep pattern (bedtime, wake time, duration) → shown to user as confirmation
3. Data sent to Greg, encrypted, stored
4. Featherless reasons over the (anonymized) pattern → generates a suggested daily schedule with *explanations* ("your energy dips around 2pm — that's break time, not deep work")
5. Clean single-page dashboard showing the suggested schedule
6. Security explanation baked into the UI (a small "how your data is protected" section) — this doubles as your privacy answer for judges

### Modes
- **Circa Flow (L badge)** — reasoning disabled (`"reasoning": {"type": "disabled"}` or equivalent Featherless param). Fast (~15 sec), reliable, near-identical quality to reasoning-on in testing. **This is the MVP/demo backbone — build and harden this first.**
- **Circa Rhythm** — reasoning enabled. Slower (~30-60+ sec observed), deeper chain-of-thought. Stretch feature only — add as a toggle if Flow is rock solid by Saturday night.

### Stretch — only if MVP is solid by Saturday night
- Circa Rhythm toggle (see above)
- Multiple schedule "modes" (study day, rest day, exam week)
- Session memory — refine suggestions if you tell it a suggestion didn't work
- Real Google Health Connect OAuth integration (in addition to screenshots) for Android
- Visual polish — timeline UI instead of a list

### Explicitly NOT doing (avoid scope creep)
- Native iOS app / HealthKit integration
- Cross-device real-time sync
- Full production-grade Cloud KMS setup unless Saturday goes very smoothly
- Notifications / reminders system
- Calendar app integrations (Google Calendar sync, etc.)

---

## 5. Hour-by-Hour Weekend Plan

### Saturday
| Time | Task |
|---|---|
| Morning (first block, freshest) | Set up Greg's server + encrypted storage. Set up Featherless API access, test DeepSeek/Kimi/GLM outputs side by side on sample sleep data — pick the best one. |
| Midday | Build screenshot upload + vision parsing pipeline. Test with real screenshots (yours, sample images). |
| Afternoon | Wire up the key-split (Firebase doc storing key, separate from Greg's encrypted data). Confirm the split actually works end to end. |
| Evening | Build the reasoning prompt — this is where the "wow" lives. Iterate on the system prompt until suggestions sound genuinely smart, not generic. Get the dashboard UI showing suggestions with explanations. |

### Sunday
| Time | Task |
|---|---|
| Morning | Stretch features if Saturday went well. Otherwise: polish UI, fix bugs, tighten the reasoning prompt further. |
| Midday | Full end-to-end test: screenshot → parsed → encrypted → stored → reasoned → displayed. Run it at least 5 times, different sample data each time. |
| Afternoon | Build demo script (below). Rehearse live at least 3 times, out loud, timed. |
| Before submission | Final bug bash. Write README with the architecture explanation (doubles as security answer for judges who read before the pitch). |

---

## 6. Demo Script (aim for ~3 minutes)

1. **Hook (15 sec):** "Every schedule app treats every hour the same. I don't think that's how humans actually work."
2. **Live demo (90 sec):**
   - Upload a real sleep screenshot on stage
   - Show it getting parsed in real time
   - Show Circa generating a schedule *with reasoning* ("energy dip at 2pm → break, not deep work")
3. **Architecture/trust story (45 sec):**
   - "Here's the part I'm proud of — your data doesn't sit on some company's server somewhere. It's encrypted and stored on a home server I built myself. The key that unlocks it lives separately in the cloud. Neither half alone means anything."
4. **Close (15 sec):** "This is Circa — a schedule that knows you, and respects your data enough to actually protect it."

---

## 7. Security Talking Points (for Q&A)

- Raw sleep/schedule data: encrypted, stored on Greg (home server)
- Decryption key: stored separately (Firebase / Cloud KMS)
- AI only ever sees anonymized signals, never raw data
- No third-party company has your raw health data by default
- "What's next for production": full Cloud KMS, native HealthKit support, encrypted cloud backup as an opt-in

---

## 8. Things to Do RIGHT NOW (before coding starts)

- [ ] Confirm Featherless has vision-capable models — test one with a sample screenshot
- [ ] Get Greg set up and reachable (confirm it can run as a persistent server, not just when you're near it)
- [ ] Set up Firebase project + confirm free tier covers your needs
- [ ] Decide: full Cloud KMS or simplified Firebase key-split (recommend simplified given time)
- [ ] Gather a few sample sleep screenshots to test parsing against (Apple Health, Google Fit, Fitbit — screenshot from each if possible)
