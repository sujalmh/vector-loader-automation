"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Play, ChevronDown, ChevronRight, Database, FileText, Table, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react"
import type { FileData } from "@/app/page"

type UnstructuredIngestionDetails = {
    type: "unstructured";
    collection: string;
    chunksCreated: number;
    embeddingsGenerated: number;
    chunkingMethod: string;
    embeddingModel: string;
};

type IngestionDetails = (UnstructuredIngestionDetails) & {
    startTime: string;
    endTime: string;
};

type FileIngestionResult = {
    fileName: string;
    fileSize: number;
    status: "success" | "failed";
    ingestionDetails: IngestionDetails | IngestionDetails[] | null;
    error: string | null;
};

interface IngestionProcessProps {
    files: FileData[]
    setFiles: (files: (prevFiles: FileData[]) => FileData[]) => void
    progress: number
    setProgress: (progress: number) => void
}

export default function IngestionProcess({
    files,
    setFiles,
    progress,
    setProgress,
}: IngestionProcessProps) {
    const [isIngesting, setIsIngesting] = useState(false)
    const [apiError, setApiError] = useState<string | null>(null);
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

    const selectedFiles = files.filter((f) => f.selected && f.processed)

    /**
     * Handles the API call for ingesting a list of files.
     * It sets the file status to "pending", sends the data, and processes the response.
     */
    const handleIngestion = async (filesToProcess: FileData[]) => {
        if (filesToProcess.length === 0) return;

        setIsIngesting(true);
        setApiError(null);

        // Set the files being processed to "pending" and clear old errors
        setFiles((prevFiles) =>
            prevFiles.map((f) =>
                filesToProcess.some(p => p.id === f.id)
                    ? { ...f, ingestionStatus: "pending" as const, ingestionDetails: null, error: undefined }
                    : f
            )
        );

        const formData = new FormData();
        const fileDetails = filesToProcess.map(fileData => {
            const { file, ...details } = fileData;
            if (file) {
                formData.append("files", file);
            }
            return details;
        });

        formData.append("file_details", JSON.stringify(fileDetails));

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            const response = await fetch(`${apiUrl}/ingest/`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Ingestion request failed");
            }

            const resultData: { results: FileIngestionResult[] } = await response.json();
            const results = resultData.results;
            console.log("Ingestion API response:", results);

            // Update file statuses based on the API response
            setFiles((prevFiles) => {
                const newFiles = [...prevFiles];
                results.forEach((result) => {
                    const fileIndex = newFiles.findIndex(f => f.name === result.fileName);
                    if (fileIndex !== -1) {
                        
                        const processIngestionDetails = (details: IngestionDetails | IngestionDetails[] | null): IngestionDetails | IngestionDetails[] | null => {
                            if (!details) {
                                return null;
                            }
                            const now = new Date().toISOString();
                            if (Array.isArray(details)) {
                                return details.map(d => ({
                                    ...d,
                                    startTime: now,
                                    endTime: now,
                                }));
                            } else {
                                return {
                                    ...details,
                                    startTime: now,
                                    endTime: now,
                                };
                            }
                        };

                        newFiles[fileIndex] = {
                            ...newFiles[fileIndex],
                            ingestionStatus: result.status,
                            ingestionDetails: processIngestionDetails(result.ingestionDetails),
                            error: result.error || undefined,
                        };
                    }
                });
                return newFiles;
            });

        } catch (error) {
            console.error("Ingestion API error:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            setApiError(errorMessage);

            // Mark pending files as failed on API error
            setFiles((prevFiles) =>
                prevFiles.map((f) =>
                    f.ingestionStatus === "pending"
                        ? { ...f, ingestionStatus: "failed" as const, error: "API connection failed" }
                        : f
                )
            );
        } finally {
            setIsIngesting(false);
            setProgress(100);
        }
    }

    // Starts the initial ingestion for all selected files
    const startIngestion = async () => {
        setProgress(0);
        const filesToIngest = files.filter((f) => f.selected && f.processed);
        await handleIngestion(filesToIngest);
    }

    // Retries ingestion only for the files that previously failed
    const retryFailedIngestion = async () => {
        const failedFiles = files.filter((f) => f.ingestionStatus === "failed");
        await handleIngestion(failedFiles);
    }

    const toggleFileExpansion = (fileId: string) => {
        const newExpanded = new Set(expandedFiles)
        if (newExpanded.has(fileId)) {
            newExpanded.delete(fileId)
        } else {
            newExpanded.add(fileId)
        }
        setExpandedFiles(newExpanded)
    }

    const getStatusBadge = (status?: string) => {
        switch (status) {
            case "success":
                return <Badge className="bg-green-500 hover:bg-green-600">✓ Success</Badge>
            case "failed":
                return <Badge variant="destructive">✗ Failed</Badge>
            case "pending":
                return <Badge className="bg-yellow-500 text-white">⏳ Processing</Badge>
            default:
                return <Badge variant="outline">Waiting</Badge>
        }
    }

    const renderIngestionDetails = (details: IngestionDetails) => {
        return (
            <div className="space-y-4">
                <div className="space-y-3 border-l-2 border-purple-500 pl-4">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-purple-500" />
                        <h4 className="font-semibold">Vector Ingestion Details</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div><strong>Collection:</strong> {details.collection}</div>
                        <div><strong>Chunks Created:</strong> {details.chunksCreated.toLocaleString()}</div>
                        <div><strong>Embeddings:</strong> {details.embeddingsGenerated.toLocaleString()}</div>
                        <div><strong>Chunking Method:</strong> {details.chunkingMethod}</div>
                        <div className="md:col-span-2"><strong>Embedding Model:</strong> {details.embeddingModel}</div>
                    </div>
                </div>
                <div className="text-xs text-gray-500 pt-2 border-t mt-4">
                    <div>Started: {new Date(details.startTime).toLocaleString()}</div>
                    <div>Completed: {new Date(details.endTime).toLocaleString()}</div>
                </div>
            </div>
        );
    };

    const successCount = selectedFiles.filter((f) => f.ingestionStatus === "success").length
    const failedCount = selectedFiles.filter((f) => f.ingestionStatus === "failed").length
    const pendingCount = selectedFiles.filter((f) => f.ingestionStatus === "pending").length
    const progressValue = selectedFiles.length > 0 ? (successCount + failedCount) / selectedFiles.length * 100 : progress;

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Step 5: Ingestion Process</h2>
                <p className="text-gray-600">Ingest selected files into configured databases</p>
            </div>

            {/* Ingestion Control Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Ingestion Control</CardTitle>
                    <CardDescription>Ingest {selectedFiles.length} selected files into databases</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                        <Button
                            onClick={startIngestion}
                            disabled={isIngesting || selectedFiles.length === 0}
                            className="flex items-center gap-2"
                        >
                            <Play className="w-4 h-4" />
                            {isIngesting ? "Ingesting..." : "Start Ingestion"}
                        </Button>
                        
                        {failedCount > 0 && !isIngesting && (
                            <Button
                                onClick={retryFailedIngestion}
                                disabled={isIngesting}
                                variant="outline"
                                className="flex items-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Retry {failedCount} Failed
                            </Button>
                        )}

                        <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                                <span>Progress</span>
                                <span>{Math.round(progressValue)}%</span>
                            </div>
                            <Progress value={progressValue} className="w-full" />
                        </div>
                    </div>

                    {apiError && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-sm font-medium">Error: {apiError}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-4 mt-4">
                        <div className="text-center p-2 border rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{successCount}</div>
                            <div className="text-sm text-gray-600">Successful</div>
                        </div>
                        <div className="text-center p-2 border rounded-lg">
                            <div className="text-2xl font-bold text-red-600">{failedCount}</div>
                            <div className="text-sm text-gray-600">Failed</div>
                        </div>
                        <div className="text-center p-2 border rounded-lg">
                            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                            <div className="text-sm text-gray-600">Processing</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Ingestion Results Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Ingestion Results</CardTitle>
                    <CardDescription>Detailed results for each file ingestion</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {selectedFiles.map((file) => (
                            <Collapsible key={file.id} open={expandedFiles.has(file.id)} onOpenChange={() => toggleFileExpansion(file.id)}>
                                <div className="border rounded-lg p-4">
                                    <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                                        <div className="flex items-center gap-3">
                                            {expandedFiles.has(file.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            <FileText className="w-4 h-4" />
                                            <span className="font-medium">{file.name}</span>
                                            {getStatusBadge(file.ingestionStatus)}
                                        </div>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent className="mt-4 pt-4 border-t pl-8">
                                        {file.ingestionStatus === 'failed' && file.error && (
                                            <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">
                                                <strong>Error:</strong> {file.error}
                                            </div>
                                        )}
                                        {file.ingestionDetails && (
                                            <div className="space-y-4">
                                                {/* This logic correctly handles both an array and a single object */}
                                                {(Array.isArray(file.ingestionDetails) ? file.ingestionDetails : [file.ingestionDetails]).map(
                                                    (details, index) => (
                                                        <div key={index}>
                                                            {renderIngestionDetails(details)}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </CollapsibleContent>
                                </div>
                            </Collapsible>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Completion Message */}
            {!isIngesting && progress === 100 && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-800">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Ingestion Complete!</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                        {successCount} files ingested successfully. {failedCount > 0 && `${failedCount} files failed.`}
                    </p>
                </div>
            )}
        </div>
    );
}
