import {
  getContinueGlobalPath,
  getContinueRcPath,
  getTsConfigPath,
} from "core/util/paths";
import { Telemetry } from "core/util/posthog";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { VsCodeExtension } from "../extension/VsCodeExtension";
import { getExtensionVersion, isUnsupportedPlatform } from "../util/util";

import { GlobalContext } from "core/util/GlobalContext";
import { VsCodeContinueApi } from "./api";
import setupInlineTips from "./InlineTipManager";

export async function activateExtension(context: vscode.ExtensionContext) {
  const platformCheck = isUnsupportedPlatform();
  const globalContext = new GlobalContext();
  const hasShownUnsupportedPlatformWarning = globalContext.get(
    "hasShownUnsupportedPlatformWarning",
  );

  if (platformCheck.isUnsupported && !hasShownUnsupportedPlatformWarning) {
    const platformTarget = "windows-arm64";

    globalContext.update("hasShownUnsupportedPlatformWarning", true);
    void vscode.window.showInformationMessage(
      `Continue detected that you are using ${platformTarget}. Due to native dependencies, Continue may not be able to start`,
    );

    void Telemetry.capture(
      "unsupported_platform_activation_attempt",
      {
        platform: platformTarget,
        extensionVersion: getExtensionVersion(),
        reason: platformCheck.reason,
      },
      true,
    );
  }

  // Add necessary files
  getTsConfigPath();
  getContinueRcPath();

  // Register commands and providers
  setupInlineTips(context);

  // Load Continue configuration
  const hasBeenInstalled = context.globalState.get("hasBeenInstalled");
  console.log(`[Continue] hasBeenInstalled status: ${hasBeenInstalled}`);

  // Copy Local Agent config.yaml to ~/.continue if it exists
  // IMPORTANT: This must be done BEFORE VsCodeExtension is initialized
  // because VsCodeExtension will call getConfigYamlPath() which creates an empty file
  // We check this EVERY time (not just first install) to ensure config is copied
  try {
    const sourceConfigPath = path.join(
      context.extensionPath,
      "local-agent-config.yaml",
    );

    console.log(`[Continue] Looking for source config at: ${sourceConfigPath}`);
    console.log(
      `[Continue] Source config exists: ${fs.existsSync(sourceConfigPath)}`,
    );

    if (fs.existsSync(sourceConfigPath)) {
      const continueGlobalPath = getContinueGlobalPath();
      const targetConfigPath = path.join(continueGlobalPath, "config.yaml");

      console.log(`[Continue] Target config path: ${targetConfigPath}`);
      console.log(`[Continue] Continue global path: ${continueGlobalPath}`);

      // Ensure the .continue directory exists
      if (!fs.existsSync(continueGlobalPath)) {
        console.log(`[Continue] Creating .continue directory`);
        fs.mkdirSync(continueGlobalPath, { recursive: true });
      }

      console.log(
        `[Continue] Target config exists: ${fs.existsSync(targetConfigPath)}`,
      );

      // Check if we need to copy (either doesn't exist or is too small/empty)
      let shouldCopy = false;
      if (!fs.existsSync(targetConfigPath)) {
        console.log("[Continue] Config doesn't exist, will copy");
        shouldCopy = true;
      } else {
        const existingContent = fs.readFileSync(targetConfigPath, "utf8");
        console.log(
          `[Continue] Existing file size: ${existingContent.length} bytes`,
        );

        // If existing file is too small (< 100 bytes), it's probably empty or incomplete
        if (existingContent.length < 100) {
          console.log("[Continue] Existing config is too small, will replace");
          shouldCopy = true;
        } else if (
          !existingContent.includes("Local Assistant") &&
          !existingContent.includes("Local Agent")
        ) {
          console.log(
            "[Continue] Existing config doesn't contain expected content, will replace",
          );
          shouldCopy = true;
        }
      }

      if (shouldCopy) {
        // Copy the config.yaml file
        console.log(`[Continue] Copying config file...`);
        fs.copyFileSync(sourceConfigPath, targetConfigPath);
        console.log(
          `[Continue] Local Agent config.yaml copied from ${sourceConfigPath} to ${targetConfigPath}`,
        );

        // Verify the copy
        const copiedContent = fs.readFileSync(targetConfigPath, "utf8");
        console.log(
          `[Continue] Copied file size: ${copiedContent.length} bytes`,
        );
        console.log(
          `[Continue] First 200 chars: ${copiedContent.substring(0, 200)}`,
        );

        void vscode.window.showInformationMessage(
          "Continue: Local Agent configuration has been installed successfully!",
        );
      } else {
        console.log(
          "[Continue] Valid config.yaml already exists, skipping copy",
        );
      }
    } else {
      console.log(
        "[Continue] local-agent-config.yaml not found in extension directory",
      );
      console.log(`[Continue] Extension path: ${context.extensionPath}`);
      // List files in extension directory for debugging
      try {
        const files = fs.readdirSync(context.extensionPath);
        console.log(
          `[Continue] Files in extension directory: ${files.slice(0, 20).join(", ")}`,
        );
      } catch (e) {
        console.log(`[Continue] Could not list extension directory: ${e}`);
      }
    }
  } catch (error) {
    console.error("[Continue] Failed to copy Local Agent config.yaml:", error);
    // Don't show error to user as this is optional
  }

  // Track first-time installation
  if (!hasBeenInstalled) {
    console.log("[Continue] First time installation detected");
    void context.globalState.update("hasBeenInstalled", true);
    void Telemetry.capture(
      "install",
      {
        extensionVersion: getExtensionVersion(),
      },
      true,
    );
  } else {
    console.log("[Continue] Extension already installed");
  }

  const vscodeExtension = new VsCodeExtension(context);

  // Register config.yaml schema by removing old entries and adding new one (uri.fsPath changes with each version)
  const yamlMatcher = ".continue/**/*.yaml";
  const yamlConfig = vscode.workspace.getConfiguration("yaml");

  const newPath = vscode.Uri.joinPath(
    context.extension.extensionUri,
    "config-yaml-schema.json",
  ).toString();

  try {
    await yamlConfig.update(
      "schemas",
      { [newPath]: [yamlMatcher] },
      vscode.ConfigurationTarget.Global,
    );
  } catch (error) {
    console.error(
      "Failed to register Continue config.yaml schema, most likely, YAML extension is not installed",
      error,
    );
  }

  const api = new VsCodeContinueApi(vscodeExtension);
  const continuePublicApi = {
    registerCustomContextProvider: api.registerCustomContextProvider.bind(api),
  };

  // 'export' public api-surface
  // or entire extension for testing
  return process.env.NODE_ENV === "test"
    ? {
        ...continuePublicApi,
        extension: vscodeExtension,
      }
    : continuePublicApi;
}
