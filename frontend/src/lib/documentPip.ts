export type DocumentPipOptions = {
  width: number;
  height: number;
  onWindowClosed?: () => void;
};

let restoreParent: HTMLElement | null = null;
let closedListener: (() => void) | null = null;

export function isDocumentPipSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

export function isDocumentPipActive(): boolean {
  return isDocumentPipSupported() && Boolean(window.documentPictureInPicture.window);
}

export async function moveToDocumentPip(
  element: HTMLElement,
  parent: HTMLElement,
  options: DocumentPipOptions,
): Promise<boolean> {
  if (!isDocumentPipSupported()) return false;

  if (window.documentPictureInPicture.window) {
    return true;
  }

  try {
    const pipWindow = await window.documentPictureInPicture.requestWindow({
      width: options.width,
      height: options.height,
      preferInitialWindowPlacement: true,
    });

    restoreParent = parent;
    closedListener = () => {
      restoreFromDocumentPip();
      options.onWindowClosed?.();
    };

    pipWindow.addEventListener('pagehide', closedListener, { once: true });

    const doc = pipWindow.document;

    // Copy document stylesheets into PiP window so Tailwind CSS styles apply cleanly
    Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).forEach((node) => {
      doc.head.appendChild(node.cloneNode(true));
    });

    doc.documentElement.style.margin = '0';
    doc.documentElement.style.padding = '0';
    doc.documentElement.style.width = '100%';
    doc.documentElement.style.height = '100%';
    doc.documentElement.style.overflow = 'hidden';

    doc.body.innerHTML = '';
    doc.body.style.margin = '0';
    doc.body.style.padding = '0';
    doc.body.style.overflow = 'hidden';
    doc.body.style.background = '#020617';
    doc.body.style.width = '100%';
    doc.body.style.height = '100%';

    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    element.style.right = '0';
    element.style.bottom = '0';
    element.style.width = '100%';
    element.style.height = '100%';

    doc.body.appendChild(element);
    return true;
  } catch {
    restoreParent = null;
    closedListener = null;
    return false;
  }
}

export function restoreFromDocumentPip(): void {
  const pipApi = isDocumentPipSupported() ? window.documentPictureInPicture : null;
  const pipWindow = pipApi?.window;

  if (pipWindow && closedListener) {
    pipWindow.removeEventListener('pagehide', closedListener);
    closedListener = null;
  }

  if (pipWindow && restoreParent) {
    const moved = pipWindow.document.body.firstElementChild as HTMLElement | null;
    if (moved) {
      moved.style.position = '';
      moved.style.left = '';
      moved.style.top = '';
      moved.style.width = '';
      moved.style.height = '';
      restoreParent.appendChild(moved);
    }
  }

  if (pipWindow && !pipWindow.closed) {
    pipWindow.close();
  }

  restoreParent = null;
}

declare global {
  interface Window {
    documentPictureInPicture: {
      window: Window | null;
      requestWindow: (options: {
        width?: number;
        height?: number;
        preferInitialWindowPlacement?: boolean;
      }) => Promise<Window>;
    };
  }
}
