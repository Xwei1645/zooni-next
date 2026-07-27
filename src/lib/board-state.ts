import { useEffect, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";

import { logError } from "@/lib/logger";

export interface BoardState {
  columnCount: number;
  autoColumnCount: boolean;
  autoZoom: boolean;
  zoom: number;
}

export const defaultBoardState: BoardState = {
  columnCount: 3,
  autoColumnCount: false,
  autoZoom: false,
  zoom: 100,
};

export function loadBoardState() {
  return invoke<BoardState>("get_board_state");
}

export function updateBoardState(boardState: BoardState) {
  return invoke("update_board_state", { boardState });
}

export function useBoardState() {
  const [boardState, setBoardState] = useState(defaultBoardState);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let active = true;

    void loadBoardState()
      .then((nextBoardState) => {
        if (active) {
          setBoardState(nextBoardState);
        }
      })
      .catch((error) => logError("board-state.load", error));

    return () => {
      active = false;
    };
  }, []);

  function saveBoardState(nextBoardState: BoardState) {
    setBoardState(nextBoardState);
    void updateBoardState(nextBoardState).catch((error) => logError("board-state.save", error));
  }

  return { boardState, saveBoardState };
}
