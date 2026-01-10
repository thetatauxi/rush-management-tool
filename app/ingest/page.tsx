"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { appendToLocalStorageCsv } from "@/lib/localStorageCsv";

const INGEST_BACKUP_KEY = "ingestCsvBackup";
const INGEST_BACKUP_HEADERS = [
  "timestamp",
  "pnmName",
  "wiscEmail",
  "studentId",
  "photoFileName",
  "photoFileSize",
];

export default function Ingest() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pnmName, setPnmName] = useState("");
  const [wiscEmail, setWiscEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!photoFile) {
      toast.error("Please upload or take a headshot photo");
      setIsLoading(false);
      return;
    }

    // Validate student ID length (exactly 10 digits)
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
      photoFile.name,
      photoFile.size.toString(),
    ]);

    try {
      const password = localStorage.getItem("password");
      if (!password) {
        router.push("/login");
        return;
      }

      // Compress image on submission to reduce request time
      const compressedFile = await imageCompression(photoFile, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      });

      // Convert compressed file to base64
      const reader = new FileReader();
      const base64Image = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          // Extract base64 string from data URL (remove "data:image/...;base64," prefix)
          const base64 = result.includes(",") ? result.split(",")[1] : result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(compressedFile);
      });

      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "ingest",
          fullName: pnmName,
          email: wiscEmail,
          idNumber: studentId,
          image: base64Image,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        toast.success("PNM added successfully!");
        // Reset form
        setPnmName("");
        setWiscEmail("");
        setStudentId("");
        setPhotoFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        toast.error(data.error || "Failed to add PNM");
      }
    } catch (err) {
      console.error("Submit error:", err);
      toast.error("Failed to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-red-300 to-yellow-500/50 font-sans p-4">
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
              onChange={(e) => setPnmName(e.target.value)}
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
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
              placeholder="Enter student ID (10 digits)"
              required
              maxLength={10}
            />
            <p className="text-sm text-gray-500">
              Wiscard IDs must be exactly 10 digits.
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
              accept="image/png"
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

