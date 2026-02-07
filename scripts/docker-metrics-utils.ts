/**
 * Docker build metrics utilities
 * Pure functions for parsing and formatting Docker build metrics
 */

export interface Layer {
  createdBy: string;
  size: string;
  sizeBytes?: number;
}

export interface Metrics {
  timestamp: string;
  buildTime: number;
  imageSize: string;
  imageSizeBytes: number;
  layers: Layer[];
  layerCount: number;
  success: boolean;
  dockerfile: string;
  gitCommit: string;
}

export interface ComparisonReport {
  before: Metrics;
  after: Metrics;
  timeDelta: number;
  timePercentage: number;
  sizeDelta: number;
  sizePercentage: number;
  layerDelta: number;
}

/**
 * Parse docker history output into layer objects
 * Expected format: "CREATED_BY<tab>SIZE"
 */
export function parseDockerHistory(historyOutput: string): Layer[] {
  if (!historyOutput.trim()) {
    return [];
  }

  return historyOutput
    .trim()
    .split('\n')
    .map(line => {
      const [createdBy, size] = line.split('\t');
      return { createdBy, size };
    });
}

/**
 * Parse build time from `time` command output
 * Expected format includes "real 1m23.456s" or "0m45.123s"
 */
export function parseBuildTime(timeOutput: string): number {
  const realLine = timeOutput.split('\n').find(line => line.includes('real'));
  if (!realLine) {
    throw new Error('Could not find "real" time in output');
  }

  // Extract time like "1m23.456s" or "0m45.123s"
  const match = realLine.match(/(\d+)m([\d.]+)s/);
  if (!match) {
    throw new Error('Could not parse time format');
  }

  const minutes = parseInt(match[1], 10);
  const seconds = parseFloat(match[2]);

  return minutes * 60 + seconds;
}

/**
 * Compare two metrics objects and return a comparison report
 */
export function compareMetrics(before: Metrics, after: Metrics): ComparisonReport {
  const timeDelta = after.buildTime - before.buildTime;
  const timePercentage = (timeDelta / before.buildTime) * 100;
  
  const sizeDelta = after.imageSizeBytes - before.imageSizeBytes;
  const sizePercentage = (sizeDelta / before.imageSizeBytes) * 100;
  
  const layerDelta = after.layerCount - before.layerCount;

  return {
    before,
    after,
    timeDelta,
    timePercentage,
    sizeDelta,
    sizePercentage,
    layerDelta,
  };
}

/**
 * Format metrics as a human-readable summary
 */
export function formatSummary(metrics: Metrics): string {
  const status = metrics.success ? 'SUCCESS' : 'FAILED';
  
  return `=== Docker Build Metrics ===
Time:    ${metrics.buildTime}s
Size:    ${metrics.imageSize}
Layers:  ${metrics.layerCount}
Commit:  ${metrics.gitCommit}
Status:  ${status}`;
}

/**
 * Format comparison report with deltas and +/- signs
 */
export function formatComparison(report: ComparisonReport): string {
  const RED = '\x1b[31m';
  const GREEN = '\x1b[32m';
  const RESET = '\x1b[0m';

  const formatDelta = (delta: number, suffix: string, isRegression: boolean) => {
    const sign = delta > 0 ? '+' : '';
    const color = isRegression ? RED : GREEN;
    return `${color}${sign}${delta.toFixed(1)}${suffix}${RESET}`;
  };

  const formatPercentage = (percentage: number, isRegression: boolean) => {
    const sign = percentage > 0 ? '+' : '';
    const color = isRegression ? RED : GREEN;
    return `${color}${sign}${percentage.toFixed(1)}%${RESET}`;
  };

  // For time and size: positive delta is regression (bad), negative is improvement (good)
  const timeIsRegression = report.timeDelta > 0;
  const sizeIsRegression = report.sizeDelta > 0;

  const timeDeltaStr = formatDelta(report.timeDelta, 's', timeIsRegression);
  const timePercentageStr = formatPercentage(report.timePercentage, timeIsRegression);

  const sizeDeltaBytes = report.sizeDelta;
  const sizeDeltaMB = sizeDeltaBytes / (1024 * 1024);
  const sizeDeltaStr = formatDelta(sizeDeltaMB, 'MB', sizeIsRegression);
  const sizePercentageStr = formatPercentage(report.sizePercentage, sizeIsRegression);

  const layerSign = report.layerDelta > 0 ? '+' : '';
  const layerStr = `${layerSign}${report.layerDelta} layer${Math.abs(report.layerDelta) !== 1 ? 's' : ''}`;

  return `=== Build Comparison ===
Time:   ${timeDeltaStr} (${timePercentageStr})
Size:   ${sizeDeltaStr} (${sizePercentageStr})
Layers: ${layerStr}`;
}
