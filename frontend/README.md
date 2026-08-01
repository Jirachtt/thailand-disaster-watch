# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Live data configuration

Copy `.env.example` to `.env` and set the NASA FIRMS key on the server:

```dotenv
FIRMS_MAP_KEY=your_firms_map_key
```

`FIRMS_MAP_KEY` is required for live fire hotspots. Water and rainfall use the
public ThaiWater API; PM2.5/AQI and weather inputs use the public Open-Meteo
APIs. The dashboard does not generate replacement incidents when an upstream
API is unavailable—it reports that source as unavailable instead.

Keep `.env` local and never commit it. For production, add `FIRMS_MAP_KEY` in
the hosting provider's environment-variable settings before building or
starting the Nuxt server. A normal `git pull` will not remove the ignored local
`.env` file.

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
