import { NextRequest, NextResponse } from "next/server";
import { Products } from "@/lib/supabase/queries/products";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

// GET - Fetch products (public read endpoint for dashboard/service flows)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const sub = searchParams.get("sub");

    let products;
    if (type && sub) {
      products = await Products.get_by_type_and_subtype(type, sub);
    } else if (type) {
      products = await Products.get_by_type(type);
    } else {
      products = await Products.get_all();
    }

    return NextResponse.json(
      { products, count: products.length },
      { status: 200 }
    );
  } catch (error) {
    logError("GET /api/products", error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

