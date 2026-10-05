# Steem Batch Transfer Bot

A simple Node.js web app that transfers STEEM from your account to
multiple recipients in one run. Features auto node switching,
balance verification, duplicate detection, vote history, and
curation reports.

![image](https://github.com/user-attachments/assets/9e653420-a279-483f-a399-e1ab77068648)

---

## Quick Start

Works the same on **Windows, macOS, and Linux**.

### 1. Install Node.js

Download and install the **LTS** version from
[nodejs.org](https://nodejs.org/) (v20.11 or newer required).

### 2. Download the Code

Download this repository (green **Code** button → **Download ZIP**)
and extract it, or clone it with Git.

### 3. Open the Folder in a Terminal

Open a terminal (Command Prompt / PowerShell on Windows, Terminal on
macOS / Linux) **in the project's root folder** — the one containing
`cd [your folder path]`.

### 4. Install Dependencies

```bash
npm install
```

### 5. Start the App

```bash
npm start
```

### 6. Open in Your Browser

Go to **[http://localhost:3000](http://localhost:3000)**.

To stop the app, press `Ctrl + C` in the terminal.

---

## Using the App

| Page             | URL         | What it does                                              |
| ---------------- | ----------- | --------------------------------------------------------- |
| **Recipients**   | `/`         | Add recipients and send the batch transfer                |
| **Vote History** | `/history`  | Browse posts your account voted on in the last 24 hours   |
| **Report**       | `/report`   | Generate a Steemit-ready markdown curation report         |
| **Settings**     | `/settings` | Set your account, active key, and RPC nodes               |

### First-time setup

1. Open **Settings** and enter:
   - **Sender** — your Steem username (without `@`)
   - **Active Key** — your account's **active private key**
   - **RPC Nodes** — API nodes (the app auto-switches if one is down)
2. Click **Save Settings**. Settings are stored in `config.js`.

### Sending transfers

1. Open **Recipients** and add each account with an amount
   (3 decimals, e.g. `1.000`) and an optional memo.
2. Click **Save** (stored in `recipients.txt`), then **Send Transfers**.
3. The app validates the list, checks your balance, sends each
   transfer, and shows a summary of successes / failures.

### Vote History

Votes are **not** fetched automatically when you open the page.
Click **Load Votes** to pull your last 24 hours of votes from the
blockchain. After the first load, the button changes to
**Refresh** so you can fetch the latest data again at any time.

- Filter by vote weight (100%, ≥ 50%, ≥ 25%, ≥ 10%, or custom)
- Loaded votes are reused by the **Report** page
- If you generate a report without loading votes first, the
  Report page fetches them for you

---

## Features

- **Auto node switching** — cycles through RPC nodes if one is down
- **Balance check** — verifies you have enough STEEM before
  starting
- **Self-transfer block** — prevents accidentally sending to
  yourself
- **Duplicate warnings** — alerts if the same user appears twice
- **Zero-amount skip** — set amount to `0.000` to temporarily
  disable a recipient
- **On-demand vote history** — load your last 24h of votes only
  when you need them, with weight filters
- **Curation report** — turn your votes into a markdown post
- **Cross-platform** — works on Windows, macOS, and Linux

---

## Security Warning

Your **active key** is stored in `config.js`.
**Never** share this file or commit it to a public repository.
A `.gitignore` is included to prevent accidental commits.

The app runs only on your computer (`localhost`) — don't expose
port 3000 to the internet.

---

## Troubleshooting

| Problem                         | Fix                                                 |
| ------------------------------- | --------------------------------------------------- |
| `npm` is not recognized         | Install Node.js, then reopen the terminal           |
| `bad option: --disable-warning` | Update Node.js to v20.11 or newer                   |
| `EADDRINUSE` / port 3000 in use | Close the other app using port 3000 and retry       |
| `Account not found`             | Check **Sender** in Settings                        |
| `Invalid amount`                | Use a positive number like `1.000`                  |
| `Could not connect to any node` | Check your internet or add more nodes in Settings   |
| `Insufficient balance`          | Top up your account before sending                  |
| `Invalid activeKey`             | Verify your active private key in Settings          |

---

## License

MIT — use freely.
