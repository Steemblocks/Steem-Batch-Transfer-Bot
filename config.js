// ============================================================
//  config.js  –  Edit this file before running the bot
// ============================================================

module.exports = {
  // ── Your Steem Account ────────────────────────────────────
  // The account that will SEND the STEEM.
  sender: "your-steem-usernam",

  // The **active key** (private) for the sender account.
  // ⚠️  NEVER share this key or commit it to a public repo.
  activeKey: "5K...",

  // ── Steem API Node ────────────────────────────────────────
  // Public RPC node to connect to. Change if you prefer a
  // different one (e.g. "https://api.steemit.com").
  rpcNode: "https://api.steemit.com",

  // ── Recipients List File ──────────────────────────────────
  // Path to the text file containing recipients and amounts.
  // You can open and edit this file directly in Notepad!
  recipientsFile: "recipients.txt",
};
