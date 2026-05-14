import type { CSSProperties, DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        loading?: 'auto' | 'eager' | 'lazy';
        style?: CSSProperties;
        'camera-controls'?: boolean | string;
        'camera-orbit'?: string;
        'disable-pan'?: boolean | string;
        'interaction-prompt'?: string;
        'touch-action'?: string;
        'interpolation-decay'?: number | string;
        'environment-image'?: string;
        'tone-mapping'?: string;
        'shadow-intensity'?: number | string;
        exposure?: number | string;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        'disable-zoom'?: boolean | string;
      };
    }
  }
}

export {};