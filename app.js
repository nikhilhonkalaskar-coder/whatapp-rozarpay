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

// 🔐 paymentId => { token, used, createdAt }
const paymentTokens = {};

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
    return res.sendStatus(400);
  }

  if (req.body.event === "payment.captured") {
    const payment = req.body.payload.payment.entity;

    console.log("🔔 Payment received:", payment.id);
    console.log("Amount:", payment.amount, payment.currency);

    // ✅ Amount check
    if (
      payment.amount !== ALLOWED_AMOUNT ||
      payment.currency !== ALLOWED_CURRENCY
    ) {
      console.log("❌ Payment does not match criteria");
      return res.sendStatus(200);
    }

    // ✅ Create token ONLY HERE
    const token = generateToken();
    paymentTokens[payment.id] = {
      token,
      used: false,
      createdAt: Date.now()
    };

    console.log("✅ Token created for payment:", payment.id);
  }

  res.sendStatus(200);
});

// =================================================
// 🔹 PAYMENT SUCCESS PAGE (NO TRUST)
// =================================================
app.get("/payment-success", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "verifying.html"));
});

// =================================================
// 🔹 GET TOKEN (ONE TIME)
// =================================================
app.get("/get-token", (req, res) => {
  const now = Date.now();

  for (const pid in paymentTokens) {
    const p = paymentTokens[pid];

    // Expire tokens older than 5 minutes
    if (now - p.createdAt > 5 * 60 * 1000) {
      delete paymentTokens[pid];
      continue;
    }

    if (!p.used) {
      p.used = true;          // Mark as used
      const token = p.token;
      delete paymentTokens[pid];  // Immediately delete to expire
      return res.json({ token });
    }
  }

  res.json({});
});

// =================================================
// 🔹 JOIN PAGE (ONE TIME)
// =================================================
app.get("/join", (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.send("<h2>❌ Invalid or missing token</h2>");
  }

  const entry = Object.values(paymentTokens)
    .find(p => p.token === token);

  if (!entry) {
    return res.send("<h2>❌ Link expired or invalid</h2>");
  }

  res.sendFile(path.join(__dirname, "public", "join.html"));
});

// =================================================
// 🔹 AUTO CLEANUP (OPTIONAL BUT GOOD)
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

