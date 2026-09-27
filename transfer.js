// ============================================================
//  transfer.js  –  Steem Batch Transfer Bot
//  Run:  npm start   (or  node transfer.js)
// ============================================================

const fs = require("fs");
const path = require("path");
const dsteem = require("dsteem");
const config = require("./config");

// ── Helpers ─────────────────────────────────────────────────

/** Pad / normalise an amount string to exactly 3 decimals */
function normaliseAmount(raw) {
  const num = parseFloat(raw);
  if (isNaN(num) || num <= 0) {
    throw new Error(`Invalid amount: "${raw}"`);
  }
  return num.toFixed(3);
}

/** Pretty-print a line with colour (works on most terminals) */
const colours = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function success(msg) {
  console.log(`${colours.green}  ✔ ${msg}${colours.reset}`);
}
function fail(msg) {
  console.log(`${colours.red}  ✖ ${msg}${colours.reset}`);
}
function warn(msg) {
  console.log(`${colours.yellow}  ⚠ ${msg}${colours.reset}`);
}
function info(msg) {
  console.log(`${colours.cyan}  ℹ ${msg}${colours.reset}`);
}
function heading(msg) {
  console.log(`\n${colours.bold}${colours.cyan}${msg}${colours.reset}`);
}

// ── Recipients Loader ───────────────────────────────────────

/**
 * Loads recipients from recipients.txt (or configured file)
 * Supports:
 *   username amount memo
 *   username, amount, memo
 * Skips empty lines and lines starting with # or //
 */
function loadTransfers() {
  const fileName = config.recipientsFile || "recipients.txt";
  const filePath = path.resolve(__dirname, fileName);

  if (fs.existsSync(filePath)) {
    const rawContent = fs.readFileSync(filePath, "utf8");
    const lines = rawContent.split(/\r?\n/);
    const transfers = [];
    const seenRecipients = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Skip blank lines and comments
      if (!line || line.startsWith("#") || line.startsWith("//")) {
        continue;
      }

      let to = "";
      let amount = "";
      let memo = "";

      if (line.includes(",")) {
        // Comma-separated: username, amount, memo
        const parts = line.split(",");
        to = parts[0].trim();
        amount = parts[1] ? parts[1].trim() : "";
        memo = parts.slice(2).join(",").trim();
      } else {
        // Space-separated: username amount memo...
        const match = line.match(/^(\S+)\s+(\S+)(?:\s+(.*))?$/);
        if (!match) {
          throw new Error(
            `${fileName} (line ${lineNum}): Invalid format. Expected: username amount [memo]`
          );
        }
        to = match[1].trim();
        amount = match[2].trim();
        memo = match[3] ? match[3].trim() : "";
      }

      // Remove quotation marks around memo if any
      if (
        (memo.startsWith('"') && memo.endsWith('"')) ||
        (memo.startsWith("'") && memo.endsWith("'"))
      ) {
        memo = memo.slice(1, -1);
      }

      // Strip leading @ from username if user typed it
      if (to.startsWith("@")) {
        to = to.slice(1);
      }

      // Validate username is not empty after stripping
      if (!to) {
        throw new Error(
          `${fileName} (line ${lineNum}): Recipient username is empty.`
        );
      }

      // Validate amount is present
      if (!amount) {
        throw new Error(
          `${fileName} (line ${lineNum}): Amount is missing for recipient "${to}".`
        );
      }

      // Warn about duplicate recipients (same user receives multiple transfers)
      if (seenRecipients.has(to)) {
        warn(
          `${fileName} (line ${lineNum}): Duplicate recipient "@${to}" — they will receive multiple transfers.`
        );
      }
      seenRecipients.add(to);

      transfers.push({ to, amount, memo, lineNum });
    }

    return { transfers, source: fileName };
  }

  // Fallback: check if transfers are defined directly in config.js
  if (Array.isArray(config.transfers) && config.transfers.length > 0) {
    return { transfers: config.transfers, source: "config.js" };
  }

  throw new Error(`Recipients file not found: "${fileName}"`);
}

// ── Validation ──────────────────────────────────────────────

function validateConfig(transfers, source) {
  if (!config.sender || config.sender === "your-steem-username") {
    throw new Error(
      'Please set your Steem username in config.js (field: "sender").'
    );
  }
  if (!config.activeKey || config.activeKey === "5K...") {
    throw new Error(
      'Please set your active private key in config.js (field: "activeKey").'
    );
  }
  if (!Array.isArray(transfers) || transfers.length === 0) {
    throw new Error(
      `No transfers found in ${source}. Please add at least one recipient.`
    );
  }

  let totalAmount = 0;

  for (const [i, t] of transfers.entries()) {
    const loc = t.lineNum
      ? `${source} (line ${t.lineNum})`
      : `Transfer #${i + 1}`;
    if (!t.to || typeof t.to !== "string") {
      throw new Error(`${loc}: recipient username is missing.`);
    }
    if (t.to.startsWith("@")) {
      t.to = t.to.slice(1);
    }

    // Prevent sending to yourself
    if (t.to.toLowerCase() === config.sender.toLowerCase()) {
      throw new Error(
        `${loc}: Cannot transfer to yourself ("@${t.to}").`
      );
    }

    try {
      const amt = normaliseAmount(t.amount);
      totalAmount += parseFloat(amt);
    } catch {
      throw new Error(
        `${loc}: Invalid amount "${t.amount}". Must be a number like "1.000".`
      );
    }
  }

  info(`Total to send: ${totalAmount.toFixed(3)} STEEM across ${transfers.length} transfer(s)`);

  return totalAmount;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  heading("══════════════════════════════════════════");
  heading("        STEEM BATCH TRANSFER BOT");
  heading("══════════════════════════════════════════");

  // 1. Load transfers and validate
  let transfers = [];
  let source = "recipients.txt";
  let totalAmount = 0;

  try {
    const loaded = loadTransfers();
    transfers = loaded.transfers;
    source = loaded.source;
    totalAmount = validateConfig(transfers, source);
  } catch (err) {
    fail(err.message);
    process.exit(1);
  }

  const client = new dsteem.Client(config.rpcNode || "https://api.steemit.com");
  const key = dsteem.PrivateKey.fromString(config.activeKey);

  info(`Sender   : @${config.sender}`);
  info(`RPC Node : ${config.rpcNode || "https://api.steemit.com"}`);
  info(`List     : ${transfers.length} recipient(s) from ${source}\n`);

  // 2. Quick connectivity check — fetch sender account & verify balance
  try {
    const [account] = await client.database.getAccounts([config.sender]);
    if (!account) {
      fail(`Account @${config.sender} not found on the blockchain.`);
      process.exit(1);
    }

    const balanceStr = account.balance; // e.g. "123.456 STEEM"
    const availableBalance = parseFloat(balanceStr);
    info(`Balance  : ${balanceStr}`);

    if (!isNaN(availableBalance) && availableBalance < totalAmount) {
      fail(
        `Insufficient balance! Need ${totalAmount.toFixed(3)} STEEM but only have ${balanceStr}.`
      );
      process.exit(1);
    }
    console.log();
  } catch (err) {
    fail(`Could not connect to RPC node: ${err.message}`);
    process.exit(1);
  }

  // 3. Process each transfer sequentially
  let succeeded = 0;
  let failed = 0;

  for (const [index, t] of transfers.entries()) {
    const amt = normaliseAmount(t.amount);
    const label = `[${index + 1}/${transfers.length}]  ${amt} STEEM → @${t.to}`;

    try {
      await client.broadcast.transfer(
        {
          from: config.sender,
          to: t.to,
          amount: `${amt} STEEM`,
          memo: t.memo || "",
        },
        key
      );
      success(`${label}  —  TX broadcast OK`);
      succeeded++;
    } catch (err) {
      fail(`${label}  —  ${err.message}`);
      failed++;
    }

    // Small delay to be polite to the API node
    if (index < transfers.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // 4. Summary
  heading("──────────── SUMMARY ─────────────");
  info(`Total: ${transfers.length}  |  ✔ ${succeeded}  |  ✖ ${failed}`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    fail(`Unexpected error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { loadTransfers, validateConfig, normaliseAmount };
