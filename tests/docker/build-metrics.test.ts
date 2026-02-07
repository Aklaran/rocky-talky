import { describe, it, expect } from 'vitest';
import {
  parseDockerHistory,
  parseBuildTime,
  compareMetrics,
  formatSummary,
  formatComparison,
  type Metrics,
  type Layer,
} from '../../scripts/docker-metrics-utils';

describe('parseDockerHistory', () => {
  it('extracts layer command and size', () => {
    const historyOutput = 'COPY --from=builder /app /app\t450MB';
    const layers = parseDockerHistory(historyOutput);
    
    expect(layers).toHaveLength(1);
    expect(layers[0].createdBy).toBe('COPY --from=builder /app /app');
    expect(layers[0].size).toBe('450MB');
  });

  it('handles multi-line output', () => {
    const historyOutput = `COPY --from=builder /app /app\t450MB
RUN apt-get update\t120MB
ADD package.json .\t5.2kB
CMD ["node", "server.js"]\t0B`;
    
    const layers = parseDockerHistory(historyOutput);
    
    expect(layers).toHaveLength(4);
    expect(layers[0].createdBy).toBe('COPY --from=builder /app /app');
    expect(layers[0].size).toBe('450MB');
    expect(layers[1].createdBy).toBe('RUN apt-get update');
    expect(layers[1].size).toBe('120MB');
    expect(layers[2].createdBy).toBe('ADD package.json .');
    expect(layers[2].size).toBe('5.2kB');
    expect(layers[3].createdBy).toBe('CMD ["node", "server.js"]');
    expect(layers[3].size).toBe('0B');
  });

  it('handles empty output', () => {
    const layers = parseDockerHistory('');
    expect(layers).toHaveLength(0);
  });
});

describe('parseBuildTime', () => {
  it('extracts seconds from time output with minutes', () => {
    const timeOutput = `real\t1m23.456s
user\t0m5.123s
sys\t0m2.789s`;
    
    const seconds = parseBuildTime(timeOutput);
    expect(seconds).toBeCloseTo(83.456, 3);
  });

  it('extracts seconds from time output without minutes', () => {
    const timeOutput = `real\t0m45.123s
user\t0m3.456s
sys\t0m1.234s`;
    
    const seconds = parseBuildTime(timeOutput);
    expect(seconds).toBeCloseTo(45.123, 3);
  });

  it('handles time output with multiple minutes', () => {
    const timeOutput = `real\t15m30.250s
user\t10m5.000s
sys\t2m3.500s`;
    
    const seconds = parseBuildTime(timeOutput);
    expect(seconds).toBeCloseTo(930.250, 3);
  });
});

describe('compareMetrics', () => {
  const beforeMetrics: Metrics = {
    timestamp: '2026-02-06T22:00:00Z',
    buildTime: 70.2,
    imageSize: '870MB',
    imageSizeBytes: 912261120,
    layers: [],
    layerCount: 8,
    success: true,
    dockerfile: 'docker/Dockerfile',
    gitCommit: 'abc1234',
  };

  const afterMetrics: Metrics = {
    timestamp: '2026-02-06T22:30:00Z',
    buildTime: 85.5,
    imageSize: '950MB',
    imageSizeBytes: 996147200,
    layers: [],
    layerCount: 9,
    success: true,
    dockerfile: 'docker/Dockerfile',
    gitCommit: 'def5678',
  };

  it('calculates size delta and percentage', () => {
    const report = compareMetrics(beforeMetrics, afterMetrics);
    
    expect(report.sizeDelta).toBe(996147200 - 912261120);
    expect(report.sizePercentage).toBeCloseTo(9.19, 1);
  });

  it('calculates time delta and percentage', () => {
    const report = compareMetrics(beforeMetrics, afterMetrics);
    
    expect(report.timeDelta).toBeCloseTo(15.3, 1);
    expect(report.timePercentage).toBeCloseTo(21.8, 1);
  });

  it('calculates layer delta', () => {
    const report = compareMetrics(beforeMetrics, afterMetrics);
    
    expect(report.layerDelta).toBe(1);
  });

  it('includes before and after metrics', () => {
    const report = compareMetrics(beforeMetrics, afterMetrics);
    
    expect(report.before).toBe(beforeMetrics);
    expect(report.after).toBe(afterMetrics);
  });

  it('handles negative deltas (improvements)', () => {
    const improvedMetrics: Metrics = {
      ...afterMetrics,
      buildTime: 60.0,
      imageSizeBytes: 800000000,
    };
    
    const report = compareMetrics(beforeMetrics, improvedMetrics);
    
    expect(report.timeDelta).toBeCloseTo(-10.2, 1);
    expect(report.timePercentage).toBeCloseTo(-14.5, 1);
    expect(report.sizeDelta).toBeLessThan(0);
    expect(report.sizePercentage).toBeCloseTo(-12.3, 1);
  });
});

describe('formatSummary', () => {
  it('produces readable output', () => {
    const metrics: Metrics = {
      timestamp: '2026-02-06T22:30:00Z',
      buildTime: 70.2,
      imageSize: '870MB',
      imageSizeBytes: 912261120,
      layers: [],
      layerCount: 8,
      success: true,
      dockerfile: 'docker/Dockerfile',
      gitCommit: 'abc1234',
    };
    
    const summary = formatSummary(metrics);
    
    expect(summary).toContain('=== Docker Build Metrics ===');
    expect(summary).toContain('Time:    70.2s');
    expect(summary).toContain('Size:    870MB');
    expect(summary).toContain('Layers:  8');
    expect(summary).toContain('Commit:  abc1234');
    expect(summary).toContain('Status:  SUCCESS');
  });

  it('shows FAILED status for failed builds', () => {
    const metrics: Metrics = {
      timestamp: '2026-02-06T22:30:00Z',
      buildTime: 0,
      imageSize: '0B',
      imageSizeBytes: 0,
      layers: [],
      layerCount: 0,
      success: false,
      dockerfile: 'docker/Dockerfile',
      gitCommit: 'abc1234',
    };
    
    const summary = formatSummary(metrics);
    
    expect(summary).toContain('Status:  FAILED');
  });
});

describe('formatComparison', () => {
  const beforeMetrics: Metrics = {
    timestamp: '2026-02-06T22:00:00Z',
    buildTime: 70.2,
    imageSize: '870MB',
    imageSizeBytes: 912261120,
    layers: [],
    layerCount: 8,
    success: true,
    dockerfile: 'docker/Dockerfile',
    gitCommit: 'abc1234',
  };

  const afterMetrics: Metrics = {
    timestamp: '2026-02-06T22:30:00Z',
    buildTime: 85.5,
    imageSize: '950MB',
    imageSizeBytes: 996147200,
    layers: [],
    layerCount: 9,
    success: true,
    dockerfile: 'docker/Dockerfile',
    gitCommit: 'def5678',
  };

  it('shows deltas with +/- signs', () => {
    const report = compareMetrics(beforeMetrics, afterMetrics);
    const comparison = formatComparison(report);
    
    expect(comparison).toContain('+15.3s');
    expect(comparison).toContain('+21.8%');
    expect(comparison).toContain('+1 layer');
  });

  it('shows improvements with minus sign', () => {
    const improvedMetrics: Metrics = {
      ...afterMetrics,
      buildTime: 60.0,
      imageSizeBytes: 800000000,
      imageSize: '800MB',
    };
    
    const report = compareMetrics(beforeMetrics, improvedMetrics);
    const comparison = formatComparison(report);
    
    expect(comparison).toContain('-10.2s');
    expect(comparison).toContain('-14.5%');
  });

  it('highlights regressions in red (ANSI)', () => {
    const report = compareMetrics(beforeMetrics, afterMetrics);
    const comparison = formatComparison(report);
    
    // ANSI red color code is \x1b[31m
    expect(comparison).toContain('\x1b[31m');
    // ANSI reset code is \x1b[0m
    expect(comparison).toContain('\x1b[0m');
  });

  it('highlights improvements in green (ANSI)', () => {
    const improvedMetrics: Metrics = {
      ...afterMetrics,
      buildTime: 60.0,
      imageSizeBytes: 800000000,
      imageSize: '800MB',
    };
    
    const report = compareMetrics(beforeMetrics, improvedMetrics);
    const comparison = formatComparison(report);
    
    // ANSI green color code is \x1b[32m
    expect(comparison).toContain('\x1b[32m');
  });
});
