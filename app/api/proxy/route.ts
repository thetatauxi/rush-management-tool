import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL;

    if (!googleScriptUrl) {
      return NextResponse.json(
        { error: "Google Script URL not configured" },
        { status: 500 }
      );
    }

    // Get the request body
    const body = await request.json();

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

    if (!googleScriptUrl) {
      return NextResponse.json(
        { error: "Google Script URL not configured" },
        { status: 500 }
      );
    }

    // Get query parameters from the request
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(googleScriptUrl);
    
    // Forward query parameters to Google Script
    searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

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

