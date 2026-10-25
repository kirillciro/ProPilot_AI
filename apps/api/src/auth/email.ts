import { randomInt } from "node:crypto";
import { env } from "../env.js";
import { sha256 } from "./tokens.js";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

export const newLoginCode = () =>
  String(randomInt(0, 1_000_000)).padStart(6, "0");

export const hashLoginCode = (email: string, code: string) =>
  sha256(`${email}:${code}:${env.JWT_SECRET}`);

export async function sendLoginCode(email: string, code: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.log(`[dev] login code for ${email}: ${code}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: `Your ProPilot AI code: ${code}`,
      text: `Your ProPilot AI sign-in code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!res.ok) throw new Error(`Email provider error ${res.status}`);
}
