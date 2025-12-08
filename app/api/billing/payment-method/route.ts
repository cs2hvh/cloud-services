import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { cardNumber, expiry, cvv } = await request.json();
    if (
      typeof cardNumber !== "string" ||
      !/^\d{12,19}$/.test(cardNumber) ||
      typeof expiry !== "string" ||
      !/^(0[1-9]|1[0-2])\/(\d{2})$/.test(expiry) ||
      typeof cvv !== "string" ||
      !/^\d{3,4}$/.test(cvv)
    ) {
      return NextResponse.json({ error: "Invalid payment details" }, { status: 400 });
    }
    // TODO: persist payment method with a provider/vault
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
