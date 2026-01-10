export const EVENT_HEADERS = [
  "Event 1: Meet & Greet",
  "Event 2: Speaker Series",
  "Event 3: Facility Tour",
  "Event 4: Social Mixer",
  "Event 5: Professional Workshop",
];

export type StudentRecord = {
  Name: {
    text: string;
    imageBase64: string | null;
    imageDataUrl: string | null;
  };
  Email: string;
  "Total Events Attended": number;
  [key: string]: unknown;
};

