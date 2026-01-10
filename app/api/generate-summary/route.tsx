import { ImageResponse } from "@vercel/og";
import { EVENT_HEADERS, StudentRecord } from "@/lib/pnmConstants";

export const runtime = "edge";

// Image dimensions - increased for better quality
const WIDTH = 600;
const HEADER_HEIGHT = 280;
const EVENT_ROW_HEIGHT = 52;
const FOOTER_HEIGHT = 70;
const PADDING = 28;
// SVG components for checkmark and X
function CheckIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" fill="#16a34a" />
      <path
        d="M8 12l2.5 2.5L16 9"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" fill="#dc2626" />
      <path
        d="M15 9l-6 6M9 9l6 6"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function POST(request: Request) {
  try {
    const { record } = (await request.json()) as { record: StudentRecord };

    if (!record) {
      return new Response(JSON.stringify({ error: "Missing record" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calculate dynamic height based on number of events
    const height =
      HEADER_HEIGHT +
      EVENT_HEADERS.length * EVENT_ROW_HEIGHT +
      FOOTER_HEIGHT +
      PADDING * 2;

    // Get event attendance data
    const events = EVENT_HEADERS.map((eventName) => ({
      name: eventName,
      attended: Boolean(record[eventName]),
    }));

    const totalAttended = record["Total Events Attended"] ?? 0;
    const name = record.Name?.text ?? "Unknown";
    const idNumber = record["Wiscard Number"] ?? null;
    const email = record.Email ?? "";
    const headshotUrl = record.Name?.imageDataUrl ?? null;

    return new ImageResponse(
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            padding: PADDING,
            gap: 24,
            borderBottom: "3px solid #e5e5e5",
          }}
        >
          {/* Headshot - using contain to show full image */}
          {headshotUrl ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 180,
                height: 220,
                borderRadius: 12,
                backgroundColor: "#f5f5f5",
                border: "3px solid #d4d4d4",
                overflow: "hidden",
              }}
            >
                <img
                  src={headshotUrl}
                  alt={`${name} headshot`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 180,
                height: 220,
                borderRadius: 12,
                backgroundColor: "#e5e5e5",
                border: "3px solid #d4d4d4",
              }}
            >
              {/* User icon placeholder */}
              <svg
                width="80"
                height="80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a3a3a3"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}

          {/* Info */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 10,
              flex: 1,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "#171717",
                lineHeight: 1.2,
              }}
            >
              {name.length > 20 ? name.slice(0, 20) + "..." : name}
            </span>
            <span
              style={{
                fontSize: 20,
                color: "#525252",
              }}
            >
              ID:{" "}
              {idNumber !== undefined && idNumber !== null
                ? String(idNumber)
                : "N/A"}
            </span>
            <span
              style={{
                fontSize: 18,
                color: "#737373",
              }}
            >
              {email.length > 30 ? email.slice(0, 30) + "..." : email}
            </span>
          </div>
        </div>

        {/* Events Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: `${PADDING / 2}px ${PADDING}px`,
            flex: 1,
            gap: 4,
          }}
        >
          {events.map((event, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                height: EVENT_ROW_HEIGHT,
                paddingLeft: 12,
                paddingRight: 12,
                backgroundColor: index % 2 === 0 ? "#ffffff" : "#f5f5f5",
                borderRadius: 8,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  color: "#404040",
                  flex: 1,
                }}
              >
                {event.name}
              </span>
              {event.attended ? <CheckIcon /> : <XIcon />}
            </div>
          ))}
        </div>

        {/* Footer Section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: PADDING,
            borderTop: "3px solid #e5e5e5",
            backgroundColor: "#fef2f2",
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#b91c1c",
            }}
          >
            Total Events Attended: {totalAttended}
          </span>
        </div>
      </div>,
      {
        width: WIDTH,
        height: height,
      },
    );
  } catch (error) {
    console.error("Image generation error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate image" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
