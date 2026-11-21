/* The Ribbon host: File button, the tab rail (scrollable, with overflow
 * arrows), the contextual Shape Format tab switching and the collapse button.
 * The active tab's panels are rendered by the Classic or the Toolbar mode. */
import React, { useEffect, useRef, useState } from 'react';
import { useDesigner, useDesignerVersion } from '../store.js';
import { contextualTrigger, currentRibbon } from '../app-helpers.js';
import { contextualTabsWithoutActivation } from '../contextual-ribbon.js';
import { ClassicPanel, ToolbarPanel } from './controls.js';

export function Ribbon(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const { panels, ribbonHeight } = currentRibbon(d);
  const active = panels.find((p) => p.id === d.activeTab) ?? panels[0];
  // Contextual tabs (Shape Format / Table Design / Chart Design / Sparkline /
  // PivotTable Analyze): the trial activates a tab that just appeared and keeps
  // the current one while it stays visible; when the active tab vanishes it
  // falls back to Home. Tabs sharing one trigger (PivotTable Analyze + Design)
  // activate their FIRST member; tabs of different objects activate the last one
  // (measured: selecting a chart shows Shape Format + Chart Design and the trial
  // lands on Chart Design). The Sparkline tabs are the exception: the trial shows
  // them without leaving Home (`contextualTabsWithoutActivation`).
  const seenContextual = useRef<Set<string>>(new Set());
  useEffect(() => {
    const contextual = panels.filter((p) => p.contextual);
    const visible = new Set(contextual.map((p) => p.id));
    const previous = seenContextual.current;
    seenContextual.current = visible;
    const fresh = contextual.filter((p) => !previous.has(p.id) && !contextualTabsWithoutActivation.has(p.id));
    const activeIsContextualAndVisible = contextual.some((p) => p.id === d.activeTab);
    const activeStillExists = panels.some((p) => p.id === d.activeTab);
    if (fresh.length && !activeIsContextualAndVisible) {
      const triggers = new Set(fresh.map((panel) => contextualTrigger(panel)));
      const picked = triggers.size === 1 ? fresh[0]! : fresh[fresh.length - 1]!;
      d.activeTab = picked.id;
      d.invalidate();
    } else if (!activeStillExists) {
      /* The tab under the user's feet closed (mix-on-shape: clicking a shape while
       * Chart Design is active — the trial lands on the remaining Shape Format tab,
       * not on Home). Prefer a still-visible activatable contextual tab; Home only
       * when none is left. */
      const candidates = contextual.filter((p) => !contextualTabsWithoutActivation.has(p.id));
      const triggers = new Set(candidates.map((panel) => contextualTrigger(panel)));
      const picked = triggers.size === 1 ? candidates[0]! : candidates[candidates.length - 1];
      d.activeTab = picked ? picked.id : 'home';
      d.invalidate();
    }
  });
  const railRef = useRef<HTMLDivElement>(null);
  const [railOffset, setRailOffset] = useState(0);
  const [railOverflow, setRailOverflow] = useState(false);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = (): void => {
      const content = rail.firstElementChild as HTMLElement | null;
      const maximum = Math.max(0, (content?.scrollWidth ?? 0) - rail.clientWidth);
      setRailOverflow(maximum > 0);
      setRailOffset((offset) => Math.min(offset, maximum));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    if (rail.firstElementChild) observer.observe(rail.firstElementChild);
    return () => observer.disconnect();
  }, [panels]);
  const toolbar = ribbonHeight < 115;
  const height = d.collapsed ? 42 : toolbar ? Math.max(60, ribbonHeight + 44) : 142;
  return (
    <div
      className={`gc-designer-ribbon gc-designer-component-container gc-designer-component-container-vertical gc-designer-flex-default${d.collapsed ? ' gc-designer-ribbon-collapsed' : ''}${toolbar ? ' gc-designer-ribbon-toolbar' : ''}`}
      data-ribbon-mode={toolbar ? 'Toolbar' : 'Classic'}
      data-active-tab={d.activeTab}
      data-tab-overflow={railOverflow}
      role="toolbar"
      style={{ height }}
    >
      <div className={`gc-designer-ribbon-tabs${d.collapsed ? ' gc-designer-ribbon-tabs-hidden' : ''}`}>
        <div className="gc-designer-ribbon-tab-top-container gc-designer-component-container gc-designer-flex-default">
          <div
            className="gc-designer-fileMenuButton fileMenuButton"
            data-command="fileMenuButton"
            tabIndex={-1}
            aria-label="File"
            onClick={() => { d.fileMenuOpen = true; d.openMenu = null; d.invalidate(); }}
          >
            File
          </div>
          <div className="gc-designer-ribbon-tabs-nav-container" role="tablist">
            <div className="gc-designer-ribbon-scrollbar-container" ref={railRef}>
              <div className="gc-designer-ribbon-scrollbar-container-inner gc-designer-ribbon-tabs-nav" style={{ transform: railOffset ? `translateX(-${railOffset}px)` : undefined }}>
                {panels.map((panel) => (
                  <div
                    key={panel.id}
                    className={`gc-designer-ribbon-tab-nav-text${panel.id === d.activeTab ? ' selected' : ''}`}
                    role="tab"
                    data-id={panel.id}
                    aria-label={panel.text}
                    aria-selected={panel.id === d.activeTab}
                    onClick={() => {
                      d.activeTab = panel.id;
                      if (d.collapsed) d.collapsed = false;
                      d.openMenu = null;
                      d.invalidate();
                    }}
                  >
                    <span className="sd-text-content">{panel.text}</span>
                    <span className="sd-text-placeholer" aria-hidden="true">{panel.text}</span>
                  </div>
                ))}
              </div>
              {railOffset > 0 && <button className="gc-designer-ribbon-scrollbar-arrow-l" aria-label="Scroll tabs left" onClick={() => setRailOffset(Math.max(0, railOffset - 100))} />}
              {railOverflow && <button className="gc-designer-ribbon-scrollbar-arrow-r" aria-label="Scroll tabs right" onClick={() => {
                const rail = railRef.current;
                const content = rail?.firstElementChild as HTMLElement | null;
                setRailOffset(Math.min(railOffset + 100, Math.max(0, (content?.scrollWidth ?? 0) - (rail?.clientWidth ?? 0) + 16)));
              }} />}
            </div>
          </div>
        </div>
        {!d.collapsed && (
          <div className="gc-designer-ribbon-tabs-content">
            <div className="gc-designer-ribbon-scrollbar-container">
              <div className="gc-designer-ribbon-scrollbar-container-inner">
                <div className="gc-designer-ribbon-group-container">
                  <div className="gc-designer-ribbon-group-container-inner">
                    {active && (toolbar ? <ToolbarPanel panel={active} /> : <ClassicPanel panel={active} />)}
                  </div>
                </div>
              </div>
            </div>
            <div
              className="gc-designer-ribbon-tab-collapsed-button"
              role="button"
              aria-label="Collapse the Ribbon"
              onClick={() => { d.collapsed = true; d.openMenu = null; d.invalidate(); }}
            >
              <span className="gc-designer-collapse-chevron" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
