// ============================================================
//  server.js  –  Web UI Backend for Steem Batch Transfer Bot
//  Run:  npm start   (opens http://localhost:3000)
// ============================================================

const express = require("express");
const fs = require("fs");
const path = require("path");
const { normaliseAmount } = require("./transfer");

const app = express();
const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");

// Client-side routes of the single-page app. Every one of these serves
// index.html; the frontend router decides which view to show.
const SPA_ROUTES = ["/", "/history", "/report", "/settings"];

// Old multi-page URLs → new clean routes (keeps bookmarks working).
const LEGACY_REDIRECTS = {
  "/index.html": "/",
  "/history.html": "/history",
  "/report.html": "/report",
  "/settings.html": "/settings",
};

const PLACEHOLDER_SENDERS = ["your-steem-username", "your_username"];
const PLACEHOLDER_KEYS = ["5K...", "5J________________________________"];

app.use(express.json());

// ── Page routes (must come before static so legacy files never win) ──

for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
  app.get(from, (req, res) => res.redirect(301, to));
}

app.get(SPA_ROUTES, (req, res) => {
  res.sendFile(INDEX_HTML);
});

app.use(express.static(PUBLIC_DIR, { index: false }));

// ── Helpers ─────────────────────────────────────────────────

function readConfig() {
  // Re-read config.js fresh every time (bypass require cache)
  delete require.cache[require.resolve("./config")];
  return require("./config");
}

function hasRealSender(cfg) {
  return Boolean(cfg.sender) && !PLACEHOLDER_SENDERS.includes(cfg.sender);
}

function hasRealKey(cfg) {
  return Boolean(cfg.activeKey) && !PLACEHOLDER_KEYS.includes(cfg.activeKey);
}

function writeConfig(data) {
  const nodes = data.rpcNodes || [
    "https://api.steemit.com",
    "https://api.moecki.online",
    "https://steemd.steemworld.org",
    "https://api.justyy.com",
    "https://api.steememory.com",
  ];

  // JSON.stringify escapes quotes/backslashes so a malformed URL can't break config.js
  const nodesStr = nodes.map((n) => `    ${JSON.stringify(n)}`).join(",\n");

  const content = `// ============================================================
//  config.js  –  Edit this file before running the bot
// ============================================================

module.exports = {
  // ── Your Steem Account ────────────────────────────────────
  // The account that will SEND the STEEM.
  sender: ${JSON.stringify(data.sender || "your_username")},

  // The **active key** (private) for the sender account.
  // ⚠️  NEVER share this key or commit it to a public repo.
  activeKey: ${JSON.stringify(data.activeKey || "5J________________________________")},

  // ── Steem API Nodes ───────────────────────────────────────
  // The bot will try these nodes in order until one connects successfully.
  rpcNodes: [
${nodesStr}
  ],

  // ── Recipients List File ──────────────────────────────────
  // Path to the text file containing recipients and amounts.
  // You can open and edit this file directly in Notepad!
  recipientsFile: "recipients.txt",
};
`;
  fs.writeFileSync(path.join(__dirname, "config.js"), content, "utf8");
}

function readRecipients() {
  const filePath = path.join(__dirname, "recipients.txt");
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const recipients = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    let to = "", amount = "", memo = "";

    // Comma format only when the comma directly follows the username.
    // (Otherwise a memo like "Thanks, friend" would be mis-parsed.)
    if (/^[^\s,]+\s*,/.test(trimmed)) {
      const parts = trimmed.split(",");
      to = parts[0].trim();
      amount = parts[1] ? parts[1].trim() : "";
      memo = parts.slice(2).join(",").trim();
    } else {
      const match = trimmed.match(/^(\S+)\s+(\S+)(?:\s+(.*))?$/);
      if (match) {
        to = match[1].trim();
        amount = match[2].trim();
        memo = match[3] ? match[3].trim() : "";
      }
    }

    if ((memo.startsWith('"') && memo.endsWith('"')) || (memo.startsWith("'") && memo.endsWith("'"))) {
      memo = memo.slice(1, -1);
    }
    if (to.startsWith("@")) to = to.slice(1);

    if (to && amount) {
      recipients.push({ to, amount, memo });
    }
  }

  return recipients;
}

function writeRecipients(recipients) {
  const header = `# ============================================================
#  recipients.txt — Steem Batch Transfer Recipient List
# ============================================================
#
#  How to edit:
#  - Enter one recipient per line.
#  - Format:  username  amount  [optional memo]
#    OR:      username, amount, [optional memo]
#  - Amounts must have exactly 3 decimal places (e.g. 1.000).
#  - Lines starting with # are comments and are ignored.
#
#  Examples:
#    recipient1 1.000 Monthly payment
#    recipient2 0.500 Thanks!
#    recipient3 2.250
# ============================================================

`;

  const lines = recipients.map((r) => {
    const parts = [String(r.to || "").trim(), String(r.amount || "").trim()];
    const memo = String(r.memo || "").replace(/[\r\n]+/g, " ").trim();
    if (memo) parts.push(memo);
    return parts.join(" ");
  });

  fs.writeFileSync(path.join(__dirname, "recipients.txt"), header + lines.join("\n") + "\n", "utf8");
}

// Try each configured RPC node until one answers for the sender account.
async function connectClient(config, timeout) {
  const dsteem = require("dsteem");
  const nodes = config.rpcNodes && config.rpcNodes.length ? config.rpcNodes : ["https://api.steemit.com"];

  for (const node of nodes) {
    try {
      const client = new dsteem.Client(node, { timeout });
      const [account] = await client.database.getAccounts([config.sender]);
      return { client, account: account || null };
    } catch {
      continue;
    }
  }
  return { client: null, account: null };
}

// ── API Routes ──────────────────────────────────────────────

// GET config (sender + nodes). The private key is NEVER sent to the browser —
// only whether one is stored and a short masked hint.
app.get("/api/config", (req, res) => {
  try {
    const cfg = readConfig();
    const keySet = hasRealKey(cfg);
    res.json({
      sender: hasRealSender(cfg) ? cfg.sender : "",
      hasKey: keySet,
      keyHint: keySet ? `${cfg.activeKey.slice(0, 2)}••••••••${cfg.activeKey.slice(-4)}` : "",
      rpcNodes: cfg.rpcNodes || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST config (save sender, key, nodes). A blank key keeps the stored one.
app.post("/api/config", (req, res) => {
  try {
    const { sender, activeKey, rpcNodes } = req.body || {};
    const current = readConfig();

    const cleanSender = String(sender || "").trim().replace(/^@/, "").toLowerCase();
    if (!cleanSender) {
      return res.status(400).json({ error: "Sender username is required." });
    }

    const newKey = String(activeKey || "").trim();
    const keyToSave = newKey || (hasRealKey(current) ? current.activeKey : "");
    if (!keyToSave) {
      return res.status(400).json({ error: "Active key is required." });
    }

    const nodes = Array.isArray(rpcNodes) ? rpcNodes.map((n) => String(n).trim()).filter(Boolean) : [];
    if (nodes.length === 0) {
      return res.status(400).json({ error: "Add at least one RPC node." });
    }

    writeConfig({ sender: cleanSender, activeKey: keyToSave, rpcNodes: nodes });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET recipients
app.get("/api/recipients", (req, res) => {
  try {
    const recipients = readRecipients();
    res.json(recipients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST recipients (save all)
app.post("/api/recipients", (req, res) => {
  try {
    const recipients = req.body;
    if (!Array.isArray(recipients)) {
      return res.status(400).json({ error: "Expected an array of recipients." });
    }
    writeRecipients(recipients);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST transfer — execute batch transfers
app.post("/api/transfer", async (req, res) => {
  try {
    const config = readConfig();
    const dsteem = require("dsteem");

    // Validate sender
    if (!hasRealSender(config)) {
      return res.status(400).json({ error: "Please set your Steem username in Settings." });
    }
    if (!hasRealKey(config)) {
      return res.status(400).json({ error: "Please set your active private key in Settings." });
    }

    // Parse key
    let key;
    try {
      key = dsteem.PrivateKey.fromString(config.activeKey);
    } catch {
      return res.status(400).json({ error: "Invalid active key. Please check Settings." });
    }

    // Load recipients
    const recipients = readRecipients();
    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients found. Add at least one recipient." });
    }

    // Validate EVERY row before broadcasting anything, so a bad row halfway
    // down the list can't abort the batch after some transfers already went out.
    let totalAmount = 0;
    for (const [i, r] of recipients.entries()) {
      let amt;
      try {
        amt = normaliseAmount(r.amount);
      } catch {
        return res.status(400).json({ error: `Row ${i + 1} (@${r.to}): invalid amount "${r.amount}".` });
      }
      if (r.to.toLowerCase() === config.sender.toLowerCase()) {
        return res.status(400).json({ error: `Row ${i + 1}: cannot transfer to yourself (@${r.to}).` });
      }
      r.amount = amt;
      totalAmount = (Math.round(totalAmount * 1000) + Math.round(parseFloat(amt) * 1000)) / 1000;
    }

    // Connect to node
    const { client, account } = await connectClient(config, 8000);
    if (!client) {
      return res.status(500).json({ error: "Could not connect to any RPC node." });
    }
    if (!account) {
      return res.status(400).json({ error: `Account @${config.sender} not found on the blockchain.` });
    }

    // Balance check (same safeguard as the CLI)
    const balance = parseFloat(account.balance);
    if (!isNaN(balance) && balance < totalAmount) {
      return res.status(400).json({
        error: `Insufficient balance: need ${totalAmount.toFixed(3)} STEEM but only have ${account.balance}.`,
      });
    }

    // Execute transfers
    const results = [];
    for (const [index, r] of recipients.entries()) {
      const amt = r.amount;
      if (parseFloat(amt) === 0) {
        results.push({ to: r.to, amount: amt, status: "skipped", message: "Amount is 0.000" });
        continue;
      }

      try {
        await client.broadcast.transfer(
          {
            from: config.sender,
            to: r.to,
            amount: `${amt} STEEM`,
            memo: r.memo || "",
          },
          key
        );
        results.push({ to: r.to, amount: amt, memo: r.memo, status: "success", message: "TX broadcast OK" });
      } catch (err) {
        results.push({ to: r.to, amount: amt, memo: r.memo, status: "failed", message: err.message });
      }

      // Small delay between transfers
      if (index < recipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    res.json({ results, summary: { total: results.length, succeeded, failed, skipped } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET votes — last 24h vote history for the sender account
app.get("/api/votes", async (req, res) => {
  try {
    const config = readConfig();

    if (!hasRealSender(config)) {
      return res.status(400).json({ error: "Please set your Steem username in Settings first." });
    }

    const { client } = await connectClient(config, 10000);
    if (!client) {
      return res.status(500).json({ error: "Could not connect to any RPC node." });
    }

    // Fetch account history — walk backwards to get last 24h of votes
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const votes = [];
    let lastIndex = -1;
    const batchSize = 100; // Steem API nodes cap at 100 per request
    let done = false;

    while (!done) {
      let history;
      try {
        const limit = lastIndex === -1 ? batchSize : Math.min(batchSize, lastIndex);
        history = await client.database.call("get_account_history", [
          config.sender,
          lastIndex,
          limit,
        ]);
      } catch {
        break;
      }

      if (!history || history.length === 0) break;

      for (let i = history.length - 1; i >= 0; i--) {
        const [, entry] = history[i];
        const op = entry.op;
        const timestamp = new Date(entry.timestamp + "Z");

        if (timestamp < cutoff) {
          done = true;
          break;
        }

        if (op[0] === "vote" && op[1].voter === config.sender) {
          votes.push({
            author: op[1].author,
            permlink: op[1].permlink,
            weight: op[1].weight,
            timestamp: entry.timestamp,
          });
        }
      }

      // Set next page: smallest index in this batch minus 1
      const oldestIdx = history[0][0];
      lastIndex = oldestIdx - 1;
      if (lastIndex <= 0) break;
    }

    // Fetch post details for each vote (limit to 50 to avoid overload)
    const uniqueVotes = [];
    const seen = new Set();
    for (const v of votes) {
      const k = `${v.author}/${v.permlink}`;
      if (!seen.has(k)) {
        seen.add(k);
        uniqueVotes.push(v);
      }
    }

    const votesToFetch = uniqueVotes.slice(0, 50);
    const results = [];

    for (const v of votesToFetch) {
      const base = {
        author: v.author,
        permlink: v.permlink,
        weight: v.weight,
        timestamp: v.timestamp,
        url: `https://steemit.com/@${v.author}/${v.permlink}`,
      };

      try {
        const post = await client.database.call("get_content", [v.author, v.permlink]);

        let coverImage = "";
        const title = post.title || "";

        // Try to extract image from json_metadata
        try {
          const meta = JSON.parse(post.json_metadata || "{}");
          if (Array.isArray(meta.image) && meta.image.length > 0) {
            coverImage = meta.image[0];
          }
        } catch {}

        // Fallback: find first image in body
        if (!coverImage && post.body) {
          const imgMatch = post.body.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
          if (imgMatch) coverImage = imgMatch[1];
          if (!coverImage) {
            const imgTag = post.body.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
            if (imgTag) coverImage = imgTag[1];
          }
        }

        // Only allow http(s) images
        if (!/^https?:\/\//i.test(coverImage)) coverImage = "";

        results.push({ ...base, title, coverImage });
      } catch {
        results.push({ ...base, title: "", coverImage: "" });
      }
    }

    res.json({ sender: config.sender, votes: results, total: uniqueVotes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unknown API endpoints → JSON 404 (instead of an HTML error page)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Start Server ────────────────────────────────────────────

app.listen(PORT, () => {
  console.log();
  console.log("\x1b[1m\x1b[36m  ══════════════════════════════════════════\x1b[0m");
  console.log("\x1b[1m\x1b[36m        STEEM BATCH TRANSFER — WEB UI\x1b[0m");
  console.log("\x1b[1m\x1b[36m  ══════════════════════════════════════════\x1b[0m");
  console.log();
  console.log(`\x1b[32m  ✔ Server running at:\x1b[0m  \x1b[1mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[2m  Open the URL above in your browser.\x1b[0m`);
  console.log();
});
