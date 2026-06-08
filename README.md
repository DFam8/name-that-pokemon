# Name That Pokémon

A browser-based Pokémon name quiz covering all **3,112+ forms** — including Shinies, Megas, regional variants, Gigantamax, and more.

## How to Play

- A Pokémon image appears on screen — type its full name and press **Enter** (or click **Go**)
- You have **3 lives** — a wrong answer costs one and reveals the correct name
- Lives are **fully restored** every 100 correct answers
- Your high score is saved locally between sessions

## Features

- **3,112+ forms** — base Pokémon, Shinies, Megas, Gigantamax, Regionals, Totem, Primal, and more
- **Fuzzy spelling** — small typos are forgiven based on name length
- **Shadow mode** — hides the Pokémon as a silhouette for an extra challenge
- **3 play modes** — Random, Dex Order, and Chaos
- **Streak counter** — tracks consecutive correct answers
- **High score** — personal best saved in localStorage
- **Game is wrong** button — dispute a rejected answer and restore your life
- **Report a mistake** — flag incorrect names or images (saved to localStorage)
- **Dark / light theme** toggle
- **Offline-friendly** — Pokémon list is cached after the first load

## Project Structure

```
name-that-pokemon/
├── index.html   # Page structure and markup
├── style.css    # All styles, CSS custom properties, animations
└── game.js      # Game logic, data fetching, answer checking
```

## Running Locally

No build step required — it's plain HTML, CSS, and JS.

```bash
npx serve .
```

Then open [http://localhost:3000](http://localhost:3000).

## Data

Pokémon data and sprites are fetched from [PokéAPI](https://pokeapi.co/) and the [PokeAPI sprites repository](https://github.com/PokeAPI/sprites). The full list is cached in `localStorage` after the first load so subsequent visits are instant.
