// DSP
import express from "express"
import { readFileSync } from "fs"
import { promisify } from "util"
import { resolve } from "path"
import * as childProcess from "child_process"
import * as sfv from "structured-field-values"
const { EXTERNAL_PORT, PORT } = process.env

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
  switch (host) {
    case "private-state-token-demo.glitch.me":
      return res.render("index", {
        title: "home",
        detail: "detail",
        EXTERNAL_PORT
      })
    case "private-state-token-issuer.glitch.me":
      return res.render("issuer", {
        title: "issuer",
        detail: "detail",
        EXTERNAL_PORT
      })
    case "private-state-token-redeemer.glitch.me":
      return res.render("redeemer", {
        title: "redeemer",
        detail: "detail",
        EXTERNAL_PORT
      })
    default:
      console.error(`invalid domain ${host}`)
      return
  }
})

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`)
})
