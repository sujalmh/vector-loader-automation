"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Play, RotateCcw, FileText, CheckCircle, Clock, AlertCircle, BookOpen, Eye } from "lucide-react"
import type { FileData, AnalysisData } from "@/app/page"

// The AnalysisResult type from your prompt, for clarity
// You would typically define this in a shared types file
// Pydantic's Optional[List] maps to (string[] | null) or similar in TS
type AnalysisResult = {
    file_name?: string | null;
    content_type?: string | null;
    domain?: string | null;
    subdomain?: string | null;
    intents?: string | string[] | null;
    publishing_authority?: string | null;
    published_date?: string | null;
    period_of_reference?: string | null;
    brief_summary?: string | null;
    document_size?: string | null;
    extra_fields?: Record<string, any>;
    error?: string | null;
};

interface ApiResult {
  fileName: string;
  qualityMetrics: {
    parseAccuracy: number;
    complexity: number;
  };
  classification: "Structured" | "Semi-Structured" | "Unstructured";
  analysis: AnalysisData;
}

interface FileProcessingProps {
  files: FileData[]
  setFiles: (updater: (prevFiles: FileData[]) => FileData[]) => void
  progress: number
  setProgress: (progress: number) => void
}


export default function FileProcessing({ files, setFiles, progress, setProgress }: FileProcessingProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null);
  const [processedFileCount, setProcessedFileCount] = useState(0);
  
  // State to hold the file whose details are being viewed in the modal
  const [selectedFileForDetails, setSelectedFileForDetails] = useState<FileData | null>(null);

  const selectedFiles = files.filter((f) => f.selected)

  const startProcessing = async () => {
    setIsProcessing(true)
    setProgress(0)
    setError(null)
    setProcessedFileCount(0)

    setFiles((prevFiles) =>
      prevFiles.map((f) =>
        f.selected
          ? {
              ...f,
              processed: false,
              qualityMetrics: undefined,
              classification: undefined,
              analysis: undefined,
            }
          : f,
      ),
    )

    const formData = new FormData()
    selectedFiles.forEach((file) => {
      if (file.file) {
        formData.append("files", file.file)
      }
    })

    const progressInterval = setInterval(() => {
        setProgress(oldProgress => oldProgress < 95 ? oldProgress + 1 : oldProgress);
    }, processedFileCount * 30);


    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/process-files`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Processing failed. Check the server." }));
        throw new Error(errorData.detail);
      }

      const results: ApiResult[] = await response.json()
      
      setFiles((prevFiles) => {
        const resultMap = new Map(results.map(r => [r.fileName, r]));
        return prevFiles.map(file => {
          const result = resultMap.get(file.name);
          if (file.selected && result) {
            return {
              ...file,
              processed: true,
              qualityMetrics: result.qualityMetrics,
              classification: result.classification,
              analysis: result.analysis,
            };
          }
          return file;
        });
      });
      
      setProcessedFileCount(results.length);
      setProgress(100);

    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err.message || "An unknown error occurred. Is the backend server running?");
      setProgress(0);
    } finally {
      setIsProcessing(false)
    }
  }

  const resetProcessing = () => {
    setFiles(prevFiles =>
      prevFiles.map((f) => ({
        ...f,
        processed: false,
        qualityMetrics: undefined,
        classification: undefined,
        analysis: undefined,
      })),
    )
    setProgress(0)
    setError(null);
    setProcessedFileCount(0);
  }

  // --- Helper functions for rendering ---

  const getQualityBadge = (score: number) => {
    if (score >= 3) return <Badge className="bg-green-500 hover:bg-green-600">Excellent</Badge>
    if (score >= 2) return <Badge className="bg-yellow-500 hover:bg-yellow-600">Good</Badge>
    if (score >= 1) return <Badge className="bg-orange-500 hover:bg-orange-600">Fair</Badge>
    return <Badge variant="destructive">Poor</Badge>
  }

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case "Structured":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Structured</Badge>
      case "Semi-Structured":
        return <Badge className="bg-purple-500 hover:bg-purple-600">Semi-Structured</Badge>
      case "Unstructured":
        return <Badge className="bg-gray-500 hover:bg-gray-600">Unstructured</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getComplexityDisplay = (score: number) => {
    switch (Math.round(score)) {
      case 1:
        return <Badge className="bg-red-500 hover:bg-red-600">Hard</Badge>;
      case 2:
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Medium</Badge>;
      case 3:
        return <Badge className="bg-green-500 hover:bg-green-600">Easy</Badge>;
      default:
        return <Badge variant="outline">N/A</Badge>;
    }
  }

  const getFileStatus = (file: FileData) => {
    if (file.processed) {
      return <CheckCircle className="w-5 h-5 text-green-500" />
    }
    if (isProcessing && file.selected) {
      return <Clock className="w-5 h-5 text-blue-500 animate-spin" />
    }
    return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
  }

  // Helper component to render each detail item in the modal
  const DetailItem = ({ label, value }: { label: string, value: React.ReactNode }) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 py-2 border-b">
        <dt className="font-semibold text-gray-600">{label}</dt>
        <dd className="md:col-span-2 text-gray-800">{value}</dd>
      </div>
    );
  };
  

  // --- Render ---

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Step 2: File Processing</h2>
        <p className="text-gray-600">Analyze data quality and classify file types via API</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Processing Control</CardTitle>
          <CardDescription>Process {selectedFiles.length} selected files to compute quality metrics.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
            <div className="flex items-center gap-4">
                <Button onClick={startProcessing} disabled={isProcessing || selectedFiles.length === 0} className="flex items-center gap-2 w-40">
                    <Play className="w-4 h-4" />
                    {isProcessing ? "Processing..." : "Start Processing"}
                </Button>
                <Button variant="outline" onClick={resetProcessing} disabled={isProcessing} className="flex items-center gap-2 bg-transparent">
                    <RotateCcw className="w-4 h-4" />
                    Reset
                </Button>
            </div>
            <div className="flex-1 w-full">
                <div className="flex justify-between text-sm mb-1">
                    <span>Progress</span>
                    <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
            </div>
          </div>
          
          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
              <AlertCircle className="w-4 h-4" />
              <span>Error: {error}</span>
            </div>
          )}

          <div className="text-sm text-gray-600 mt-2">
            Status: {isProcessing ? "Sending files to server..." : `${processedFileCount} of ${selectedFiles.length} files processed.`}
          </div>
        </CardContent>
      </Card>

      {selectedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Results</CardTitle>
            <CardDescription>Data quality metrics and classifications from the server.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Status</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Parse Accuracy</TableHead>
                  <TableHead>Complexity</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedFiles.map((file) => (
                  <TableRow key={file.id} className={file.processed ? "bg-green-50/50" : ""}>
                    <TableCell>{getFileStatus(file)}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        {file.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {file.qualityMetrics ? (
                        <div className="flex items-center gap-2">
                          <span>{file.qualityMetrics.parseAccuracy}/3</span>
                          {getQualityBadge(file.qualityMetrics.parseAccuracy)}
                        </div>
                      ) : (
                        <span className="text-gray-400">
                          {isProcessing && file.selected ? "Processing..." : "Pending"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {file.qualityMetrics ? (
                        <div className="flex items-center gap-2">
                          <span>{Math.round(file.qualityMetrics.complexity)}/3</span>
                          {getComplexityDisplay(file.qualityMetrics.complexity)}
                        </div>
                      ) : (
                        <span className="text-gray-400">
                          {isProcessing && file.selected ? "Processing..." : "Pending"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {file.analysis?.domain ? (
                         <Badge variant="outline">{file.analysis.domain}</Badge>
                      ) : (
                        <span className="text-gray-400">
                          {isProcessing && file.selected ? "Analyzing..." : "Pending"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 max-w-xs truncate">
                      {file.analysis?.brief_summary ? (
                        <div className="flex items-start gap-2">
                          <BookOpen className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{file.analysis.brief_summary}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">
                          {isProcessing && file.selected ? "Analyzing..." : "Pending"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {file.processed && (
                         <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedFileForDetails(file)}
                            className="flex items-center gap-1"
                         >
                            <Eye className="w-4 h-4" /> View
                         </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* --- Details Modal --- */}
      {selectedFileForDetails && selectedFileForDetails.analysis && (
        <Dialog open={!!selectedFileForDetails} onOpenChange={() => setSelectedFileForDetails(null)}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        {selectedFileForDetails.analysis.file_name || selectedFileForDetails.name}
                    </DialogTitle>
                    <DialogDescription>
                        Detailed analysis and metadata extracted from the document.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="text-sm">
                    <dl>
                        <DetailItem label="Brief Summary" value={selectedFileForDetails.analysis.brief_summary} />
                        <DetailItem label="Domain" value={<Badge variant="outline">{selectedFileForDetails.analysis.domain}</Badge>} />
                        <DetailItem label="Subdomain" value={selectedFileForDetails.analysis.subdomain} />
                        <DetailItem label="Publishing Authority" value={selectedFileForDetails.analysis.publishing_authority} />
                        <DetailItem label="Published Date" value={selectedFileForDetails.analysis.published_date} />
                        <DetailItem label="Period of Reference" value={selectedFileForDetails.analysis.period_of_reference} />
                        <DetailItem label="Document Size" value={selectedFileForDetails.analysis.document_size} />
                        
                        <DetailItem 
                            label="Intents" 
                            value={
                                <div className="flex flex-wrap gap-1">
                                  {selectedFileForDetails.analysis.intents && (
                                    <>
                                      {Array.isArray(selectedFileForDetails.analysis.intents)
                                        ? selectedFileForDetails.analysis.intents.map((intent, idx) => (
                                            <Badge key={idx} variant="default">{intent}</Badge>
                                          ))
                                        : <Badge variant="default">{selectedFileForDetails.analysis.intents}</Badge>}
                                    </>
                                  )}
                                </div>
                            }
                        />

                        {/* Render extra_fields if they exist */}
                        {selectedFileForDetails.analysis.extra_fields && Object.entries(selectedFileForDetails.analysis.extra_fields).map(([key, value]) => (
                            <DetailItem 
                                key={key}
                                label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                value={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                            />
                        ))}

                         {/* Display error if one occurred during analysis for this specific file */}
                        {selectedFileForDetails.analysis.error && (
                            <DetailItem
                                label="Analysis Error"
                                value={<div className="text-red-600 p-2 bg-red-50 rounded-md">{selectedFileForDetails.analysis.error}</div>}
                            />
                        )}
                    </dl>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedFileForDetails(null)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </div>
  )
}