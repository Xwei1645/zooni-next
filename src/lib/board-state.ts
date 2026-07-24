import { useEffect, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";

export interface BoardState {
  columnCount: number;
  zoom: number;
}

export const defaultBoardState: BoardState = {
  columnCount: 3,
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
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  function saveBoardState(nextBoardState: BoardState) {
    setBoardState(nextBoardState);
    void updateBoardState(nextBoardState).catch(() => undefined);
  }

  return { boardState, saveBoardState };
}
