import { NextResponse } from "next/server";

// Sub-lists have been removed. This endpoint is intentionally disabled.
export async function GET()  { return NextResponse.json({ error: "Sub-lists removed" }, { status: 410 }); }
export async function POST() { return NextResponse.json({ error: "Sub-lists removed" }, { status: 410 }); }
