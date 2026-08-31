export const EVENT_HEADERS = [
  "9/10 | Info & PD",
  "9/11 | Info & Comm Serve",
  "9/14 | Speed Networking",
  "9/15 | Field Day",
  "9/17 | Engineering Challenge",
  "9/18 | Food Friday"
];

export type PNMRecord = {
  Name: {
    text: string;
    imageBase64: string | null;
    imageDataUrl: string | null;
  };
  Email: string;
  "Total Events Attended": number;
  [key: string]: unknown;
};
