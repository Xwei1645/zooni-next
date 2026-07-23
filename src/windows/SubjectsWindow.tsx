import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Grip, Pencil, Plus, Trash2, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createSubject,
  deleteSubject,
  type Subject,
  updateSubject,
  useSubjects,
} from "@/lib/subjects";
import { useWindowSettings } from "@/lib/settings";

import "./SubjectsWindow.css";

const ROW_ANIMATION_DURATION = 150;

export function SubjectsWindow() {
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [deletingId, setDeletingId] = useState<string>();
  const [createdSubject, setCreatedSubject] = useState<Subject>();
  const readySignaled = useRef(false);
  const { subjects, loaded } = useSubjects();
  const settings = useWindowSettings();

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        void invoke("hide_subjects_window");
      })
      .then((cleanup) => {
        if (active) {
          unlisten = cleanup;
          return;
        }

        cleanup();
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!loaded || !settings || readySignaled.current) {
      return;
    }

    readySignaled.current = true;
    void invoke("subjects_window_ready");
  }, [loaded, settings]);

  useEffect(() => {
    if (!editingId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>(".subject-row-is-editing .subject-name-input")
        ?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editingId]);

  function startEditing(id: string, name: string) {
    setCreating(false);
    setEditingId(id);
    setEditingName(name);
  }

  function startCreating() {
    setEditingId(undefined);
    setCreatedSubject(undefined);
    setCreating(true);
    setCreateName("");
  }

  function saveNewSubject() {
    if (createName === "") {
      return;
    }

    void createSubject({ name: createName }).then((nextSubjects) => {
      const nextSubject = nextSubjects[0];

      if (!nextSubject) {
        return;
      }

      setCreatedSubject(nextSubject);
      setCreating(false);
      window.setTimeout(() => {
        setCreatedSubject(undefined);
        setCreateName("");
      }, ROW_ANIMATION_DURATION);
    });
  }

  function saveSubject(id: string) {
    if (editingName === "") {
      return;
    }

    void updateSubject(id, { name: editingName }).then(() => {
      setEditingId(undefined);
      setEditingName("");
    });
  }

  function removeSubject(id: string) {
    if (deletingId) {
      return;
    }

    setDeletingId(id);
    window.setTimeout(() => {
      void deleteSubject(id)
        .catch(() => undefined)
        .finally(() => setDeletingId(undefined));
    }, ROW_ANIMATION_DURATION);
  }

  function startWindowDrag() {
    void getCurrentWindow().startDragging().catch(() => undefined);
  }

  const visibleSubjects = createdSubject
    ? subjects.filter((subject) => subject.id !== createdSubject.id)
    : subjects;

  return (
    <main className="subjects-window">
      <header className="subjects-titlebar">
        <div
          className="subjects-drag-region"
          data-tauri-drag-region
        >
          <BookOpen aria-hidden="true" />
          <span>科目管理</span>
        </div>
      </header>
      <section className="subjects-content" aria-label="科目列表">
        <ScrollArea className="subjects-scroll-area">
          <div className="subjects-list">
          {(creating || createdSubject) && (
            <div
              className={
                creating
                  ? "subject-row subject-row-is-editing subject-row-creating"
                  : "subject-row subject-row-creating"
              }
            >
              <div className="subject-row-display" aria-hidden={creating}>
                <span className="subject-name">{createdSubject?.name}</span>
                <div className="subject-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="subject-action-button"
                    aria-label="修改科目"
                    disabled
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="subject-action-button"
                    aria-label="删除科目"
                    disabled
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="subject-row-editor" aria-hidden={!creating}>
                <Input
                  autoFocus
                  className="subject-name-input"
                  value={createName}
                  aria-label="新科目名称"
                  onChange={(event) => setCreateName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      saveNewSubject();
                    }
                    if (event.key === "Escape") {
                      setCreating(false);
                    }
                  }}
                />
                <div className="subject-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="subject-action-button"
                    aria-label="确认新增科目"
                    disabled={createName === ""}
                    onClick={saveNewSubject}
                  >
                    <Check aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="subject-action-button"
                    aria-label="取消新增科目"
                    onClick={() => setCreating(false)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          {visibleSubjects.map((subject) => {
              const isEditing = editingId === subject.id;
              const rowClassName = deletingId === subject.id
                ? "subject-row subject-row-deleting"
                : isEditing
                  ? "subject-row subject-row-is-editing"
                  : "subject-row";

              return (
                <div
                  className={rowClassName}
                  key={subject.id}
                >
                  <div className="subject-row-display" aria-hidden={isEditing}>
                    <span className="subject-name">{subject.name}</span>
                    <div className="subject-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="subject-action-button"
                        aria-label="修改科目"
                        disabled={deletingId !== undefined}
                        onClick={() => startEditing(subject.id, subject.name)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="subject-action-button"
                        aria-label="删除科目"
                        disabled={deletingId !== undefined}
                        onClick={() => removeSubject(subject.id)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div className="subject-row-editor" aria-hidden={!isEditing}>
                    <Input
                      className="subject-name-input"
                      value={isEditing ? editingName : subject.name}
                      aria-label="科目名称"
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          saveSubject(subject.id);
                        }
                        if (event.key === "Escape") {
                          setEditingId(undefined);
                        }
                      }}
                    />
                    <div className="subject-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="subject-action-button"
                        aria-label="确认修改科目"
                        disabled={!isEditing || editingName === ""}
                        onClick={() => saveSubject(subject.id)}
                      >
                        <Check aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="subject-action-button"
                        aria-label="取消修改科目"
                        disabled={!isEditing}
                        onClick={() => setEditingId(undefined)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <footer className="subjects-footer">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="subjects-drag-button"
            aria-label="拖动窗口"
            onPointerDown={startWindowDrag}
          >
            <Grip aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="subject-add-button"
            onClick={startCreating}
          >
            <Plus aria-hidden="true" />
            新增
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="subjects-close-button"
            aria-label="关闭窗口"
            onClick={() => void invoke("hide_subjects_window")}
          >
            <X aria-hidden="true" />
          </Button>
        </footer>
      </section>
    </main>
  );
}
