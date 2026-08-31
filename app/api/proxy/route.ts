import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function isAuthorized(request: NextRequest): Promise<boolean> {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) return false;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase client configuration variables on server");
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      if (error) console.error("Authorization check failed:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error verifying authorization:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL;
    const googleScriptPassword = process.env.GOOGLE_SCRIPT_PASSWORD;

    if (!googleScriptUrl) {
      return NextResponse.json(
        { error: "Google Script URL not configured" },
        { status: 500 }
      );
    }

    if (!googleScriptPassword) {
      return NextResponse.json(
        { error: "Google Script Password not configured on the server" },
        { status: 500 }
      );
    }

    // Verify Supabase Token
    const authorized = await isAuthorized(request);
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get the request body
    const body = await request.json();

    // Securely inject password on the server
    body.password = googleScriptPassword;

    // Forward the request to the Google Script URL
    const response = await fetch(googleScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Get the response from Google Script
    const data = await response.json();

    // Return the response
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL;
    const googleScriptPassword = process.env.GOOGLE_SCRIPT_PASSWORD;

    if (!googleScriptUrl) {
      return NextResponse.json(
        { error: "Google Script URL not configured" },
        { status: 500 }
      );
    }

    if (!googleScriptPassword) {
      return NextResponse.json(
        { error: "Google Script Password not configured on the server" },
        { status: 500 }
      );
    }

    // Verify Supabase Token
    const authorized = await isAuthorized(request);
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get query parameters from the request
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(googleScriptUrl);
    
    // Forward query parameters to Google Script
    searchParams.forEach((value, key) => {
      if (key !== "password") {
        url.searchParams.append(key, value);
      }
    });

    // Securely inject password on the server
    url.searchParams.append("password", googleScriptPassword);

    // Forward the request to the Google Script URL
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Get the response from Google Script
    const data = await response.json();

    // Return the response
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request" },
      { status: 500 }
    );
  }
}

