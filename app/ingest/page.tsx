"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { appendToLocalStorageCsv } from "@/lib/localStorageCsv";
import { EVENT_HEADERS } from "@/lib/pnmConstants";
import { supabase } from "@/lib/supabaseClient";

const INGEST_BACKUP_KEY = "ingestCsvBackup";
const INGEST_BACKUP_HEADERS = [
  "timestamp",
  "pnmName",
  "wiscEmail",
  "studentId",
  "eventType",
  "photoFileName",
  "photoFileSize",
];

// Helper function to convert text to title case
const toTitleCase = (str: string): string => {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function Ingest() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [pnmName, setPnmName] = useState("");
  const [wiscEmail, setWiscEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("Freshman");
  const [eventType, setEventType] = useState(EVENT_HEADERS[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check Supabase authentication
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
    }
  };

  const processHeadshot = (file: File, targetWidth = 450, targetHeight = 600): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        const targetAspectRatio = targetWidth / targetHeight;
        const sourceWidth = img.width;
        const sourceHeight = img.height;
        const sourceAspectRatio = sourceWidth / sourceHeight;

        let sX = 0;
        let sY = 0;
        let sWidth = sourceWidth;
        let sHeight = sourceHeight;

        if (sourceAspectRatio > targetAspectRatio) {
          sWidth = sourceHeight * targetAspectRatio;
          sX = (sourceWidth - sWidth) / 2;
        } else {
          sHeight = sourceWidth / targetAspectRatio;
          sY = (sourceHeight - sHeight) / 2;
        }

        ctx.drawImage(img, sX, sY, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const processedFile = new File([blob], `${studentId}.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(processedFile);
            } else {
              reject(new Error("Canvas to Blob conversion failed"));
            }
          },
          "image/jpeg",
          0.8
        );
      };
      img.onerror = (err) => reject(err);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!photoFile) {
      toast.error("Please upload or take a headshot photo");
      setIsLoading(false);
      return;
    }

    if (studentId.length !== 10) {
      toast.error("Wiscard IDs must be exactly 10 digits");
      setIsLoading(false);
      return;
    }

    appendToLocalStorageCsv(INGEST_BACKUP_KEY, INGEST_BACKUP_HEADERS, [
      new Date().toISOString(),
      pnmName,
      wiscEmail,
      studentId,
      eventType,
      photoFile.name,
      photoFile.size.toString(),
    ]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // 1. Crop, Resize, and Compress image on the client
      const processedImageFile = await processHeadshot(photoFile);

      // 2. Upload to Supabase Storage Bucket 'pnm-headshots'
      const fileName = `${studentId}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("pnm-headshots")
        .upload(fileName, processedImageFile, {
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) {
        throw new Error(`Storage Upload Error: ${uploadError.message}`);
      }

      // 3. Get Storage Public URL
      const { data: { publicUrl } } = supabase.storage
        .from("pnm-headshots")
        .getPublicUrl(fileName);

      // 4. Map Event Types to event columns
      const eventIndex = EVENT_HEADERS.indexOf(eventType);
      const pnmRecord = {
        student_id: studentId,
        full_name: pnmName,
        email: wiscEmail,
        headshot_url: publicUrl,
        event_1: eventIndex === 0,
        event_2: eventIndex === 1,
        event_3: eventIndex === 2,
        event_4: eventIndex === 3,
        event_5: eventIndex === 4,
        event_6: eventIndex === 5,
        major: major,
        year: year,
      };

      // 5. Insert Record to public.pnms table in Supabase
      const { error: insertError } = await supabase
        .from("pnms")
        .insert([pnmRecord]);

      if (insertError) {
        if (insertError.code === "23505") {
          toast.error("A PNM with this Student ID is already registered.");
        } else {
          toast.error(insertError.message || "Failed to save PNM record.");
        }
        setIsLoading(false);
        return;
      }

      toast.success("PNM added successfully!");
      // Reset form
      setPnmName("");
      setWiscEmail("");
      setStudentId("");
      setMajor("");
      setYear("Freshman");
      setPhotoFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error("Submit error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="text-xl font-medium text-gray-600">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center font-sans p-4">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-2xl">
        <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-4">
          Add PNM
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="pnmName" className="text-lg font-medium">
              PNM Full Name:
            </label>
            <input
              type="text"
              id="pnmName"
              value={pnmName}
              onChange={(e) => setPnmName(toTitleCase(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
              placeholder="Enter PNM name"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="wiscEmail" className="text-lg font-medium">
              Wisc Email:
            </label>
            <input
              type="email"
              id="wiscEmail"
              value={wiscEmail}
              onChange={(e) => setWiscEmail(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
              placeholder="Enter @wisc.edu email"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="studentId" className="text-lg font-medium">
              Student ID:
            </label>
            <input
              type="text"
              id="studentId"
              value={studentId}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                setStudentId(value);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-gray-900"
              placeholder="Enter student ID (10 digits)"
              required
              maxLength={10}
            />
            <p className="text-sm text-gray-500">
              Wiscard IDs must be exactly 10 digits.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="major" className="text-lg font-medium">
                Major:
              </label>
              <input
                type="text"
                id="major"
                value={major}
                onChange={(e) => setMajor(toTitleCase(e.target.value))}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-gray-900"
                placeholder="Computer Engineering"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="year" className="text-lg font-medium">
                Academic Year:
              </label>
              <select
                id="year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent bg-white text-gray-900"
                required
              >
                <option value="Freshman">Freshman</option>
                <option value="Sophomore">Sophomore</option>
                <option value="Junior">Junior</option>
                <option value="Senior">Senior</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="eventType" className="text-lg font-medium">
              Event Attending:
            </label>
            <select
              id="eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent bg-white"
              required
            >
              {EVENT_HEADERS.map((event) => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-500">
              This will mark the PNM as present for the selected event.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="photo" className="text-lg font-medium">
              Headshot Photo:
            </label>
            <input
              ref={fileInputRef}
              id="photo"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-red-700 file:text-white hover:file:bg-red-800 file:cursor-pointer cursor-pointer"
            />
          </div>

          {isLoading && (
            <p className="text-sm text-gray-600 mt-2">
              Processing... This may take 10-15 seconds.
            </p>
          )}

          <div className="flex gap-4 mt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Submitting..." : "Add PNM"}
            </button>
            <Link
              href="/"
              className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 transition-all duration-300 text-center"
            >
              Back
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

