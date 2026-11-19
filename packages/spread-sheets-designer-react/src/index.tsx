import * as React from 'react';
import { Designer as DesignerComponent } from '@mescius/spread-sheets-designer';
import type { IDesignerConfig } from '@mescius/spread-sheets-designer';

export interface DesignerProp {
  config?: IDesignerConfig;
  styleInfo?: React.CSSProperties;
  spreadOptions?: Record<string, unknown>;
  designerInitialized?: (designer: DesignerComponent) => void;
  children?: React.ReactNode;
  className?: string;
}

export class Designer extends React.Component<DesignerProp> {
  private host = React.createRef<HTMLDivElement>();
  private designer?: DesignerComponent;

  componentDidMount(): void {
    if (!this.host.current) return;
    this.designer = new DesignerComponent(this.host.current, this.props.config, undefined, this.props.spreadOptions);
    this.props.designerInitialized?.(this.designer);
  }

  componentDidUpdate(previous: DesignerProp): void {
    if (this.designer && previous.config !== this.props.config && this.props.config) this.designer.setConfig(this.props.config);
  }

  componentWillUnmount(): void {
    this.designer?.destroy();
    this.designer = undefined;
  }

  render(): React.ReactNode {
    return React.createElement('div', {
      ref: this.host,
      className: this.props.className,
      style: { width: '100%', height: '100%', ...this.props.styleInfo },
    }, this.props.children);
  }
}

export default Designer;
