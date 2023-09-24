/*
 Copyright 2023 Google LLC

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

// DSP
import express from "express"
import env from 'dotenv';

import { readFileSync } from "fs"
import { promisify } from "util"
import { resolve } from "path"
import * as childProcess from "child_process"
import * as sfv from "structured-field-values"
import Stripe from 'stripe';

env.config({ path: '../../.env' });
const STRIPE_SECRET_KEY="sk_test_51Mi7JsCqgMtUYFDtU41Eh1l5savidGOyhOmNFcP8ToLR3aFNxhtg0kmd5ynRAuBRjVQYZ76T36ItloYBkZnjAxDQ00M3BCMGm8"
const STRIPE_PUBLISHABLE_KEY="pk_test_51Mi7JsCqgMtUYFDtGJgCbhnJylAQZnjcwcQlOu1JT4WdvdTWIyJm8J5SkY7P43aRPZDl9wSbyd6pncmFxWjwh8cy00BrhORray"

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2022-08-01',
  appInfo: { // For sample support and debugging, not required for production:
    name: 'stripe-samples/identity/modal',
    url: 'https://github.com/stripe-samples',
    version: '0.0.1',
  },
  typescript: true,
});
const PORT = process.env.PORT || 3000
const BASE64FORMAT = /^[a-zA-Z0-9+/=]+$/

const exec = promisify(childProcess.exec)
const protocol_version = "PrivateStateTokenV1VOPRF"

const Y = readFileSync(`${resolve("./")}/keys/pub_key.txt`)
  .toString()
  .trim()

const app = express()

app.use((req, res, next) => {
  // const host = req.headers.host.split(".").at(0).toUpperCase()
  // const token = process.env[`${host}_TOKEN`]
  res.setHeader("Origin-Trial", "token")
  next()
})
app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function(req, res, buf) {
      if (req.originalUrl.startsWith('/webhook')) {
        req.rawBody = buf.toString();
      }
    }
  })
);
app.use(
  express.static("src/public", {
    setHeaders: (res, path, stat) => {
      if (path.endsWith("main.js")) {
        return res.set("X-Custom-Header", "howdy")
      }
    }
  })
)
app.set("view engine", "ejs")
app.set("views", "src/views")

app.get("/.well-known/trust-token/key-commitment", async (req, res) => {
  console.log(req.path)

  // 1 year later
  const expiry = ((Date.now() + 1000 * 60 * 60 * 24 * 365) * 1000).toString()

  const key_commitment = {}
  key_commitment[protocol_version] = {
    protocol_version,
    id: 1,
    batchsize: 1,
    keys: {
      1: { Y, expiry }
    }
  }

  res.set({
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  })

  const json = JSON.stringify(key_commitment, "", " ")
  console.log(json)
  res.send(json)
})

app.get(`/private-state-token/issuance`, async (req, res) => {
  console.log(req.path)
  console.log(req.headers)
  const sec_private_state_token = req.headers["sec-private-state-token"]
  console.log({ sec_private_state_token })
  if (sec_private_state_token.match(BASE64FORMAT) === null) {
    return res.sendStatus(400)
  }

  const result = await exec(`${resolve("./")}/bin/main --issue ${sec_private_state_token}`)
  const token = result.stdout
  console.log({ token })
  res.set({ "Access-Control-Allow-Origin": "*" })
  res.append("sec-private-state-token", token)
  res.send()
})

app.get(`/private-state-token/redemption`, async (req, res) => {
  console.log(req.path)
  console.log(req.headers)
  const sec_private_state_token_crypto_version = req.headers["sec-private-state-token-crypto-version"]
  console.log({ sec_private_state_token_crypto_version })
  if (sec_private_state_token_crypto_version !== protocol_version) {
    return res.sendStatus(400)
  }

  const sec_private_state_token = req.headers["sec-private-state-token"]
  console.log({ sec_private_state_token })
  if (sec_private_state_token.match(BASE64FORMAT) === null) {
    return res.sendStatus(400)
  }

  const result = await exec(`${resolve("./")}/bin/main --redeem ${sec_private_state_token}`)
  console.log({ result })
  const token = result.stdout
  console.log({ token })
  res.set({ "Access-Control-Allow-Origin": "*" })
  res.append("sec-private-state-token", token)
  res.send()
})

app.get(`/private-state-token/send-rr`, async (req, res) => {
  console.log(req.path)

  const headers = req.headers
  console.log({ headers })

  // sec-redemption-record
  // [(<issuer 1>, {"redemption-record": <SRR 1>}),
  //  (<issuer N>, {"redemption-record": <SRR N>})],
  const rr = sfv.decodeList(headers["sec-redemption-record"])
  console.log({ rr })

  const { value, params } = rr[0]
  console.log(value) // https://private-state-token-issuer.glitch.me

  const redemption_record = Buffer.from(params["redemption-record"]).toString()
  console.log({ redemption_record })

  const r = Buffer.from(redemption_record, "base64").toString()
  console.log({ r })

  res.set({ "Access-Control-Allow-Origin": "*" })
  res.send(r)
})

app.get("/", async (req, res) => {
  const host = req.headers.host
  console.log({ host })
      return res.render("issuer")
})

app.get("/submitted.html", async (req, res) => {
  const host = req.headers.host
  console.log({ host })
      return res.render("submitted")
})

app.get('/config', (req, res) => {
  res.send({
    publishableKey: STRIPE_PUBLISHABLE_KEY,
  });
});

app.get('/secret', (req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  })

  const json = JSON.stringify({ a: "nyc" });
  console.log(json)
  res.send(json)
});

app.post('/create-verification-session', async (req, res) => {
  try {
    const verificationSession = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        user_id: '{{USER_ID}}',
      }
      // Additional options for configuring the verification session:
      // options: {
      //   document: {
      //     # Array of strings of allowed identity document types.
      //     allowed_types: ['driving_license'], # passport | id_card
      //
      //     # Collect an ID number and perform an ID number check with the
      //     # document’s extracted name and date of birth.
      //     require_id_number: true,
      //
      //     # Disable image uploads, identity document images have to be captured
      //     # using the device’s camera.
      //     require_live_capture: true,
      //
      //     # Capture a face image and perform a selfie check comparing a photo
      //     # ID and a picture of your user’s face.
      //     require_matching_selfie: true,
      //   }
      // },

    });

    // Send publishable key and PaymentIntent details to client
    res.send({
      client_secret: verificationSession.client_secret
    });

  } catch(e) {
    console.log(e)
    return res.status(400).send({
      error: {
        message: e.message
      }
    });
  }
});

// Expose a endpoint as a webhook handler for asynchronous events.
// Configure your webhook in the stripe developer dashboard
// https://dashboard.stripe.com/test/webhooks
app.post('/webhook', async (req, res) => {
  let data, eventType;

  // Check if webhook signing is configured.
  if (1) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        "whsec_sOQ9saauA6fGl0WjmL0GkUkrwCaMPCZW"
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // we can retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  // Successfully constructed event
  switch (eventType) {
    case 'identity.verification_session.verified': {
      // All the verification checks passed
      const verificationSession = data.object;
      break;
    }
    case 'identity.verification_session.requires_input': {
      // At least one of the verification checks failed
      const verificationSession = data.object;

      console.log('Verification check failed: ' + verificationSession.last_error.reason);

      // Handle specific failure reasons
      switch (verificationSession.last_error.code) {
        case 'document_unverified_other': {
          // The document was invalid
          break;
        }
        case 'document_expired': {
          // The document was expired
          break;
        }
        case 'document_type_not_supported': {
          // document type not supported
          break;
        }
        default: {
          // ...
        }
      }
    }
  }
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`)
})
