import { unwrapResult } from "@reduxjs/toolkit";
import { JSONContent } from "@tiptap/react";
import {
  SharedConfigSchema,
  modifyAnyConfigWithSharedConfig,
} from "core/config/sharedConfig";
import { useContext, useEffect, useRef, useState } from "react";
import Alert from "../../../components/gui/Alert";
import { Card, Divider } from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { updateConfig } from "../../../redux/slices/configSlice";
import { selectCurrentOrg } from "../../../redux/slices/profilesSlice";
import { streamBuildKvCacheThunk } from "../../../redux/thunks/streamBuildKvCache";
import { ConfigHeader } from "../components/ConfigHeader";
import AiDaptivProgressBar from "./AiDaptivProgressBar";

// ============================================
// Configuration Area - Please Fill in the Following
// ============================================

// TODO: Fill in your vLLM endpoint URL
const VLLM_ENDPOINT = "http://localhost:13141/v1"; // e.g.: "http://localhost:8000/v1"

// TODO: Fill in your model name
const MODEL_NAME = "Meta-Llama-3.1-8B-Instruct-Q4_K_M"; // e.g.: "meta-llama/Llama-2-7b-chat-hf"

// TODO: Fill in the prompt to send to LLM (optional, leave empty if no additional prompt needed)
const BUILD_KVCACHE_PROMPT =
  "breifly explain where can i change the game speed? it's too fast"; // e.g.: "Please build the KvCache for this codebase"

// ============================================

function CodebaseSubSection({
  isBuilding,
  progress,
  status,
  statusMessage,
}: {
  isBuilding: boolean;
  progress: number;
  status: "idle" | "building" | "completed" | "failed";
  statusMessage?: string;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="mb-0 text-sm font-semibold">aiDAPTIV+ KvCache Status</h3>
      </div>

      <Card>
        <div className="px-4 py-4">
          <AiDaptivProgressBar
            isBuilding={isBuilding}
            progress={progress}
            status={status}
            message={statusMessage}
          />
          {status === "idle" && (
            <div className="py-2 text-center text-sm text-gray-500">
              Click the Build button above to start building KvCache
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function EnableAiDaptivSetting({
  onStatusChange,
}: {
  onStatusChange: (
    building: boolean,
    progress: number,
    status: "idle" | "building" | "completed" | "failed",
    message?: string,
  ) => void;
}) {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const config = useAppSelector((state) => state.config.config);
  const currentOrg = useAppSelector(selectCurrentOrg);

  // State management
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const buildCancelledRef = useRef(false); // Use ref for immediate access without re-render

  // Monitor global error dialog state
  const showDialog = useAppSelector((state) => state.ui.showDialog);
  const dialogMessage = useAppSelector((state) => state.ui.dialogMessage);

  // Listen for error dialog appearing during build
  useEffect(() => {
    if (showDialog && isBuilding) {
      // Error dialog appeared during build, handle it
      console.log("Error dialog detected during KvCache build");
      buildCancelledRef.current = true; // Mark build as cancelled due to error (using ref for immediate effect)
      setIsBuilding(false);
      setBuildError("Connection error occurred during streaming");
      onStatusChange(false, 0, "failed", "Error: Connection error occurred");
    }
  }, [showDialog, isBuilding, onStatusChange]);

  function handleUpdate(sharedConfig: SharedConfigSchema) {
    const updatedConfig = modifyAnyConfigWithSharedConfig(config, sharedConfig);
    dispatch(updateConfig(updatedConfig));
    ideMessenger.post("config/updateSharedConfig", sharedConfig);
  }

  const disableIndexing = config.disableIndexing ?? false;
  const disableIndexingToggle =
    currentOrg?.policy?.allowCodebaseIndexing === false;

  async function handleEnableClick() {
    // Check if configuration is filled
    if (!VLLM_ENDPOINT || !MODEL_NAME) {
      setBuildError(
        "Please configure VLLM_ENDPOINT and MODEL_NAME in the code first",
      );
      onStatusChange(
        false,
        0,
        "failed",
        "Please configure VLLM_ENDPOINT and MODEL_NAME first",
      );
      return;
    }

    setIsBuilding(true);
    setBuildError(null);
    buildCancelledRef.current = false; // Reset the cancelled flag

    // Initialize progress
    onStatusChange(true, 0, "building", "Initializing...");

    try {
      // 1. Get workspace root directory
      onStatusChange(true, 10, "building", "Getting workspace directory...");
      const workspaceDirs = await ideMessenger.ide.getWorkspaceDirs();

      if (!workspaceDirs || workspaceDirs.length === 0) {
        throw new Error("Workspace directory not found");
      }

      const workspaceRoot = workspaceDirs[0];

      // 2. List all items in workspace root to find first subdirectory
      onStatusChange(
        true,
        15,
        "building",
        "Finding first subdirectory in workspace...",
      );
      const items = await ideMessenger.ide.listDir(workspaceRoot);

      // Filter to get only directories (FileType.Directory = 2)
      // items is an array of [filename, FileType] tuples
      const subdirectories = items
        .filter(([_, fileType]) => fileType === 2) // FileType.Directory = 2
        .map(([filename]) => filename)
        .filter((name) => !name.startsWith(".") && !name.startsWith("__")) // Exclude hidden and cache folders
        .sort(); // Sort alphabetically to get consistent results

      if (subdirectories.length === 0) {
        throw new Error("No subdirectory found in workspace root");
      }

      // Get the first subdirectory (alphabetically) - this is the sub_folder
      const subFolderName = subdirectories[0];
      const separator = workspaceRoot.includes("\\") ? "\\" : "/";
      const subFolderPath = `${workspaceRoot}${workspaceRoot.endsWith(separator) ? "" : separator}${subFolderName}`;

      const firstFolder = subFolderPath;
      const folderName = subFolderName;

      // 2. Update indexing status to 'start processing' (enable indexing)
      onStatusChange(true, 20, "building", "Enabling indexing...");
      handleUpdate({ disableIndexing: false });

      // 3. Construct TipTap editor state with proper Mention node
      // Use "folder_all" to include ALL files in the specified folder
      onStatusChange(
        true,
        30,
        "building",
        "Constructing editor state with folder reference...",
      );

      const mentionNode = {
        type: "mention",
        attrs: {
          id: firstFolder, // Full folder path
          label: folderName,
          itemType: "folder_all", // This triggers FolderAllContextProvider to get ALL files in folder
          query: firstFolder, // The folder path to include all files from
          renderInlineAs: `@${folderName}`,
        },
      };

      const textNode = BUILD_KVCACHE_PROMPT
        ? {
            type: "text",
            text: ` ${BUILD_KVCACHE_PROMPT}`,
          }
        : null;

      const editorState: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: textNode ? [mentionNode, textNode] : [mentionNode],
          },
        ],
      };

      // 4. Dispatch streamBuildKvCacheThunk to send all files in folder + prompt to LLM
      // This will include ONLY the current folder context WITHOUT chat history
      onStatusChange(
        true,
        40,
        "building",
        `Retrieving all files from ${folderName}...`,
      );

      onStatusChange(true, 60, "building", "Sending folder contents to LLM...");

      // Dispatch the thunk with proper modifiers
      const result = await dispatch(
        streamBuildKvCacheThunk({
          editorState,
          modifiers: {
            useCodebase: false, // We're using @folder_all instead
            noContext: true, // Set to true to exclude the currently open file (only include @folder context)
          },
        }),
      );

      // Check if the thunk was rejected or had errors
      if (streamBuildKvCacheThunk.rejected.match(result)) {
        const errorMsg = result.error?.message || "Failed to build KvCache";
        throw new Error(errorMsg);
      }

      // Use unwrapResult to ensure we properly catch any errors
      // This will throw if the thunk was rejected
      unwrapResult(result);

      // Add a small delay to allow error dialog to appear if there was an error
      // Using 100ms is sufficient for React state updates to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if build was cancelled due to error (detected by useEffect)
      // Using ref for immediate access without waiting for state update
      if (buildCancelledRef.current) {
        console.log(
          "Build was cancelled due to streaming error, skipping success message",
        );
        return; // Exit early, don't show success message
      }

      onStatusChange(true, 90, "building", "Processing complete...");

      // 5. Complete - only reach here if no errors
      onStatusChange(
        false,
        100,
        "completed",
        `Successfully completed! KvCache built for ${folderName}`,
      );
      console.log("Build completed successfully with full context!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setBuildError(errorMessage);
      onStatusChange(false, 0, "failed", `Error: ${errorMessage}`);
      console.error("Build KvCache error:", error);
    } finally {
      setIsBuilding(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-start gap-4">
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-medium">Build Kvcache</span>
          <div className="mt-0.5 text-xs text-gray-500">
            <div className="text-foreground">
              Building the Kvcache of your codebase.
              <br />
              <br />
              Note that when starting to build the KvCache, it will take some
              time to complete.
              <br />
              <span className="font-bold text-red-500">
                You must wait until the KvCache build is complete before leaving
                this page.
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleEnableClick}
          disabled={disableIndexingToggle || isBuilding}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            isBuilding
              ? "bg-yellow-600 text-white"
              : "bg-blue-600 text-white hover:bg-blue-700"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isBuilding ? "Building..." : "Build"}
        </button>
      </div>
    </div>
  );
}

export function AiDaptivSettingsSection() {
  const config = useAppSelector((state) => state.config.config);
  const disableIndexing = config.disableIndexing ?? false;

  // Progress bar state management
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "building" | "completed" | "failed"
  >("idle");
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  const handleStatusChange = (
    building: boolean,
    newProgress: number,
    newStatus: "idle" | "building" | "completed" | "failed",
    message?: string,
  ) => {
    setIsBuilding(building);
    setProgress(newProgress);
    setStatus(newStatus);
    setStatusMessage(message);
  };

  return (
    <>
      <ConfigHeader title="aiDAPTIV+" />

      <Alert type="warning" className="mb-6">
        <div className="space-y-4">
          <div>
            <div className="-mt-0.5 text-sm font-medium">
              aiDAPTIV+ KvCache Builder
            </div>
            <div className="mt-1 text-xs">
              Build your codebase KvCache using vLLM/LLM to improve performance
              and response speed.
            </div>
          </div>
          <Divider className="border-inherit" />
          <EnableAiDaptivSetting onStatusChange={handleStatusChange} />
        </div>
      </Alert>

      <CodebaseSubSection
        isBuilding={isBuilding}
        progress={progress}
        status={status}
        statusMessage={statusMessage}
      />
    </>
  );
}
