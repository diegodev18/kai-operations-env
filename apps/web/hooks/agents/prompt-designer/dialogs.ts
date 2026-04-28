import { useState } from "react";

export function usePromptDesignerDialogs() {
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [isPullDialogOpen, setIsPullDialogOpen] = useState(false);
  const [pushConfirmText, setPushConfirmText] = useState("");
  const [pullConfirmText, setPullConfirmText] = useState("");
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [promoteIncludeAuth, setPromoteIncludeAuth] = useState(true);
  const [promoteIncludeUnauth, setPromoteIncludeUnauth] = useState(true);

  return {
    isPushDialogOpen,
    setIsPushDialogOpen,
    isPullDialogOpen,
    setIsPullDialogOpen,
    pushConfirmText,
    setPushConfirmText,
    pullConfirmText,
    setPullConfirmText,
    isPromoteDialogOpen,
    setIsPromoteDialogOpen,
    promoteIncludeAuth,
    setPromoteIncludeAuth,
    promoteIncludeUnauth,
    setPromoteIncludeUnauth,
  };
}
