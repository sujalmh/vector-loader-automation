"use client";

import { useState, FormEvent, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  AlertCircle,
  Bot,
  FileText,
  Link as LinkIcon,
  Calendar,
  Tag,
  BookUser,
} from "lucide-react";

// Assuming FileData is imported from its definition file
type FileData = {
  id: string;
  name: string;
  path: string;
};

// --- 1. TYPE DEFINITIONS ---
interface SearchResultEntity {
  source: string;
  page: number;
  category: string;
  content: string;
  reference: string;
  date: string;
  url: string;
}

interface SearchResult {
  id: number;
  distance: number;
  entity: SearchResultEntity;
}

interface SearchClientProps {
  ingestedFiles: FileData[];
}

export default function SearchClient({ ingestedFiles }: SearchClientProps) {
  const [formData, setFormData] = useState({
    file_id: ingestedFiles[0]?.name || "",
    file_name: ingestedFiles[0]?.name || "",
    query: "What were the total revenues?",
    top_k: 5,
  });
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ingestedFiles.length > 0 && !formData.file_id) {
      setFormData((prev) => ({
        ...prev,
        file_id: ingestedFiles[0].name,
      }));
    }
  }, [ingestedFiles, formData.file_id]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.file_id) {
      setError("Please select a file to search within.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/search/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Search failed.");
      setResults(data.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  console.log(formData);
  return (
    <div className="w-full space-y-6">
      <h2 className="text-2xl font-bold text-center">
        Step 6: Search & Verify
      </h2>
      <p className="text-center text-gray-600">
        Query the documents you just ingested to verify the results in
        real-time.
      </p>

      {/* Search Form (No changes here) */}
      <form
        onSubmit={handleSearch}
        className="space-y-4 max-w-3xl mx-auto p-4 border rounded-lg bg-white"
      >
        <div className="space-y-2">
          <Label htmlFor="file_id">Select Ingested File</Label>
          <Select
            value={formData.file_id}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, file_id: value, file_name: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a file..." />
            </SelectTrigger>
            <SelectContent>
              {ingestedFiles.map((file) => (
                <SelectItem key={file.id} value={file.name}>
                  {file.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="query">Search Query</Label>
          <Input
            id="query"
            value={formData.query}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, query: e.target.value }))
            }
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          {isLoading ? "Searching..." : "Verify by Searching"}
        </Button>
      </form>

      {/* --- MODIFIED RESULTS SECTION --- */}
      <div className="max-w-3xl mx-auto">
        {isLoading && (
          <div className="text-center p-8">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-500" />
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        {results && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">
              Search Results ({results.length})
            </h3>
            {results.length > 0 ? (
              results.map((result) => (
                <div
                  key={result.id}
                  className="p-4 border rounded-lg space-y-3 bg-white shadow-sm"
                >
                  {/* --- TOP HEADER --- */}
                  <div className="flex justify-between items-start text-sm">
                    <div className="flex items-center gap-2 text-gray-600 font-medium">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span>
                        Source:{" "}
                        <span className="font-mono text-xs bg-gray-100 p-1 rounded">
                          {result.entity.source}
                        </span>
                      </span>
                      <span className="text-gray-300">|</span>
                      <span>
                        Page: <strong>{result.entity.page}</strong>
                      </span>
                    </div>
                    <Badge variant="secondary">
                      Score: {(1 - result.distance).toFixed(4)}
                    </Badge>
                  </div>

                  {/* --- MAIN CONTENT --- */}
                  <p className="text-gray-800 bg-gray-50 p-3 rounded-md text-base leading-relaxed">
                    {result.entity.content}
                  </p>

                  {/* --- FOOTER WITH ALL METADATA --- */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t text-xs text-gray-500">
                    <div className="flex items-center gap-1.5" title="Category">
                      <Tag className="w-3.5 h-3.5" />
                      <strong>{result.entity.category}</strong>
                    </div>
                    <div
                      className="flex items-center gap-1.5"
                      title="Reference"
                    >
                      <BookUser className="w-3.5 h-3.5" />
                      <span>{result.entity.reference}</span>
                    </div>
                    <div className="flex items-center gap-1.5" title="Date">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{result.entity.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5" title="URL">
                      <LinkIcon className="w-3.5 h-3.5" />
                      <a
                        href={result.entity.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline truncate max-w-[200px]"
                      >
                        {result.entity.url}
                      </a>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 bg-white rounded-lg border">
                <Bot className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-4">No results found.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
