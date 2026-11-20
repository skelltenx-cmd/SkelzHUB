import { NextResponse } from "next/server";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}