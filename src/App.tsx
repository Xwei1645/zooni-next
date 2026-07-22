import { Menu, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

import "./App.css";

function App() {
  return (
    <main>
      <div className="window-drag-handle" data-tauri-drag-region></div>
      <ButtonGroup className="toolbar" role="toolbar" aria-label="页面工具栏">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="添加"
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="菜单"
        >
          <Menu aria-hidden="true" />
        </Button>
      </ButtonGroup>
    </main>
  );
}

export default App;
