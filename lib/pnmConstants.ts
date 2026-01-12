export const EVENT_HEADERS = [
  "1/29 | Info & Community Service",
  "1/30 | Info & PD",
  "2/2 | Speed Networking",
  "2/3 | Brotherhood Night",
  "2/5 | Engineering Challenge",
  "2/6 | Food Friday"
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

