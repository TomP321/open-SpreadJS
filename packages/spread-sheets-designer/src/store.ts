import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DesignerApi as Designer } from './designer-api.js';

export const DesignerContext = createContext<Designer | null>(null);

export function useDesigner(): Designer {
  const designer = useContext(DesignerContext);
  if (!designer) throw new Error('Designer context is missing');
  return designer;
}

export function useDesignerVersion(): number {
  const designer = useDesigner();
  return useSyncExternalStore(designer.subscribe, designer.getVersion, designer.getVersion);
}
