import defaultData from './context-menu-data.json';
import { clone } from '../primitives.js';
import { menuIcon } from './menu-icons.js';
export interface MenuItemData {
  name?: string; text?: string; command?: string | ((...args: unknown[]) => unknown); disable?: boolean;
  iconClass?: string; group?: string; subMenu?: MenuItemData[]; type?: string; workArea?: string;
  visible?: boolean; menuContent?: string; status?: unknown; placeholder?: string; commandOptions?: unknown;
  itemClass?: string; title?: string; needKeepFocus?: boolean; metaData?: object;
}
export class MenuView {
  private height?: number;
  private scrolling?: boolean;
  maxHeight(value?: number): number | void { if (value === undefined) return this.height; this.height = value; }
  scrollable(value?: boolean): boolean | void { if (value === undefined) return this.scrolling; this.scrolling = value; }
  getCommandOptions(item: MenuItemData, _host: object, _event: object): unknown { return item.commandOptions; }
  createMenuItemElement(item: MenuItemData): HTMLElement {
    const element = document.createElement('div');
    element.className = `gc-ui-contextmenu-menuitem ${item.itemClass ?? ''}`;
    if (item.type === 'separator') {
      element.className = 'gc-ui-contextmenu-nonselective-menuitem';
      const separator = document.createElement('div'); separator.className = 'gc-ui-contextmenu-separator'; separator.setAttribute('role', 'separator'); element.append(separator); return element;
    }
    const content = document.createElement('div');
    content.className = 'gc-ui-contextmenu-menuitem-content';
    content.setAttribute('role', 'menuitem'); content.tabIndex = item.disable ? -1 : 0;
    content.setAttribute('aria-disabled', String(!!item.disable));
    if (item.disable) element.classList.add('gc-ui-contextmenu-disabled');
    const icon = document.createElement('span'); icon.className = `gc-ui-contextmenu-icon ${item.iconClass ?? ''}`;
    if (item.iconClass) icon.append(menuIcon(item.iconClass, item.group ? 24 : 16));
    const text = document.createElement('span'); text.className = 'gc-ui-contextmenu-text'; text.textContent = item.text ?? '';
    content.append(icon, text); element.append(content);
    if (item.title) content.title = item.title;
    if (item.subMenu) { content.setAttribute('aria-haspopup', 'true'); content.setAttribute('aria-expanded', 'false'); const arrow = document.createElement('span'); arrow.className = 'opensheets-menu-arrow'; content.append(arrow); }
    if (item.type === 'groupHeader') { content.classList.add('gc-ui-contextmenu-group-header'); content.removeAttribute('role'); content.tabIndex = -1; }
    return element;
  }
}
export class ContextMenu {
  menuData: MenuItemData[] = clone(defaultData) as MenuItemData[];
  menuView = new MenuView();
  onOpenMenu(_menuData: MenuItemData[], _itemsDataForShown: MenuItemData[], _hitInfo: object, _spread: object): boolean { return false; }
}
/** Drop redundant separators after context filtering, as the reference does. */
export function compactMenu(items: MenuItemData[]): MenuItemData[] {
  return items.filter((item, i) => item.type !== 'separator' || (i > 0 && items.slice(i + 1).some(next => next.type !== 'separator') && items[i - 1].type !== 'separator'));
}
export function renderMenu(menu: ContextMenu, items: MenuItemData[], execute: (item: MenuItemData, host: HTMLElement, event: Event) => void): HTMLElement {
  const root = document.createElement('div'); root.className = 'gc-contextmenu gc-ui-contextmenu-container'; root.setAttribute('role', 'menu'); root.tabIndex = -1;
  let group: HTMLElement | undefined;
  for (const item of items) {
    if (item.visible === false) continue;
    const element = menu.menuView.createMenuItemElement(item);
    if (item.type === 'groupHeader') { group = document.createElement('div'); group.className = 'gc-ui-contextmenu-groupitems-container'; element.append(group); }
    if (item.group && group) { element.classList.add('gc-ui-contextmenu-groupitem'); element.title = item.text ?? ''; element.querySelector('.gc-ui-contextmenu-text')?.remove(); group.append(element); }
    else root.append(element);
    if (item.type === 'separator' || item.type === 'groupHeader') continue;
    const content = element.querySelector<HTMLElement>('[role=menuitem]') ?? element;
    if (item.subMenu) {
      const sub = renderMenu(menu, item.subMenu, execute); sub.classList.add('opensheets-submenu'); sub.style.display = 'none'; element.append(sub);
      const open = () => { if (item.disable) return; sub.style.display = ''; content.setAttribute('aria-expanded', 'true'); };
      element.addEventListener('pointerenter', open);
      element.addEventListener('pointerleave', () => { sub.style.display = 'none'; content.setAttribute('aria-expanded', 'false'); });
      content.addEventListener('click', open);
      content.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); open(); sub.querySelector<HTMLElement>('[role=menuitem][aria-disabled=false]')?.focus(); } });
    } else content.addEventListener('click', e => { if (!item.disable) execute(item, element, e); });
  }
  root.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const entries = [...root.querySelectorAll<HTMLElement>('[role=menuitem][aria-disabled=false]')].filter(el => el.closest('[role=menu]') === root && el.offsetParent);
    const current = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Enter' || event.key === ' ') entries[current]?.click();
    else entries[event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + entries.length) % entries.length]?.focus();
  });
  return root;
}
