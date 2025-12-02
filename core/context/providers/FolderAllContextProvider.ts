import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
  ContextSubmenuItem,
  LoadSubmenuItemsArgs,
} from "../../index.js";
import { walkDir, walkDirs } from "../../indexing/walkDir.js";
import {
  getShortestUniqueRelativeUriPaths,
  getUriPathBasename,
} from "../../util/uri.js";
import { BaseContextProvider } from "../index.js";

// 配置常數
const MAX_FILES = 50; // 最大檔案數量
const MAX_BYTES_PER_FILE = 100000; // 每個檔案最大位元組數 (100KB)
const MAX_TOTAL_BYTES = 2000000; // 總計最大位元組數 (2MB)

// 過濾二進位檔案的副檔名
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.mp3', '.wav', '.flac', '.aac', '.ogg',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.exe', '.dll', '.so', '.dylib',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.db', '.sqlite', '.sqlite3',
  '.bin', '.dat', '.log'
]);

// 需要忽略的資料夾
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'out', 'target',
  '.vscode', '.idea', '.vs',
  'coverage', '.nyc_output',
  '.next', '.nuxt', '.cache'
]);

class FolderAllContextProvider extends BaseContextProvider {
  static description: ContextProviderDescription = {
    title: "folder_all",
    displayTitle: "Folder (All Files)",
    description: "Attach all files in a selected folder",
    type: "submenu",
  };

  async getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]> {
    // 從 query 中提取選中的資料夾 URI
    const selectedFolderUri = query;
    
    if (!selectedFolderUri) {
      return [];
    }

    try {
      // 遍歷選定資料夾下的所有檔案
      const fileUris = await walkDir(selectedFolderUri, extras.ide, {
        include: "files",
        source: "folder_all - get all files",
        recursive: true,
      });

      // 過濾檔案
      const filteredFiles = this.filterFiles(fileUris);
      
      if (filteredFiles.length === 0) {
        return [{
          name: "No Files Found",
          description: "No text files found in the selected folder",
          content: "The selected folder contains no readable text files or all files were filtered out due to size/type restrictions.",
        }];
      }

      // 讀取檔案內容
      const contextItems: ContextItem[] = [];
      let totalBytes = 0;
      let processedFiles = 0;

      for (const fileUri of filteredFiles) {
        if (processedFiles >= MAX_FILES) {
          contextItems.push({
            name: "Files Limit Reached",
            description: `Only showing first ${MAX_FILES} files`,
            content: `Maximum file limit of ${MAX_FILES} reached. Additional files were not included.`,
          });
          break;
        }

        try {
          const content = await extras.ide.readFile(fileUri);
          const contentBytes = new Blob([content]).size;

          // 檢查單檔大小限制
          if (contentBytes > MAX_BYTES_PER_FILE) {
            contextItems.push({
              name: getUriPathBasename(fileUri),
              description: `File too large (${Math.round(contentBytes / 1024)}KB) - content truncated`,
              content: content.substring(0, MAX_BYTES_PER_FILE) + "\n\n[Content truncated due to size limit]",
            });
            processedFiles++;
            continue;
          }

          // 檢查總大小限制
          if (totalBytes + contentBytes > MAX_TOTAL_BYTES) {
            contextItems.push({
              name: "Size Limit Reached",
              description: `Total content size limit reached (${Math.round(MAX_TOTAL_BYTES / 1024)}KB)`,
              content: `Maximum total content size of ${Math.round(MAX_TOTAL_BYTES / 1024)}KB reached. Additional files were not included.`,
            });
            break;
          }

          contextItems.push({
            name: getUriPathBasename(fileUri),
            description: fileUri,
            content: content,
          });

          totalBytes += contentBytes;
          processedFiles++;

        } catch (error) {
          console.warn(`Failed to read file ${fileUri}:`, error);
          contextItems.push({
            name: getUriPathBasename(fileUri),
            description: `Error reading file: ${fileUri}`,
            content: `[Error reading file: ${error instanceof Error ? error.message : String(error)}]`,
          });
        }
      }

      // 添加統計資訊
      if (contextItems.length > 0) {
        contextItems.unshift({
          name: "Folder Summary",
          description: `Contents of ${getUriPathBasename(selectedFolderUri)}`,
          content: `Loaded ${processedFiles} files (${Math.round(totalBytes / 1024)}KB total) from the selected folder.`,
        });
      }

      return contextItems;

    } catch (error) {
      console.error("Error in FolderAllContextProvider:", error);
      return [{
        name: "Error",
        description: "Failed to load folder contents",
        content: `Error loading folder contents: ${error instanceof Error ? error.message : String(error)}`,
      }];
    }
  }

  async loadSubmenuItems(
    args: LoadSubmenuItemsArgs,
  ): Promise<ContextSubmenuItem[]> {
    const workspaceDirs = await args.ide.getWorkspaceDirs();
    const folders = await walkDirs(
      args.ide,
      {
        include: "dirs",
        source: "load submenu items - folder_all",
      },
      workspaceDirs,
    );
    const withUniquePaths = getShortestUniqueRelativeUriPaths(
      folders,
      workspaceDirs,
    );

    return withUniquePaths.map((folder) => {
      return {
        id: folder.uri,
        title: getUriPathBasename(folder.uri),
        description: folder.uniquePath,
      };
    });
  }

  private filterFiles(fileUris: string[]): string[] {
    return fileUris.filter((uri) => {
      const fileName = getUriPathBasename(uri);
      const pathParts = uri.split('/');
      
      // 檢查是否在忽略的資料夾中
      for (const part of pathParts) {
        if (IGNORE_DIRS.has(part)) {
          return false;
        }
      }

      // 檢查副檔名
      const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
      if (BINARY_EXTENSIONS.has(extension)) {
        return false;
      }

      // 檢查檔案名模式
      if (fileName.startsWith('.') && !fileName.endsWith('.md') && !fileName.endsWith('.txt')) {
        return false;
      }

      return true;
    });
  }
}

export default FolderAllContextProvider;
