import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Bold, Check, Minus, Plus } from "lucide-react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
} from "lexical";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Assignment, AssignmentInput } from "@/lib/assignments";
import type { Subject } from "@/lib/subjects";

import { assignmentEditorStateFromContent } from "./AssignmentContent";

const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 72;
const EXIT_DURATION = 140;

interface AssignmentComposerProps {
  assignment?: Assignment;
  draft?: AssignmentInput;
  subjects: Subject[];
  onDismiss: (draft?: AssignmentInput) => void;
  onSubmit: (input: AssignmentInput) => Promise<void>;
}

function EditorCapturePlugin({
  editorRef,
}: {
  editorRef: MutableRefObject<LexicalEditor | undefined>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef.current = editor;
    window.requestAnimationFrame(() => editor.focus());

    return () => {
      if (editorRef.current === editor) {
        editorRef.current = undefined;
      }
    };
  }, [editor, editorRef]);

  return null;
}

function TextToolbar() {
  const [editor] = useLexicalComposerContext();
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [fontSizeInput, setFontSizeInput] = useState(String(DEFAULT_FONT_SIZE));
  const [isBold, setIsBold] = useState(false);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          const value = Number.parseInt(
            $getSelectionStyleValueForProperty(selection, "font-size", `${DEFAULT_FONT_SIZE}px`),
            10,
          );
          const nextFontSize = Number.isFinite(value) ? value : DEFAULT_FONT_SIZE;
          setFontSize(nextFontSize);
          setFontSizeInput(String(nextFontSize));
          setIsBold(selection.hasFormat("bold"));
        } else {
          setIsBold(false);
        }
      });
    });
  }, [editor]);

  function setSelectionFontSize(nextFontSize: number, updateInput = true) {
    const clampedFontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, nextFontSize));
    setFontSize(clampedFontSize);
    if (updateInput) {
      setFontSizeInput(String(clampedFontSize));
    }
    editor.update(() => {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { "font-size": `${clampedFontSize}px` });
      }
    });
  }

  function preserveSelection(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <div className="assignment-editor-toolbar" role="toolbar" aria-label="正文格式">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="assignment-editor-tool"
        aria-label="粗体"
        aria-pressed={isBold}
        onMouseDown={preserveSelection}
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
          setIsBold((value) => !value);
        }}
      >
        <Bold aria-hidden="true" />
      </Button>
      <div className="assignment-font-size" aria-label="字号">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="assignment-editor-tool"
          aria-label="减小字号"
          onMouseDown={preserveSelection}
          onClick={() => setSelectionFontSize(fontSize - 1)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <input
          type="number"
          className="assignment-font-size-input"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          value={fontSizeInput}
          aria-label="字号"
          onChange={(event) => {
            const value = event.target.value;
            const numericValue = Number(value);

            setFontSizeInput(value);

            if (
              Number.isInteger(numericValue)
              && numericValue >= MIN_FONT_SIZE
              && numericValue <= MAX_FONT_SIZE
            ) {
              setSelectionFontSize(numericValue, false);
            }
          }}
          onBlur={() => setFontSizeInput(String(fontSize))}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="assignment-editor-tool"
          aria-label="增大字号"
          onMouseDown={preserveSelection}
          onClick={() => setSelectionFontSize(fontSize + 1)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function AssignmentComposer({
  assignment,
  draft,
  subjects,
  onDismiss,
  onSubmit,
}: AssignmentComposerProps) {
  const editorRef = useRef<LexicalEditor | undefined>(undefined);
  const [subjectId, setSubjectId] = useState(
    draft?.subjectId ?? assignment?.subjectId ?? subjects[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const initialContent = draft?.content ?? assignment?.content ?? "";

  function editorInput() {
    return {
      subjectId,
      content: editorRef.current
        ? JSON.stringify(editorRef.current.getEditorState().toJSON())
        : initialContent,
    };
  }

  function close(afterClose: () => void) {
    setIsClosing(true);
    window.setTimeout(afterClose, EXIT_DURATION);
  }

  async function submit() {
    const editor = editorRef.current;

    if (!editor || !subjectId || saving || isClosing) {
      return;
    }

    setSaving(true);
    try {
      await onSubmit(editorInput());
      close(() => onDismiss());
    } catch (error) {
      console.error("Failed to save assignment", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={isClosing ? "assignment-composer-layer assignment-composer-layer-is-closing" : "assignment-composer-layer"}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving && !isClosing) {
          close(() => onDismiss(editorInput()));
        }
      }}
    >
      <form
        className={isClosing ? "assignment-composer assignment-composer-is-closing" : "assignment-composer"}
        aria-label={assignment ? "编辑作业" : "新建作业"}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving && !isClosing) {
            event.preventDefault();
            close(() => onDismiss(editorInput()));
          }

          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <LexicalComposer
          initialConfig={{
            namespace: "assignment-editor",
            editorState: assignmentEditorStateFromContent(initialContent),
            onError: (error) => console.error("Assignment editor failed", error),
          }}
        >
          <TextToolbar />
          <ScrollArea className="assignment-editor-body">
            <RichTextPlugin
              contentEditable={
                <ContentEditable className="assignment-editor-content" aria-label="正文" />
              }
              placeholder={null}
              ErrorBoundary={LexicalErrorBoundary}
            />
          </ScrollArea>
          <EditorCapturePlugin editorRef={editorRef} />
        </LexicalComposer>
        <footer className="assignment-composer-footer">
          <div className="assignment-composer-footer-panel">
            <Select value={subjectId} onValueChange={(value) => setSubjectId(value ?? "")}>
              <SelectTrigger className="assignment-subject-select" aria-label="科目">
                <SelectValue placeholder="选择科目">
                  {subjects.find((subject) => subject.id === subjectId)?.name}
                </SelectValue>
              </SelectTrigger>
            <SelectContent
              className="assignment-subject-select-content"
              positionerClassName="assignment-subject-select-positioner"
              sideOffset={10}
            >
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            size="icon-lg"
            className="assignment-confirm-button"
            aria-label="确定"
            disabled={!subjectId || saving}
          >
            <Check aria-hidden="true" />
          </Button>
        </footer>
      </form>
    </div>
  );
}
