import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type InitialEditorStateType,
} from "lexical";

interface AssignmentContentProps {
  content: string;
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

export function AssignmentContent({ content }: AssignmentContentProps) {
  return (
    <LexicalComposer
      key={content}
      initialConfig={{
        namespace: "assignment-content",
        editable: false,
        editorState: assignmentEditorStateFromContent(content),
        onError: (error) => console.error("Failed to render assignment content", error),
      }}
    >
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="assignment-content"
            aria-label="作业正文"
            aria-readonly="true"
          />
        }
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
    </LexicalComposer>
  );
}
