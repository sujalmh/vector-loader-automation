"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Download,
  FileText,
  ChevronDown,
  ChevronRight,
  Database,
  Table,
  BarChart3,
} from "lucide-react";
import type { FileData } from "@/app/page";

export type IngestionDetails = {
  type: "unstructured";
  collection: string;
  chunksCreated: number;
  embeddingsGenerated: number;
  chunkingMethod: string;
  embeddingModel: string;
};

interface FileDataWithDetails
  extends Omit<FileData, "ingestionDetails" | "error"> {
  ingestionDetails?:
    | IngestionDetails
    | IngestionDetails[]
    | { [key: string]: IngestionDetails }
    | null;
  error?: string | null;
}

interface SummaryViewProps {
  files: FileDataWithDetails[];
}

const IngestionDetailView = ({ details }: { details: IngestionDetails }) => {
  return (
    <div className="p-3 border rounded space-y-2 text-sm bg-gray-50/50">
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-4 h-4 text-purple-500" />
        <span className="font-medium">Vector Ingestion</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <strong>Collection:</strong> {details.collection}
        </div>
        <div>
          <strong>Chunking Method:</strong> {details.chunkingMethod}
        </div>
        <div>
          <strong>Embedding Model:</strong> {details.embeddingModel}
        </div>
        <div>
          <strong>Chunks Created:</strong> {details.chunksCreated}
        </div>
      </div>
    </div>
  );
};

export default function SummaryView({ files }: SummaryViewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const processedFiles = files.filter((f) => f.processed);
  const selectedFiles = files.filter((f) => f.selected && f.processed);
  const successfulIngestions = selectedFiles.filter(
    (f) => f.ingestionStatus === "success"
  );
  const failedIngestions = selectedFiles.filter(
    (f) => f.ingestionStatus === "failed"
  );

  const toggleFileExpansion = (fileId: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(fileId)) {
      newExpanded.delete(fileId);
    } else {
      newExpanded.add(fileId);
    }
    setExpandedFiles(newExpanded);
  };

  const exportReport = (format: "pdf" | "json") => {
    const reportData = {
      summary: {
        totalFiles: processedFiles.length,
        selectedFiles: selectedFiles.length,
        successfulIngestions: successfulIngestions.length,
        failedIngestions: failedIngestions.length,
      },
      files: selectedFiles.map((file) => ({
        name: file.name,
        qualityMetrics: file.qualityMetrics,
        ingestionStatus: file.ingestionStatus,
        ingestionDetails: file.ingestionDetails,
        error: file.error,
      })),
      timestamp: new Date().toISOString(),
    };

    if (format === "json") {
      const blob = new Blob([JSON.stringify(reportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data-loader-report-${
        new Date().toISOString().split("T")[0]
      }.json`;
      a.click();
      URL.revokeObjectURL(url); // Clean up the object URL
    } else {
      // A proper implementation would use a library like jsPDF.
      const modal = document.createElement("div");
      modal.style.cssText =
        "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;";
      modal.innerHTML = `
                <div style="background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
                    <p style="margin-bottom: 1rem;">PDF report generation would be implemented with a library like jsPDF.</p>
                    <button id="close-modal-btn" style="padding: 0.5rem 1rem; border: 1px solid #ccc; border-radius: 0.25rem; cursor: pointer;">Close</button>
                </div>
            `;
      document.body.appendChild(modal);
      document
        .getElementById("close-modal-btn")
        ?.addEventListener("click", () => {
          document.body.removeChild(modal);
        });
    }
  };

  console.log(selectedFiles);

  // Helper function to normalize ingestionDetails into an array
  const getIngestionDetailsAsArray = (
    details: FileDataWithDetails["ingestionDetails"]
  ): IngestionDetails[] => {
    if (!details) {
      return []; // Return empty array if details are null or undefined
    }
    if (Array.isArray(details)) {
      return details; // Return as-is if it's already an array
    }
    // This is the corrected part:
    // If it's a single object, wrap it in an array instead of splitting its values.
    if (typeof details === "object" && details !== null) {
      return [details];
    }
    return []; // Fallback for any other unexpected type
  };
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Step 6: Summary & Report</h2>
        <p className="text-gray-600">
          Comprehensive overview of the data loading process
        </p>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {processedFiles.length}
            </div>
            <div className="text-sm text-gray-600">Files Processed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {successfulIngestions.length}
            </div>
            <div className="text-sm text-gray-600">Successful Ingestions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {failedIngestions.length}
            </div>
            <div className="text-sm text-gray-600">Failed Ingestions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {Math.round(
                (successfulIngestions.length / (selectedFiles.length || 1)) *
                  100
              )}
              %
            </div>
            <div className="text-sm text-gray-600">Success Rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed File Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed File Summary</CardTitle>
          <CardDescription>
            Comprehensive analysis and insights for each processed file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {selectedFiles.map((file) => (
              <Collapsible key={file.id}>
                <div className="border rounded-lg p-4">
                  <CollapsibleTrigger
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => toggleFileExpansion(file.id)}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      {expandedFiles.has(file.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <FileText className="w-4 h-4" />
                      <span className="font-medium">{file.name}</span>
                      {file.ingestionStatus === "success" ? (
                        <Badge className="bg-green-100 text-green-800">
                          ✓ Success
                        </Badge>
                      ) : (
                        <Badge variant="destructive">✗ Failed</Badge>
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="mt-4">
                    <div className="space-y-4 pl-7">
                      {/* Quality Metrics */}
                      {file.qualityMetrics && (
                        <div>
                          <h4 className="font-semibold mb-2">
                            Quality Assessment
                          </h4>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="p-2 border rounded">
                              <div className="font-medium">Parse Accuracy</div>
                              <div>{file.qualityMetrics.parseAccuracy}/3</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Ingestion Details (API Results) */}
                      {file.ingestionStatus === "success" && (
                        <div>
                          <h4 className="font-semibold mb-2">
                            Ingestion Summary
                          </h4>
                          <div className="space-y-3">
                            {getIngestionDetailsAsArray(
                              file.ingestionDetails
                            ).map((details, index) => (
                              <IngestionDetailView
                                key={index}
                                details={details}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ingestion Failure Message */}
                      {file.ingestionStatus === "failed" && file.error && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">
                          <strong>Error:</strong> {file.error}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Report
          </CardTitle>
          <CardDescription>
            Generate a comprehensive report of the data loading process
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => exportReport("pdf")}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export as PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport("json")}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export as JSON
            </Button>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p>The report includes:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Complete processing statistics and success rates</li>
              <li>Detailed quality metrics for each file</li>
              <li>Database ingestion logs and schema information</li>
              <li>Configuration details and connection information</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
