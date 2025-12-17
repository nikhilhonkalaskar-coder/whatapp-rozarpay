const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= CONFIG =================
const RAZORPAY_WEBHOOK_SECRET = "Tbipl@123"; // same as Razorpay dashboard
const REQUIRED_NOTE_KEY = "source";
const REQUIRED_NOTE_VALUE = "TBI_COMMUNITY";
// ==========================================

// In-memory stores (no DB)
const validPayments = {}; // payment_id => true
const tokens = {};        // token => used(true/false)

// ---------------- SIGNATURE VERIFY ----------------
function verifySignature(req) {
  const signature = req.headers["x-razorpay-signature"];
  const body = JSON.stringify(req.body);

  const expected = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  return signature === expected;
}

// ---------------- TOKEN ----------------
function generateToken() {
  return crypto.randomBytes(20).toString("hex");
}

// =================================================
// 🔹 RAZORPAY WEBHOOK (ONLY TRUSTED ENTRY)
// =================================================
app.post("/razorpay-webhook", (req, res) => {
  if (!verifySignature(req)) {
    console.log("❌ Invalid webhook signature");
    return res.status(400).send("Invalid signature");
  }

  if (req.body.event === "payment.captured") {
    const payment = req.body.payload.payment.entity;

    console.log("🔔 Payment received:", payment.id);
    console.log("Notes:", payment.notes);

    // ✅ RELIABLE CHECK (NOT payment_page_id)
    const notes = payment.notes || {};

    if (notes[REQUIRED_NOTE_KEY] !== REQUIRED_NOTE_VALUE) {
      console.log("❌ Ignored payment from other page");
      return res.sendStatus(200);
    }

    // Mark payment valid
    validPayments[payment.id] = true;

    console.log("✅ Valid payment accepted:", payment.id);
  }

  res.sendStatus(200);
});

// =================================================
// 🔹 PAYMENT SUCCESS REDIRECT
// =================================================
app.get("/payment-success", (req, res) => {
  const paymentId = req.query.razorpay_payment_id;

  if (!paymentId) {
    return res.status(400).send("Missing payment id");
  }

  let attempts = 0;

  const interval = setInterval(() => {
    if (validPayments[paymentId]) {
      clearInterval(interval);
      delete validPayments[paymentId];

      const token = generateToken();
      tokens[token] = false;

      return res.redirect(`/join?token=${token}`);
    }

    attempts++;
    if (attempts > 6) {
      clearInterval(interval);
      return res.status(403).send("Payment verification pending. Please refresh.");
    }
  }, 500);
});

// =================================================
// 🔹 JOIN PAGE (ONE-TIME)
// =================================================
app.get("/join", (req, res) => {
  const token = req.query.token;

  if (!token || !(token in tokens) || tokens[token]) {
    return res.send("<h2>❌ Link expired or already used</h2>");
  }

  res.sendFile(path.join(__dirname, "public", "join.html"));
});

// =================================================
// 🔹 MARK TOKEN USED
// =================================================
app.post("/mark-used", (req, res) => {
  const { token } = req.body;

  if (!token || !(token in tokens) || tokens[token]) {
    return res.status(400).send("Invalid token");
  }

  tokens[token] = true;
  res.sendStatus(200);
});

// =================================================
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
