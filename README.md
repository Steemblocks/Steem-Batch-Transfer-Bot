# Steem Batch Transfer Bot

A simple Node.js bot that transfers STEEM from your account to multiple
recipients in one run.

---

## Quick Start

### 1. Install Node.js

Download and install from [nodejs.org](https://nodejs.org/) (LTS version recommended).

### 2. Install Dependencies

Open a terminal / command prompt **in this folder** and run:

```bash
npm install
```

### 3. Configure Your Account

Open **`config.js`** in any text editor and fill in your Steem credentials:

| Field       | Description                                         |
| ----------- | --------------------------------------------------- |
| `sender`    | Your Steem username (without `@`)                   |
| `activeKey` | Your account's **active private key**               |
| `rpcNode`   | Steem API node (default: `https://api.steemit.com`) |

### 4. Edit Recipients List in Notepad

Open **`recipients.txt`** directly in **Notepad** (or any text editor).
Add one recipient per line using either space-separated or comma-separated format:

```text
username amount [optional memo]
```

Examples:

```text
recipient1 1.000 Monthly payment
recipient2 0.500 Thanks!
recipient3 2.250
```

- **Username**: Recipient's Steem name (with or without `@`).
- **Amount**: STEEM amount with 3 decimal places (e.g. `1.000`, `0.500`).
- **Memo**: Optional note (leave blank if not needed).
- Lines starting with `#` are treated as comments and ignored.

### 5. Run the Bot

```bash
npm start
```

The bot will:

1. Validate your config and `recipients.txt`
2. Check your account balance
3. Send each transfer one by one
4. Print a summary of successes / failures

---

## ⚠️ Security Warning

Your **active key** is stored in `config.js`. **Never** share this file or
commit it to a public repository. If you plan to use version control, add
`config.js` to your `.gitignore`.

---

## Troubleshooting

| Problem                         | Fix                                                               |
| ------------------------------- | ----------------------------------------------------------------- |
| `Account not found`             | Double-check the `sender` username in `config.js`                 |
| `Invalid amount`                | Ensure the amount is a positive number string like `"1.000"`      |
| `Could not connect to RPC node` | Try a different node in `rpcNode`, e.g. `https://api.steemit.com` |

---

## License

MIT — use freely.
