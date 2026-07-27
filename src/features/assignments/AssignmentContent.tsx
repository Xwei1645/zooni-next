import { useLayoutEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type InitialEditorStateType,
} from "lexical";
import { logError } from "@/lib/logger";

interface AssignmentContentProps {
  content: string;
  contentZoom: number;
}

export function assignmentEditorStateFromContent(content: string): InitialEditorStateType {
  return (editor) => {
    try {
      editor.setEditorState(editor.parseEditorState(content));
    } catch {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode().append($createTextNode(content)));
      });
    }
  };
}

function RenderedFontScalePlugin({ contentZoom }: { contentZoom: number }) {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    function applyFontScale() {
      const root = editor.getRootElement();

      if (!root) {
        return;
      }

      for (const element of root.querySelectorAll<HTMLElement>("[style*='font-size']")) {
        const originalSize = element.dataset.assignmentFontSize ?? element.style.fontSize;

        if (!originalSize) {
          continue;
        }

        element.dataset.assignmentFontSize = originalSize;
        const size = Number.parseFloat(originalSize);

        if (Number.isFinite(size) && originalSize.endsWith("px")) {
          element.style.fontSize = `${size * contentZoom}px`;
        }
      }
    }

    applyFontScale();
    return editor.registerUpdateListener(applyFontScale);
  }, [contentZoom, editor]);

  return null;
}

export function AssignmentContent({ content, contentZoom }: AssignmentContentProps) {
  return (
    <LexicalComposer
      key={content}
      initialConfig={{
        namespace: "assignment-content",
        editable: false,
        editorState: assignmentEditorStateFromContent(content),
        onError: (error) => logError("assignment-content", error),
      }}
    >
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="assignment-content"
            aria-label="作业正文"
            aria-readonly="true"
            style={{ fontSize: `${15 * contentZoom}px` }}
          />
        }
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <RenderedFontScalePlugin contentZoom={contentZoom} />
    </LexicalComposer>
  );
}
