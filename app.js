const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= CONFIG =================
const RAZORPAY_WEBHOOK_SECRET = "Tbipl@123";

// 🔒 PAYMENT FILTER
const ALLOWED_AMOUNT = 100; // ₹1
const ALLOWED_CURRENCY = "INR";
// ==========================================

// In-memory (no DB)
const validPayments = {};
const tokens = {};

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
// 🔹 WEBHOOK
// =================================================
app.post("/razorpay-webhook", (req, res) => {
  if (!verifySignature(req)) {
    console.log("❌ Invalid signature");
    return res.sendStatus(400);
  }

  if (req.body.event === "payment.captured") {
    const payment = req.body.payload.payment.entity;

    console.log("🔔 Payment:", payment.id);
    console.log("Amount:", payment.amount, payment.currency);

    // 🔐 WEAK BUT ACCEPTED CHECK
    if (
      payment.amount !== ALLOWED_AMOUNT ||
      payment.currency !== ALLOWED_CURRENCY
    ) {
      console.log("❌ Payment does not match criteria");
      return res.sendStatus(200);
    }

    validPayments[payment.id] = true;
    console.log("✅ Payment accepted:", payment.id);
  }

  res.sendStatus(200);
});

// =================================================
// 🔹 SUCCESS REDIRECT
// =================================================
app.get("/payment-success", (req, res) => {
  const paymentId = req.query.razorpay_payment_id;
  if (!paymentId) return res.status(400).send("Missing payment id");

  let tries = 0;
  const interval = setInterval(() => {
    if (validPayments[paymentId]) {
      clearInterval(interval);
      delete validPayments[paymentId];

      const token = generateToken();
      tokens[token] = false;

      return res.redirect(`/join?token=${token}`);
    }

    tries++;
    if (tries > 6) {
      clearInterval(interval);
      return res.status(403).send("Verification pending. Refresh.");
    }
  }, 500);
});

// =================================================
// 🔹 JOIN PAGE (ONE TIME)
// =================================================
app.get("/join", (req, res) => {
  const token = req.query.token;

  if (!token || !(token in tokens) || tokens[token]) {
    return res.send("<h2>❌ Link expired or already used</h2>");
  }

  res.sendFile(path.join(__dirname, "public", "join.html"));
});

// =================================================
// 🔹 MARK USED
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
