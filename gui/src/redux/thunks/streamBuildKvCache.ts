import { createAsyncThunk } from "@reduxjs/toolkit";
import { JSONContent } from "@tiptap/core";
import { InputModifiers, LLMFullCompletionOptions } from "core";
import { v4 as uuidv4 } from "uuid";
import { resolveEditorContent } from "../../components/mainInput/TipTapEditor/utils/resolveEditorContent";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  abortStream,
  addPromptCompletionPair,
  resetNextCodeBlockToApplyIndex,
  setActive,
  setContextPercentage,
  setInactive,
  setInlineErrorMessage,
  setIsPruned,
  streamUpdate,
  submitEditorAndInitAtIndex,
  updateHistoryItemAtIndex,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { constructMessages } from "../util/constructMessages";
import { getBaseSystemMessage } from "../util/getBaseSystemMessage";
import { streamThunkWrapper } from "./streamThunkWrapper";
import { updateFileSymbolsFromFiles } from "./updateFileSymbols";

/**
 * Special thunk for building KvCache that only sends the current folder context
 * and prompt WITHOUT including the chat history.
 */
export const streamBuildKvCacheThunk = createAsyncThunk<
  void,
  {
    editorState: JSONContent;
    modifiers: InputModifiers;
  },
  ThunkApiType
>(
  "chat/streamBuildKvCache",
  async ({ editorState, modifiers }, { dispatch, extra, getState }) => {
    await dispatch(
      streamThunkWrapper(async () => {
        const state = getState();
        const selectedChatModel = selectSelectedChatModel(state);
        const inputIndex = state.session.history.length;

        if (!selectedChatModel) {
          throw new Error("No chat model selected");
        }

        dispatch(
          submitEditorAndInitAtIndex({ index: inputIndex, editorState }),
        );

        dispatch(resetNextCodeBlockToApplyIndex());

        const defaultContextProviders =
          state.config.config.experimental?.defaultContext ?? [];

        // Resolve context providers and construct new history
        const { selectedContextItems, selectedCode, content } =
          await resolveEditorContent({
            editorState,
            modifiers,
            ideMessenger: extra.ideMessenger,
            defaultContextProviders,
            availableSlashCommands: state.config.config.slashCommands,
            dispatch,
            getState,
          });

        // symbols for both context items AND selected codeblocks
        const filesForSymbols = [
          ...selectedContextItems
            .filter((item) => item.uri?.type === "file" && item?.uri?.value)
            .map((item) => item.uri!.value),
          ...selectedCode.map((rif) => rif.filepath),
        ];
        void dispatch(updateFileSymbolsFromFiles(filesForSymbols));

        dispatch(
          updateHistoryItemAtIndex({
            index: inputIndex,
            updates: {
              message: {
                role: "user",
                content,
                id: uuidv4(),
              },
              contextItems: selectedContextItems,
              isHiddenFromChat: true, // Hide KvCache build messages from chat UI
            },
          }),
        );

        // ===== KEY DIFFERENCE: Only use current message, no history =====
        // Create a minimal history with only the current message
        const minimalHistory = [
          {
            message: {
              role: "user" as const,
              content,
            },
            contextItems: selectedContextItems,
          },
        ];

        // Construct messages WITHOUT including previous chat history
        const baseSystemMessage = getBaseSystemMessage(
          state.session.mode,
          selectedChatModel,
          [], // No tools for KvCache building
        );

        const { messages } = constructMessages(
          minimalHistory,
          baseSystemMessage,
          state.config.config.rules,
          state.ui.ruleSettings,
        );

        // Mark the assistant response message as hidden too
        dispatch(
          updateHistoryItemAtIndex({
            index: inputIndex + 1,
            updates: {
              isHiddenFromChat: true, // Hide KvCache build messages from chat UI
            },
          }),
        );

        dispatch(setActive());
        dispatch(setInlineErrorMessage(undefined));

        const completionOptions: LLMFullCompletionOptions = {};

        const precompiledRes = await extra.ideMessenger.request(
          "llm/compileChat",
          {
            messages,
            options: completionOptions,
          },
        );

        if (precompiledRes.status === "error") {
          if (precompiledRes.error.includes("Not enough context")) {
            dispatch(setInlineErrorMessage("out-of-context"));
            dispatch(setInactive());
            return;
          } else {
            throw new Error(precompiledRes.error);
          }
        }

        const { compiledChatMessages, didPrune, contextPercentage } =
          precompiledRes.content;

        dispatch(setIsPruned(didPrune));
        dispatch(setContextPercentage(contextPercentage));

        // Send request and stream response
        const streamAborter = state.session.streamAborter;
        const gen = extra.ideMessenger.llmStreamChat(
          {
            completionOptions,
            title: selectedChatModel.title,
            messages: compiledChatMessages,
            messageOptions: { precompiled: true },
          },
          streamAborter.signal,
        );

        let next = await gen.next();
        while (!next.done) {
          if (!getState().session.isStreaming) {
            dispatch(abortStream());
            break;
          }

          dispatch(streamUpdate(next.value));
          next = await gen.next();
        }

        // Attach prompt log
        if (next.done && next.value) {
          dispatch(addPromptCompletionPair([next.value]));

          try {
            extra.ideMessenger.post("devdata/log", {
              name: "chatInteraction",
              data: {
                prompt: next.value.prompt,
                completion: next.value.completion,
                modelProvider: selectedChatModel.underlyingProviderName,
                modelName: selectedChatModel.title,
                modelTitle: selectedChatModel.title,
                sessionId: state.session.id,
              },
            });
          } catch (e) {
            console.error("Failed to send dev data interaction log", e);
          }
        }

        dispatch(setInactive());
      }),
    );
  },
);
