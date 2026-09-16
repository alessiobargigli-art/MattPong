# MattPong

Pong web pensato per desktop e smartphone in landscape.

## Modalità

- 1 vs CPU: gira interamente nel browser.
- 1 vs 1 online: una stanza è gestita da un Cloudflare Durable Object e i client comunicano via WebSocket.

## Stack

- Cloudflare Workers
- Cloudflare Durable Objects
- Static Assets
- TypeScript lato Worker
- Canvas + JavaScript lato browser

## Sviluppo locale

```bash
npm install
npm run dev
```

## Verifica

```bash
npm run check
npx wrangler deploy --dry-run
```

## Deploy Cloudflare

Il progetto è predisposto per la Git integration di Cloudflare Workers.

Impostazioni consigliate nella schermata di deploy:

- Project name: `mattpong`
- Build command: `npm install && npm run check`
- Deploy command: `npx wrangler deploy`
- Root directory: lasciare vuoto / repository root

Il file `wrangler.jsonc` configura:

- Worker `mattpong`
- static assets dalla cartella `public`
- binding Durable Object `ROOMS`
- classe SQLite-compatible `GameRoom`
- routing API/WebSocket sotto `/api/*` e `/ws/*`

Non servono secret applicativi per il funzionamento base.
