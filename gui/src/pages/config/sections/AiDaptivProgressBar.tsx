import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export interface AiDaptivProgressBarProps {
  isBuilding: boolean;
  progress: number;
  status: "idle" | "building" | "completed" | "failed";
  message?: string;
}

function AiDaptivProgressBar({
  isBuilding,
  progress,
  status,
  message,
}: AiDaptivProgressBarProps) {
  if (status === "idle") {
    return null;
  }

  const getStatusColor = () => {
    switch (status) {
      case "building":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "building":
        return <ArrowPathIcon className="animate-spin-slow h-4 w-4" />;
      case "completed":
        return <CheckCircleIcon className="h-4 w-4" />;
      case "failed":
        return <span className="text-xs">✗</span>;
      default:
        return null;
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-foreground">
          {status === "building" && "Processing..."}
          {status === "completed" && "Completed!"}
          {status === "failed" && "Failed"}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-lightgray">{Math.round(progress)}%</span>
          <div className="text-lightgray">{getStatusIcon()}</div>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-md border border-solid border-gray-400">
        <div
          className={`h-full transition-all duration-300 ease-out ${getStatusColor()}`}
          style={{
            width: `${progress}%`,
          }}
        />
      </div>
      {message && <div className="mt-2 text-xs text-gray-500">{message}</div>}
    </div>
  );
}

export default AiDaptivProgressBar;
