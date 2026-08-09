export const PIP_WIDTH = 400;
export const PIP_HEIGHT = 276;
export const PIP_MARGIN = 16;

export type PipPosition = {
  x: number;
  y: number;
};

export function defaultPipPosition(
  width = PIP_WIDTH,
  height = PIP_HEIGHT,
  margin = PIP_MARGIN,
): PipPosition {
  if (typeof window === 'undefined') {
    return { x: margin, y: margin };
  }

  return clampPipPosition(
    window.innerWidth - width - margin,
    window.innerHeight - height - margin,
    width,
    height,
    margin,
  );
}

export function clampPipPosition(
  x: number,
  y: number,
  width = PIP_WIDTH,
  height = PIP_HEIGHT,
  margin = PIP_MARGIN,
): PipPosition {
  if (typeof window === 'undefined') {
    return { x, y };
  }

  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);

  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  };
}
