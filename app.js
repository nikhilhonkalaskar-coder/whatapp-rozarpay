const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= CONFIG =================
const RAZORPAY_WEBHOOK_SECRET = "Tbipl@123";
const ALLOWED_AMOUNT = 100; // ₹1 = 100 paise
const ALLOWED_CURRENCY = "INR";
// ==========================================

// 🔐 paymentId => { token, createdAt }
const paymentTokens = {};

// =================================================
// 🔹 SIGNATURE VERIFY
// =================================================
function verifySignature(req) {
  const signature = req.headers["x-razorpay-signature"];
  const body = JSON.stringify(req.body);

  const expected = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  return signature === expected;
}

// =================================================
// 🔹 TOKEN GENERATOR
// =================================================
function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

// =================================================
// 🔹 RAZORPAY WEBHOOK (ONLY TRUSTED ENTRY)
// =================================================
app.post("/razorpay-webhook", (req, res) => {
  if (!verifySignature(req)) {
    console.log("❌ Invalid webhook signature");
    return res.sendStatus(400);
  }

  if (req.body.event !== "payment.captured") {
    return res.sendStatus(200);
  }

  const payment = req.body.payload.payment.entity;

  // ✅ Validate payment
  if (
    payment.amount !== ALLOWED_AMOUNT ||
    payment.currency !== ALLOWED_CURRENCY
  ) {
    console.log("❌ Invalid payment amount/currency");
    return res.sendStatus(200);
  }

  // ✅ Prevent duplicate token creation
  if (paymentTokens[payment.id]) {
    return res.sendStatus(200);
  }

  const token = generateToken();

  paymentTokens[payment.id] = {
    token,
    createdAt: Date.now()
  };

  console.log("✅ Token created for payment:", payment.id);
  res.sendStatus(200);
});

// =================================================
// 🔹 PAYMENT SUCCESS PAGE (UNTRUSTED)
// =================================================
app.get("/payment-success", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "verifying.html"));
});

// =================================================
// 🔹 GET TOKEN (NO EXPIRY HERE)
// =================================================
app.get("/get-token", (req, res) => {
  const now = Date.now();

  for (const pid in paymentTokens) {
    const p = paymentTokens[pid];

    // ⏱ Expire after 5 minutes
    if (now - p.createdAt > 5 * 60 * 1000) {
      delete paymentTokens[pid];
      continue;
    }

    return res.json({ token: p.token });
  }

  res.json({});
});

// =================================================
// 🔹 JOIN PAGE (EXPIRES TOKEN HERE)
// =================================================
app.get("/join", (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.send("<h2>❌ Invalid or missing token</h2>");
  }

  const pid = Object.keys(paymentTokens).find(
    id => paymentTokens[id].token === token
  );

  if (!pid) {
    return res.send("<h2>❌ Link expired or invalid</h2>");
  }

  // 🔒 EXPIRE IMMEDIATELY AFTER JOIN
  delete paymentTokens[pid];

  res.sendFile(path.join(__dirname, "public", "join.html"));
});

// =================================================
// 🔹 AUTO CLEANUP (EVERY 1 MIN)
// =================================================
setInterval(() => {
  const now = Date.now();
  for (const pid in paymentTokens) {
    if (now - paymentTokens[pid].createdAt > 5 * 60 * 1000) {
      delete paymentTokens[pid];
    }
  }
}, 60 * 1000);

// =================================================
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
