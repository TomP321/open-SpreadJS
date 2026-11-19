/** Workbook context menu (the contract's `ContextMenu` class, viewed structurally): the designer takes ownership of `onOpenMenu` while it runs. */
interface ContextMenuLike {
  onOpenMenu(menuData: unknown, itemsDataForShown: unknown, hitInfo: unknown, spread: unknown): boolean;
}

/** Suppress the workbook's menu while the Designer provides its own menu. */
export function takeContextMenu(menu: ContextMenuLike): () => void {
  const previous = menu.onOpenMenu;
  const suppress = (): boolean => true;
  menu.onOpenMenu = suppress;
  return () => {
    if (menu.onOpenMenu === suppress) menu.onOpenMenu = previous;
  };
}
