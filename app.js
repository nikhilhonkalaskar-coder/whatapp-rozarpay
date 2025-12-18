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

  if (!paymentId) {
    return res.status(400).send("Missing payment id");
  }

  // Generate token immediately
  const token = generateToken();
  tokens[token] = false;

  console.log("➡️ Redirecting immediately for payment:", paymentId);

  return res.redirect(`/join?token=${token}`);
});

// =================================================
// 🔹 JOIN PAGE (ONE TIME)
// =================================================
app.get("/join", (req, res) => {
  const token = req.query.token;

  if (!token || !(token in tokens) || tokens[token]) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Link Expired</title>
        <style>
          body {
            margin: 0;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #f4f6f9;
            font-family: Arial, sans-serif;
          }

          .error-box {
            background: #ffffff;
            padding: 20px 25px;
            max-width: 90%;
            width: 360px;
            text-align: center;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          }

          .error-box h2 {
            margin: 0 0 10px;
            color: #dc3545;
            font-size: 22px;
          }

          .error-box p {
            color: #555;
            font-size: 15px;
            line-height: 1.5;
          }

          @media (max-width: 480px) {
            .error-box {
              padding: 16px;
            }

            .error-box h2 {
              font-size: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h2>Link Expired</h2>
          <p>This invite link has already been used or is no longer valid.</p>
        </div>
      </body>
      </html>
    `);
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


