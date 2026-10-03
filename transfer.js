// ============================================================
//  transfer.js  –  Steem Batch Transfer Bot
//  Run:  npm start   (or  node transfer.js)
// ============================================================

const fs = require("fs");
const path = require("path");
const dsteem = require("dsteem");
const config = require("./config");

// ── Helpers ─────────────────────────────────────────────────

function normaliseAmount(raw) {
  const num = parseFloat(raw);
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid amount: "${raw}"`);
  }
  return num.toFixed(3);
}

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

      if (!line || line.startsWith("#") || line.startsWith("//")) continue;

      let to = "", amount = "", memo = "";

      // Comma format only when the comma directly follows the username,
      // so a memo like "Thanks, friend" isn't mis-parsed.
      if (/^[^\s,]+\s*,/.test(line)) {
        const parts = line.split(",");
        to = parts[0].trim();
        amount = parts[1] ? parts[1].trim() : "";
        memo = parts.slice(2).join(",").trim();
      } else {
        const match = line.match(/^(\S+)\s+(\S+)(?:\s+(.*))?$/);
        if (!match) {
          throw new Error(`${fileName} (line ${lineNum}): Invalid format. Expected: username amount [memo]`);
        }
        to = match[1].trim();
        amount = match[2].trim();
        memo = match[3] ? match[3].trim() : "";
      }

      if ((memo.startsWith('"') && memo.endsWith('"')) || (memo.startsWith("'") && memo.endsWith("'"))) {
        memo = memo.slice(1, -1);
      }
      if (to.startsWith("@")) to = to.slice(1);

      if (!to) throw new Error(`${fileName} (line ${lineNum}): Recipient username is empty.`);
      if (!amount) throw new Error(`${fileName} (line ${lineNum}): Amount is missing for recipient "${to}".`);

      // Catch negative amounts early with a clear message
      if (parseFloat(amount) < 0) {
        throw new Error(`${fileName} (line ${lineNum}): Negative amount "${amount}" is not allowed.`);
      }

      if (seenRecipients.has(to)) {
        warn(`${fileName} (line ${lineNum}): Duplicate recipient "@${to}" — they will receive multiple transfers.`);
      }
      seenRecipients.add(to);
      transfers.push({ to, amount, memo, lineNum });
    }
    return { transfers, source: fileName };
  }

  if (Array.isArray(config.transfers) && config.transfers.length > 0) {
    return { transfers: config.transfers, source: "config.js" };
  }
  throw new Error(`Recipients file not found: "${fileName}"`);
}

// ── Validation ──────────────────────────────────────────────

function validateConfig(transfers, source) {
  const placeholderSenders = ["your-steem-username", "your_username"];
  if (!config.sender || placeholderSenders.includes(config.sender)) {
    throw new Error('Please set your Steem username in config.js (field: "sender").');
  }
  const placeholderKeys = ["5K...", "5J________________________________"];
  if (!config.activeKey || placeholderKeys.includes(config.activeKey)) {
    throw new Error('Please set your active private key in config.js (field: "activeKey").');
  }
  if (!Array.isArray(transfers) || transfers.length === 0) {
    throw new Error(`No transfers found in ${source}. Please add at least one recipient.`);
  }

  let totalAmount = 0;
  const validTransfers = [];

  for (const [i, t] of transfers.entries()) {
    const loc = t.lineNum ? `${source} (line ${t.lineNum})` : `Transfer #${i + 1}`;
    if (!t.to || typeof t.to !== "string") throw new Error(`${loc}: recipient username is missing.`);
    if (t.to.startsWith("@")) t.to = t.to.slice(1);
    if (t.to.toLowerCase() === config.sender.toLowerCase()) {
      throw new Error(`${loc}: Cannot transfer to yourself ("@${t.to}").`);
    }
    try {
      const amt = parseFloat(normaliseAmount(t.amount));
      if (amt === 0) {
        warn(`${loc}: Amount is 0.000. Skipping transfer to "@${t.to}".`);
        continue;
      }
      totalAmount = (Math.round(totalAmount * 1000) + Math.round(amt * 1000)) / 1000;
      validTransfers.push(t);
    } catch {
      throw new Error(`${loc}: Invalid amount "${t.amount}". Must be a number like "1.000".`);
    }
  }

  if (validTransfers.length === 0) {
    throw new Error(`No valid transfers found to process.`);
  }

  // Update the transfers array in place with only the valid ones
  transfers.length = 0;
  transfers.push(...validTransfers);

  info(`Total to send: ${totalAmount.toFixed(3)} STEEM across ${transfers.length} transfer(s)`);
  return totalAmount;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  heading("══════════════════════════════════════════");
  heading("        STEEM BATCH TRANSFER BOT");
  heading("══════════════════════════════════════════");

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

  const nodes = config.rpcNodes || [config.rpcNode || "https://api.steemit.com"];
  let client = null;
  let key = null;

  try {
    key = dsteem.PrivateKey.fromString(config.activeKey);
  } catch (err) {
    fail(`Invalid activeKey provided in config.js. Please check your private key.`);
    process.exit(1);
  }

  info(`Sender   : @${config.sender}`);
  info(`List     : ${transfers.length} recipient(s) from ${source}\n`);

  for (const node of nodes) {
    try {
      info(`Trying RPC Node: ${node} ...`);
      const tempClient = new dsteem.Client(node, { timeout: 8000 });
      const [account] = await tempClient.database.getAccounts([config.sender]);

      if (!account) {
        fail(`Account @${config.sender} not found on the blockchain.`);
        process.exit(1); // Fatal error, not a node issue
      }

      const balanceStr = account.balance;
      const availableBalance = parseFloat(balanceStr);
      success(`Connected! Balance: ${balanceStr}`);

      if (!isNaN(availableBalance) && availableBalance < totalAmount) {
        fail(`Insufficient balance! Need ${totalAmount.toFixed(3)} STEEM but only have ${balanceStr}.`);
        process.exit(1);
      }
      console.log();

      client = tempClient;
      break; // Successfully connected, break the loop
    } catch (err) {
      warn(`Failed to connect to ${node}: ${err.message}`);
    }
  }

  if (!client) {
    fail(`Could not connect to any RPC nodes! Please check your internet connection or add more nodes.`);
    process.exit(1);
  }

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

    if (index < transfers.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  heading("──────────── SUMMARY ─────────────");
  info(`Total: ${transfers.length}  |  ✔ ${succeeded}  |  ✖ ${failed}`);
  console.log();

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    fail(`Unexpected error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { loadTransfers, validateConfig, normaliseAmount };
