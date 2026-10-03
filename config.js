// ============================================================
//  config.js  –  Edit this file before running the bot
// ============================================================

module.exports = {
  // ── Your Steem Account ────────────────────────────────────
  // The account that will SEND the STEEM.
  sender: "bijoy1",

  // The **active key** (private) for the sender account.
  // ⚠️  NEVER share this key or commit it to a public repo.
  activeKey: "5J________________________________",

  // ── Steem API Nodes ───────────────────────────────────────
  // The bot will try these nodes in order until one connects successfully.
  rpcNodes: [
    "https://api.steemit.com",
    "https://api.moecki.online",
    "https://steemd.steemworld.org",
    "https://api.justyy.com",
    "https://api.steememory.com"
  ],

  // ── Recipients List File ──────────────────────────────────
  // Path to the text file containing recipients and amounts.
  // You can open and edit this file directly in Notepad!
  recipientsFile: "recipients.txt",
};
