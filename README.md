# Steem Batch Transfer Bot

A simple Node.js bot that transfers STEEM from your account to
multiple recipients in one run. Features auto node switching,
balance verification, and duplicate detection.



<img width="975" height="512" alt="image" src="https://github.com/user-attachments/assets/4702204d-5f0e-40db-8ed7-4dba8521243b" />



---

## Quick Start

### 1. Install Node.js

Download and install from
[nodejs.org](https://nodejs.org/) (LTS version recommended).

### 2. Install Dependencies

Open a terminal / command prompt **in this folder** and run:

```bash
npm install
```

### 3. Configure Your Account

Open **`config.js`** in any text editor and fill in your
Steem credentials:

| Field       | Description                              |
| ----------- | ---------------------------------------- |
| `sender`    | Your Steem username (without `@`)        |
| `activeKey` | Your account's **active private key**    |
| `rpcNodes`  | Array of API nodes (auto-switches order) |

The bot automatically tries each node in `rpcNodes` until one
responds. You can reorder or add/remove nodes as needed.

### 4. Edit Recipients List

Open **`recipients.txt`** in **Notepad** (or any text editor).
Add one recipient per line:

```text
username amount memo
```

Examples:

```text
recipient1 1.000 Monthly payment
recipient2 0.500 Thanks!
recipient3 2.250
```

- **Username** — Steem name (with or without `@`)
- **Amount** — STEEM with 3 decimal places (e.g. `1.000`)
- **Memo** — optional (leave blank if not needed)
- Lines starting with `#` are comments and ignored
- Setting amount to `0.000` will skip that recipient

### 5. Run the Bot

**Windows:** Double-click **`start.bat`**

**macOS / Linux:** Double-click **`start.sh`** or run in terminal:

```bash
sh start.sh
```

**From any terminal (CMD, PowerShell, Terminal):**

```bash
npm start -s
```

The bot will:

1. Validate your config and `recipients.txt`
2. Auto-connect to the first available RPC node
3. Check your account balance before sending
4. Send each transfer one by one
5. Print a summary of successes / failures

---

## Features

- **Auto node switching** — cycles through `rpcNodes` if one
  is down
- **Balance check** — verifies you have enough STEEM before
  starting
- **Self-transfer block** — prevents accidentally sending to
  yourself
- **Duplicate warnings** — alerts if the same user appears
  twice
- **Zero-amount skip** — set amount to `0.000` to temporarily
  disable a recipient
- **Cross-platform** — works on Windows, macOS, and Linux

---

## Security Warning

Your **active key** is stored in `config.js`.
**Never** share this file or commit it to a public repository.
A `.gitignore` is included to prevent accidental commits.

---

## Troubleshooting

| Problem                         | Fix                                            |
| ------------------------------- | ---------------------------------------------- |
| `Account not found`             | Check `sender` in `config.js`                  |
| `Invalid amount`                | Use a positive number like `"1.000"`           |
| `Could not connect to any node` | Check your internet or add more nodes          |
| `Insufficient balance`          | Top up your account before running             |
| `Invalid activeKey`             | Verify your active private key in `config.js`  |

---

## License

MIT — use freely.
