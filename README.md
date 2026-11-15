# Multiverse Card Studio

An unofficial fan card maker for *Sentinels of the Multiverse: Definitive Edition*, made as a "way better"
version of Unity's Workshop. Everything runs in your browser; nothing is uploaded anywhere.

## Use it online
**https://cdbyall.github.io/multiverse-card-studio/**

## Tabletop Simulator
Press "Tabletop Simulator", type your Saved Objects folder, and save. In the game: Objects > Saved Objects.
For multiplayer: Modding > Cloud Manager > Upload All Loaded Files (see the README it makes).

## Start it on this PC instead
Double-click **Start Card Studio.cmd**. It serves this folder on http://localhost:8848 and opens it.
Leave the black window open while you work. In Chrome or Edge, press **Install app** (top right)
to get a desktop/Start-menu app that also works offline.

## Card types
Hero: deck card, deck back, character card, incapacitated back, **First Appearance front + back**.
Villain: deck card, deck back, character card (front + flipped). Environment: deck card, deck back.
Principles: card.

## First Appearance
The hero's first comic shown in a graded case: "FIRST APPEARANCE: NAME" label, optional grade, the
cover, power + HP below, and the featured issue on the footer. The back is the "NOTABLE DEFEAT" cover
with the incapacitated options. Build the cover in the app (masthead, issue, price, month, seal, blurb,
speech bubble, era, colors, halftone, age and wear) or upload a finished cover.

## Files
index.html, styles.css, app.js (UI), render.js (card templates), text.js (game-text formatting),
zip.js (PNG zip export), sw.js + manifest.webmanifest (installable/offline app).
Projects are saved in the browser (IndexedDB). Use "Save project file" for backups.
