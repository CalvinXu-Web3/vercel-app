import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicKeyEncoding: { format: "jwk" },
  privateKeyEncoding: { format: "jwk" },
});

console.log("NEXT_PUBLIC_EVIDENCE_PUBLIC_KEY_JWK=");
console.log(JSON.stringify(publicKey));
console.log("");
console.log("Store this private JWK offline. Do not place it in Vercel, .env.local, Git, or chat:");
console.log(JSON.stringify(privateKey));
