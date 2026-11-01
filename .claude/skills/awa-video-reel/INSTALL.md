# awa-video-reel: a Claude Code skill that edits your short videos

Made by Awa K. Penn. Drop a video (up to 1 minute) into Claude Code and type `/awa-video-reel`. Claude listens to what you say and edits the video to match:

- face-tracked effects (stamps, toggles, phone fans, checklists and 40 more)
- bold captions with highlighted keywords, plus title, stat, list and call-to-action cards
- camera punch-ins, and an optional cinematic look
- background music that dips under your voice, and a sound effect on every visual change
- when your video talks about a website, it asks if you want b-roll, then records the site being used (real clicks and scrolls with a visible cursor) as a split screen
- when you tell people to paste a prompt into Claude Code, it can show that too: the prompt pasted into a real Claude Code window with your details typed in, then the result
- an optional "Follow for more" end card with your handle

It shows you the plan first and only renders after you say yes. You get two MP4s in Downloads: one with music, and one without, so you can add a trending sound inside Instagram or TikTok.

Works on vertical, 4:5, square and horizontal videos, with or without a person on camera.

## What you need

- Claude Code (the desktop app or the terminal): claude.com/download
- Google Chrome (or Microsoft Edge)
- Node.js 20 or newer: nodejs.org
- Python 3.11 or 3.12: python.org
- ffmpeg: on Windows `winget install ffmpeg`, on a Mac `brew install ffmpeg`

Not sure how? Open Claude Code and say "install Node.js, Python and ffmpeg for me".

## Install (3 steps)

1. **Unzip** `awa-video-reel.zip`. You get a folder called `awa-video-reel`.
2. **Copy that folder** into `~/.claude/skills/`, so you have `~/.claude/skills/awa-video-reel/SKILL.md`.
   `~` is your home folder: `C:\Users\<you>` on Windows, `/Users/<you>` on a Mac. The `.claude` folder may be hidden.
3. **Restart Claude Code.** Then drag in a video and type `/awa-video-reel`.

Easiest of all: open Claude Code and paste "Install the skill in this folder: <path to the unzipped awa-video-reel folder>. Follow its INSTALL.md." Claude does the steps for you.

The first run sets itself up (about 3 to 5 minutes: it installs the Python packages, the speech-to-text model, Remotion and the recorder). After that, a 40-second video takes about 6 to 8 minutes to render.

## Good to know

- Your work files go to `Videos/awa-video-reel` in your home folder. Finished videos go to Downloads.
- The music in `music/` is free to use. Most tracks are CC0 (no credit needed). One (Got Funk by Kevin MacLeod) is CC BY, and the skill gives you the credit line to paste in your caption when it uses it. Add your own tracks by dropping MP3s in that folder with the mood in the file name, e.g. `chill - my track.mp3`.
- Trending songs from Instagram or TikTok are copyrighted. Add those in the app, on the copy without music.
- Website b-roll shows what a first-time, logged-out visitor sees. It never signs in or buys anything. For pages behind a login, give Claude your own screen recording instead.
- The Claude Code b-roll uses the `claude` command that comes with Claude Code. It only types and presses Enter: it never approves anything, so nothing runs.
- The effects are starter versions. Watch every video before you post it.

## Credits

- Effects engine: MIT licence, see `effects/LICENSE`.
- Captions, cards and b-roll layout: HyperFrames by HeyGen.
- Intro and end cards: Remotion.
- Sound effects: Pixabay (Pixabay licence).
- Music: see `music/CREDITS.md` and `music/library.json`.

Learn AI for free in my newsletter: awa-newsletter.beehiiv.com/subscribe
